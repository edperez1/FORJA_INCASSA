-- ============================================================================
--  INCASA · Sistema de Pesaje · esquema inicial
--  ---------------------------------------------------------------------------
--  Lo aplica Flyway al arrancar el backend. NO se edita una vez aplicado en
--  planta: cualquier cambio va en un V2__…sql nuevo.
--
--  Convenciones
--    · Fecha y hora siempre juntas, en DATETIMEOFFSET (UTC). Los "días" de los
--      filtros se cuentan en hora de Nicaragua (ver comun/Planta.java).
--    · Los catálogos se desactivan (activo = 0), nunca se borran: un producto
--      retirado no puede dejar producciones antiguas sin nombre.
--    · Nada operativo se borra: producciones y pesajes se ANULAN.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  ROLES · lista cerrada. Los permisos de cada uno viven en usuario/Rol.java.
-- ---------------------------------------------------------------------------
CREATE TABLE rol (
    codigo  NVARCHAR(20)  NOT NULL,
    nombre  NVARCHAR(60)  NOT NULL,
    orden   INT           NOT NULL,
    CONSTRAINT pk_rol PRIMARY KEY (codigo)
);

INSERT INTO rol (codigo, nombre, orden) VALUES
    ('PROPIETARIO',   N'Propietario del sistema', 1),
    ('ADMINISTRADOR', N'Administrador',           2),
    ('SUPERVISOR',    N'Supervisor de planta',    3),
    ('OPERARIO',      N'Operario de báscula',     4),
    ('CALIDAD',       N'Control de calidad',      5);

-- ---------------------------------------------------------------------------
--  USUARIOS
--  Sólo existe un PROPIETARIO: se crea en la configuración inicial y el resto
--  de cuentas las crean el propietario o los administradores.
-- ---------------------------------------------------------------------------
CREATE TABLE usuario (
    id              BIGINT        IDENTITY(1,1) NOT NULL,
    usuario         NVARCHAR(40)  NOT NULL,
    nombres         NVARCHAR(80)  NOT NULL,
    apellidos       NVARCHAR(80)  NOT NULL,
    correo          NVARCHAR(160) NULL,
    rol             NVARCHAR(20)  NOT NULL,
    clave_hash      NVARCHAR(100) NOT NULL,     -- BCrypt, nunca texto plano
    activo          BIT           NOT NULL,
    creado_en       DATETIMEOFFSET(3) NOT NULL,
    creado_por      NVARCHAR(40)  NULL,
    ultimo_ingreso  DATETIMEOFFSET(3) NULL,
    CONSTRAINT pk_usuario          PRIMARY KEY (id),
    CONSTRAINT uq_usuario_usuario  UNIQUE (usuario),
    CONSTRAINT fk_usuario_rol      FOREIGN KEY (rol) REFERENCES rol (codigo)
);

-- ---------------------------------------------------------------------------
--  SESIONES · sólo el SHA-256 del token.
-- ---------------------------------------------------------------------------
CREATE TABLE sesion (
    token_hash  CHAR(64)      NOT NULL,
    usuario_id  BIGINT        NOT NULL,
    creada_en   DATETIMEOFFSET(3) NOT NULL,
    caduca_en   DATETIMEOFFSET(3) NOT NULL,
    CONSTRAINT pk_sesion         PRIMARY KEY (token_hash),
    CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuario (id)
);

CREATE INDEX ix_sesion_caduca ON sesion (caduca_en);

-- ---------------------------------------------------------------------------
--  CATÁLOGOS
-- ---------------------------------------------------------------------------

-- Áreas de planta: sirven como área de PROCESO y como área de DESTINO.
CREATE TABLE area (
    id             BIGINT        IDENTITY(1,1) NOT NULL,
    nombre         NVARCHAR(80)  NOT NULL,
    observaciones  NVARCHAR(300) NULL,
    activo         BIT           NOT NULL,
    CONSTRAINT pk_area         PRIMARY KEY (id),
    CONSTRAINT uq_area_nombre  UNIQUE (nombre)
);

-- Lo que se fabrica con la bobina.
CREATE TABLE producto (
    id             BIGINT        IDENTITY(1,1) NOT NULL,
    nombre         NVARCHAR(80)  NOT NULL,
    observaciones  NVARCHAR(300) NULL,
    activo         BIT           NOT NULL,
    CONSTRAINT pk_producto         PRIMARY KEY (id),
    CONSTRAINT uq_producto_nombre  UNIQUE (nombre)
);

-- Tipo de bobina / materia prima.
CREATE TABLE materia (
    id             BIGINT        IDENTITY(1,1) NOT NULL,
    nombre         NVARCHAR(80)  NOT NULL,
    observaciones  NVARCHAR(300) NULL,
    activo         BIT           NOT NULL,
    CONSTRAINT pk_materia         PRIMARY KEY (id),
    CONSTRAINT uq_materia_nombre  UNIQUE (nombre)
);

-- Unidad en que se mide la CANTIDAD a producir (no el peso: el peso es kg).
CREATE TABLE unidad_medida (
    id             BIGINT        IDENTITY(1,1) NOT NULL,
    nombre         NVARCHAR(40)  NOT NULL,
    codigo         NVARCHAR(10)  NOT NULL,
    observaciones  NVARCHAR(300) NULL,
    activo         BIT           NOT NULL,
    CONSTRAINT pk_unidad_medida         PRIMARY KEY (id),
    CONSTRAINT uq_unidad_medida_codigo  UNIQUE (codigo)
);

-- Básculas. El sistema trabaja con la báscula activa (hoy una sola).
CREATE TABLE bascula (
    id            BIGINT        IDENTITY(1,1) NOT NULL,
    codigo        NVARCHAR(20)  NOT NULL,
    marca         NVARCHAR(60)  NOT NULL,
    modelo        NVARCHAR(60)  NOT NULL,
    capacidad_kg  DECIMAL(8,1)  NOT NULL,
    division_kg   DECIMAL(4,2)  NOT NULL,
    area_id       BIGINT        NULL,
    activa        BIT           NOT NULL,
    CONSTRAINT pk_bascula         PRIMARY KEY (id),
    CONSTRAINT uq_bascula_codigo  UNIQUE (codigo),
    CONSTRAINT fk_bascula_area    FOREIGN KEY (area_id) REFERENCES area (id),
    CONSTRAINT ck_bascula_valores CHECK (capacidad_kg > 0 AND division_kg > 0)
);

-- Datos de partida. Los administradores los amplían desde el panel.
INSERT INTO area (nombre, observaciones, activo) VALUES
    (N'Refinado', NULL, 1);

INSERT INTO producto (nombre, observaciones, activo) VALUES
    (N'Clavos',        NULL, 1),
    (N'Alambre dulce', NULL, 1),
    (N'Alambre de púas', NULL, 1),
    (N'Herradura',     NULL, 1),
    (N'Malla',         NULL, 1);

INSERT INTO materia (nombre, observaciones, activo) VALUES
    (N'Bobina de alambrón', NULL, 1);

INSERT INTO unidad_medida (nombre, codigo, observaciones, activo) VALUES
    (N'Kilogramo', N'kg',  NULL, 1),
    (N'Pie',       N'pie', NULL, 1),
    (N'Unidad',    N'und', NULL, 1);

INSERT INTO bascula (codigo, marca, modelo, capacidad_kg, division_kg, area_id, activa) VALUES
    (N'BASC-01', N'Hiweight', N'X10', 4600.0, 0.5, NULL, 1);

-- ---------------------------------------------------------------------------
--  PRODUCCIÓN · el proceso que transforma una bobina en producto.
--
--    PROCESO → TERMINADO     (lo normal)
--    PROCESO → ANULADA       (sólo sin pesajes vigentes)
--
--  kg de entrada y de salida NO se guardan aquí: se suman de sus pesajes
--  vigentes, así la merma siempre cuadra con lo que marcó la báscula.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE seq_produccion START WITH 1 INCREMENT BY 1;

CREATE TABLE produccion (
    id                BIGINT        IDENTITY(1,1) NOT NULL,
    codigo            NVARCHAR(12)  NOT NULL,          -- PR-000001
    orden_trabajo     NVARCHAR(40)  NULL,
    producto_id       BIGINT        NOT NULL,
    materia_id        BIGINT        NOT NULL,
    cantidad          DECIMAL(12,2) NOT NULL,
    unidad_id         BIGINT        NOT NULL,
    area_proceso_id   BIGINT        NOT NULL,
    area_destino_id   BIGINT        NOT NULL,
    estado            NVARCHAR(12)  NOT NULL,
    inicio_en         DATETIMEOFFSET(3) NOT NULL,
    fin_en            DATETIMEOFFSET(3) NULL,
    abierta_por_id    BIGINT        NOT NULL,
    abierta_por       NVARCHAR(170) NOT NULL,
    terminada_por_id  BIGINT        NULL,
    terminada_por     NVARCHAR(170) NULL,
    observaciones     NVARCHAR(500) NULL,
    modificado_en     DATETIMEOFFSET(3) NULL,
    modificado_por    NVARCHAR(40)  NULL,
    anulado_en        DATETIMEOFFSET(3) NULL,
    anulado_por       NVARCHAR(40)  NULL,
    motivo_anulacion  NVARCHAR(300) NULL,
    CONSTRAINT pk_produccion          PRIMARY KEY (id),
    CONSTRAINT uq_produccion_codigo   UNIQUE (codigo),
    CONSTRAINT fk_produccion_producto FOREIGN KEY (producto_id)     REFERENCES producto (id),
    CONSTRAINT fk_produccion_materia  FOREIGN KEY (materia_id)      REFERENCES materia (id),
    CONSTRAINT fk_produccion_unidad   FOREIGN KEY (unidad_id)       REFERENCES unidad_medida (id),
    CONSTRAINT fk_produccion_proceso  FOREIGN KEY (area_proceso_id) REFERENCES area (id),
    CONSTRAINT fk_produccion_destino  FOREIGN KEY (area_destino_id) REFERENCES area (id),
    CONSTRAINT fk_produccion_abrio    FOREIGN KEY (abierta_por_id)  REFERENCES usuario (id),
    CONSTRAINT fk_produccion_termino  FOREIGN KEY (terminada_por_id) REFERENCES usuario (id),
    CONSTRAINT ck_produccion_estado   CHECK (estado IN ('PROCESO', 'TERMINADO', 'ANULADA')),
    CONSTRAINT ck_produccion_cantidad CHECK (cantidad > 0),
    CONSTRAINT ck_produccion_fin      CHECK ((estado = 'PROCESO' AND fin_en IS NULL)
                                          OR (estado <> 'PROCESO' AND fin_en IS NOT NULL))
);

CREATE INDEX ix_produccion_estado ON produccion (estado, inicio_en);
CREATE INDEX ix_produccion_inicio ON produccion (inicio_en);

-- ---------------------------------------------------------------------------
--  PESAJES · cada pesada certificada de una producción.
--    ENTRADA → la bobina que entra al proceso (lleva código de bobina)
--    SALIDA  → lo producido
--  El peso no se edita nunca; DELETE anula.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE seq_folio START WITH 1 INCREMENT BY 1;

CREATE TABLE pesaje (
    id                BIGINT        IDENTITY(1,1) NOT NULL,
    folio             NVARCHAR(12)  NOT NULL,          -- CP-000001
    produccion_id     BIGINT        NOT NULL,
    tipo              NVARCHAR(8)   NOT NULL,
    codigo_bobina     NVARCHAR(40)  NULL,
    peso_bruto        DECIMAL(7,1)  NOT NULL,
    tara              DECIMAL(7,1)  NOT NULL,
    peso_neto         DECIMAL(7,1)  NOT NULL,
    unidad            NVARCHAR(4)   NOT NULL,
    estable           BIT           NOT NULL,
    origen_lectura    NVARCHAR(20)  NOT NULL,
    bascula_id        BIGINT        NOT NULL,
    operario_id       BIGINT        NOT NULL,
    operario          NVARCHAR(170) NOT NULL,
    capturado_en      DATETIMEOFFSET(3) NOT NULL,
    creado_en         DATETIMEOFFSET(3) NOT NULL,
    observaciones     NVARCHAR(500) NULL,
    modificado_en     DATETIMEOFFSET(3) NULL,
    modificado_por    NVARCHAR(40)  NULL,
    anulado_en        DATETIMEOFFSET(3) NULL,
    anulado_por       NVARCHAR(40)  NULL,
    motivo_anulacion  NVARCHAR(300) NULL,
    CONSTRAINT pk_pesaje            PRIMARY KEY (id),
    CONSTRAINT uq_pesaje_folio      UNIQUE (folio),
    CONSTRAINT fk_pesaje_produccion FOREIGN KEY (produccion_id) REFERENCES produccion (id),
    CONSTRAINT fk_pesaje_bascula    FOREIGN KEY (bascula_id)    REFERENCES bascula (id),
    CONSTRAINT fk_pesaje_operario   FOREIGN KEY (operario_id)   REFERENCES usuario (id),
    CONSTRAINT ck_pesaje_tipo       CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    CONSTRAINT ck_pesaje_bobina     CHECK (tipo <> 'ENTRADA' OR codigo_bobina IS NOT NULL),
    CONSTRAINT ck_pesaje_origen     CHECK (origen_lectura IN ('conectada', 'simulador', 'manual')),
    CONSTRAINT ck_pesaje_unidad     CHECK (unidad = 'kg'),
    CONSTRAINT ck_pesaje_pesos      CHECK (peso_bruto > 0 AND tara >= 0 AND tara < peso_bruto
                                           AND peso_neto = peso_bruto - tara)
);

CREATE INDEX ix_pesaje_produccion ON pesaje (produccion_id, tipo);
CREATE INDEX ix_pesaje_capturado  ON pesaje (capturado_en);
CREATE INDEX ix_pesaje_bobina     ON pesaje (codigo_bobina);

-- ---------------------------------------------------------------------------
--  AUDITORÍA · quién hizo qué y cuándo, en lo que importa a una revisión:
--  cuentas, roles, catálogos, anulaciones y cierres de producción.
-- ---------------------------------------------------------------------------
CREATE TABLE auditoria (
    id          BIGINT        IDENTITY(1,1) NOT NULL,
    en          DATETIMEOFFSET(3) NOT NULL,
    usuario_id  BIGINT        NULL,
    usuario     NVARCHAR(40)  NOT NULL,
    accion      NVARCHAR(40)  NOT NULL,
    entidad     NVARCHAR(30)  NOT NULL,
    entidad_id  BIGINT        NULL,
    detalle     NVARCHAR(500) NULL,
    CONSTRAINT pk_auditoria PRIMARY KEY (id)
);

CREATE INDEX ix_auditoria_en ON auditoria (en);
