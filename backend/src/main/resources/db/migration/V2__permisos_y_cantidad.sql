-- ============================================================================
--  V2 · Permisos editables por rol y cantidad producida por salida
-- ============================================================================

-- ---------------------------------------------------------------------------
--  PERMISOS · catálogo cerrado. Los `fijo = 1` son del propietario y no se
--  pueden asignar a otro rol: si no, alguien podría quitarle el control.
-- ---------------------------------------------------------------------------
CREATE TABLE permiso (
    codigo       NVARCHAR(40)  NOT NULL,
    nombre       NVARCHAR(80)  NOT NULL,
    descripcion  NVARCHAR(200) NOT NULL,
    fijo         BIT           NOT NULL,
    orden        INT           NOT NULL,
    CONSTRAINT pk_permiso PRIMARY KEY (codigo)
);

INSERT INTO permiso (codigo, nombre, descripcion, fijo, orden) VALUES
    ('ABRIR_PRODUCCION',          N'Abrir producciones',       N'Abrir una producción nueva: producto, materia, cantidad y áreas', 0, 1),
    ('PESAR',                     N'Pesar',                    N'Registrar pesajes de entrada y de salida', 0, 2),
    ('TERMINAR_PRODUCCION',       N'Terminar producciones',    N'Cerrar una producción con su entrada y su salida', 0, 3),
    ('CORREGIR',                  N'Corregir y anular',        N'Corregir datos de producciones y pesajes, y anularlos', 0, 4),
    ('CONSULTAR',                 N'Consultar',                N'Ver producciones, historial y reportes', 0, 5),
    ('GESTIONAR_USUARIOS',        N'Gestionar usuarios',       N'Crear, editar y desactivar cuentas (salvo administradores)', 0, 6),
    ('GESTIONAR_CATALOGOS',       N'Gestionar catálogos',      N'Áreas, productos, materias, unidades y báscula', 0, 7),
    ('VER_AUDITORIA',             N'Ver auditoría',            N'Consultar el registro de auditoría', 0, 8),
    ('GESTIONAR_ADMINISTRADORES', N'Gestionar administradores', N'Crear y editar administradores', 1, 9),
    ('GESTIONAR_PERMISOS',        N'Gestionar permisos',       N'Decidir qué puede hacer cada rol', 1, 10);

-- Qué permisos tiene cada rol. El PROPIETARIO no aparece: los tiene todos
-- siempre, por código (usuario/Permisos.java), y nadie puede quitárselos.
CREATE TABLE rol_permiso (
    rol      NVARCHAR(20) NOT NULL,
    permiso  NVARCHAR(40) NOT NULL,
    CONSTRAINT pk_rol_permiso         PRIMARY KEY (rol, permiso),
    CONSTRAINT fk_rol_permiso_rol     FOREIGN KEY (rol)     REFERENCES rol (codigo),
    CONSTRAINT fk_rol_permiso_permiso FOREIGN KEY (permiso) REFERENCES permiso (codigo),
    CONSTRAINT ck_rol_permiso_rol     CHECK (rol <> 'PROPIETARIO')
);

INSERT INTO rol_permiso (rol, permiso) VALUES
    ('ADMINISTRADOR', 'ABRIR_PRODUCCION'),
    ('ADMINISTRADOR', 'CONSULTAR'),
    ('ADMINISTRADOR', 'GESTIONAR_USUARIOS'),
    ('ADMINISTRADOR', 'GESTIONAR_CATALOGOS'),
    ('ADMINISTRADOR', 'VER_AUDITORIA'),
    ('SUPERVISOR',    'PESAR'),
    ('SUPERVISOR',    'TERMINAR_PRODUCCION'),
    ('SUPERVISOR',    'CORREGIR'),
    ('SUPERVISOR',    'CONSULTAR'),
    ('OPERARIO',      'PESAR'),
    ('OPERARIO',      'TERMINAR_PRODUCCION'),
    ('OPERARIO',      'CONSULTAR'),
    ('CALIDAD',       'CONSULTAR');

-- ---------------------------------------------------------------------------
--  CANTIDAD PRODUCIDA · cuánto producto dejó cada pesaje de SALIDA, en la
--  unidad de medida de su producción (clavos, pies, kg…). Las entradas no
--  llevan cantidad: son bobina, no producto.
-- ---------------------------------------------------------------------------
ALTER TABLE pesaje ADD cantidad DECIMAL(12,2) NULL;
-- Se rellena y se restringe en V3: SQL Server no deja usar una columna en
-- el mismo lote en que se crea.
