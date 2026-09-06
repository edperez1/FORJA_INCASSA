/* ============================================================================
 *  INCASA · js/mock-data.js
 *  ---------------------------------------------------------------------------
 *  Datos de prueba y su «base de datos» en memoria.
 *
 *  ⚠️  TODO: ELIMINAR ESTE ARCHIVO al conectar el backend de Java.
 *      api.js deja de importarlo en cuanto API.MODO pasa a 'produccion'.
 *
 *  Son exactamente 10 registros escritos a mano, no generados al azar: pesos,
 *  horas y observaciones responden a una jornada real de planta, de forma que
 *  los reportes (hora pico, reparto por material, tonelaje) muestren cifras
 *  con sentido en lugar de ruido.
 *  ==========================================================================*/

/** Código de planta de la demo. En producción lo valida el backend. */
const CODIGO_PLANTA = 'INCASA-2026';

export const MockData = {

  /* ======================================================================
   *  CATÁLOGOS
   *  Espejo de: GET /catalogos/materiales · GET /catalogos/basculas
   * ====================================================================*/

  materiales: [
    {
      codigo: 'BOBINA_ALAMBRON',
      nombre: 'Bobina de Alambrón',
      descripcion: 'Rollo de alambrón de acero, materia prima de trefilado',
      icono: 'disc-3'
    },
    {
      codigo: 'PRODUCTO_SEMIELABORADO',
      nombre: 'Producto Semielaborado',
      descripcion: 'Material en proceso entre etapas de la línea',
      icono: 'package'
    }
  ],

  basculas: [
    { codigo: 'BASC-01', nombre: 'BASC-01 · Recepción de materia prima' },
    { codigo: 'BASC-02', nombre: 'BASC-02 · Línea de trefilado' },
    { codigo: 'BASC-03', nombre: 'BASC-03 · Patio de bobinas' },
    { codigo: 'BASC-04', nombre: 'BASC-04 · Despacho' }
  ],

  /* ======================================================================
   *  ESTADO EN MEMORIA
   * ====================================================================*/

  registros: [],
  usuarios: [],
  _folio: 4810,
  _idUsuario: 12,

  siguienteFolio() {
    this._folio += 1;
    return 'CP-' + String(this._folio).padStart(6, '0');   // CP = Certificado de Pesaje
  },

  /* ======================================================================
   *  1 · AUTENTICACIÓN  (espejo de /auth/login y /auth/registro)
   * ====================================================================*/

  /**
   * MODO PRUEBAS: si el usuario existe en el registro local se comprueba su
   * clave; si no existe, se deja entrar igual para que la demo sea usable sin
   * darse de alta primero. El backend de Java, evidentemente, no hará esto.
   */
  autenticar({ usuario, clave, bascula }) {
    const registrado = this.usuarios.find(
      u => u.usuario.toLowerCase() === String(usuario || '').toLowerCase()
    );

    if (registrado) {
      if (registrado.clave !== clave) {
        const error = new Error('Usuario o contraseña incorrectos');
        error.codigo = 'CREDENCIALES_INVALIDAS';
        throw error;
      }
      return this._sesion({ ...registrado.perfil, bascula: bascula || registrado.perfil.bascula });
    }

    const nombre = usuario
      ? usuario.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Operario Demo';

    return this._sesion({
      id: 1,
      usuario: usuario || 'demo',
      nombre,
      rol: 'Operario de báscula',
      correo: (usuario || 'demo') + '@incasa.com.ni',
      bascula: bascula || 'BASC-01'
    });
  },

  /** Espejo de POST /auth/registro. Valida lo mismo que validará Java. */
  registrar({ nombre, usuario, correo, clave, rol, bascula, codigoPlanta }) {
    const yaExiste = this.usuarios.some(
      u => u.usuario.toLowerCase() === String(usuario).toLowerCase()
    );
    if (yaExiste) {
      const error = new Error('Ese usuario ya está registrado en la planta');
      error.codigo = 'USUARIO_EXISTENTE';
      throw error;
    }

    if (codigoPlanta !== CODIGO_PLANTA) {
      const error = new Error(`El código de planta no es válido (para la demo: ${CODIGO_PLANTA})`);
      error.codigo = 'CODIGO_PLANTA_INVALIDO';
      throw error;
    }

    this._idUsuario += 1;
    const perfil = {
      id: this._idUsuario,
      usuario,
      nombre,
      rol: rol || 'Operario de báscula',
      correo,
      bascula: bascula || 'BASC-01'
    };

    this.usuarios.push({ usuario, clave, perfil });
    return this._sesion(perfil);
  },

  /** Arma la respuesta { token, expiraEn, usuario } común a login y registro. */
  _sesion(perfil) {
    return {
      token: 'demo-token-' + Date.now(),
      expiraEn: 28800,
      usuario: { ...perfil, unidad: 'kg', ingreso: new Date().toISOString() }
    };
  },

  /* ======================================================================
   *  2 · PESAJES · CRUD  (espejo de /pesajes)
   * ====================================================================*/

  /** POST /pesajes */
  crear(pesaje) {
    const registro = {
      ...pesaje,
      id: Date.now(),
      folio: this.siguienteFolio(),
      creadoEn: new Date().toISOString()
    };
    this.registros.unshift(registro);
    return registro;
  },

  buscarPorId(id) {
    return this.registros.find(r => String(r.id) === String(id)) || null;
  },

  /**
   * PUT /pesajes/{id}
   * Sólo se aceptan los campos de identificación. El peso es la lectura
   * certificada de la celda de carga y no se modifica jamás desde la interfaz.
   */
  actualizar(id, cambios) {
    const registro = this.buscarPorId(id);
    if (!registro) {
      const error = new Error('El pesaje no existe');
      error.codigo = 'NO_ENCONTRADO';
      throw error;
    }

    const editables = ['tipoMaterial', 'codigoRollo', 'ordenTrabajo', 'observaciones'];
    editables.forEach(campo => {
      if (cambios[campo] !== undefined) registro[campo] = cambios[campo];
    });

    registro.modificadoEn = new Date().toISOString();
    registro.modificadoPor = cambios.modificadoPor || 'demo';
    return registro;
  },

  /** DELETE /pesajes/{id} */
  eliminar(id) {
    const i = this.registros.findIndex(r => String(r.id) === String(id));
    if (i === -1) {
      const error = new Error('El pesaje no existe');
      error.codigo = 'NO_ENCONTRADO';
      throw error;
    }
    this.registros.splice(i, 1);
    return true;
  },

  /** GET /pesajes — el filtrado en producción lo hace el backend por SQL. */
  filtrar({ buscar = '', tipoMaterial = '', desde = '', hasta = '', bascula = '' } = {}) {
    const t = String(buscar).trim().toLowerCase();

    return this.registros.filter(r => {
      const dia = r.capturadoEn.slice(0, 10);

      if (t && !(
        r.codigoRollo.toLowerCase().includes(t) ||
        r.ordenTrabajo.toLowerCase().includes(t) ||
        r.operario.toLowerCase().includes(t) ||
        r.folio.toLowerCase().includes(t) ||
        (r.observaciones || '').toLowerCase().includes(t)
      )) return false;

      if (tipoMaterial && r.tipoMaterial !== tipoMaterial) return false;
      if (bascula && r.bascula !== bascula) return false;
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      return true;
    });
  },

  material(codigo) {
    return this.materiales.find(m => m.codigo === codigo) || null;
  },

  /* ======================================================================
   *  3 · SEMILLA · 10 REGISTROS DE PLANTA
   *  --------------------------------------------------------------------
   *  Repartidos en los tres últimos días para que el historial tenga
   *  profundidad sin dejar de ser corto y legible. Las horas se concentran
   *  entre las 07:00 y las 15:00, con un pico a media mañana: así el reporte
   *  de «hora pico» tiene algo real que señalar.
   *
   *  Pesos: bobinas de alambrón alrededor de 2.000 kg (rango de proveedor) y
   *  producto semielaborado entre 50 y 3.000 kg según la etapa de la línea.
   * ====================================================================*/

  _semilla: [
    // ---- Día actual ----
    { h: [7, 12],  mat: 'BOBINA_ALAMBRON',       rollo: 'RA-84512', ot: 'OT-2026-1240', neto: 2014.5, tara: 28.5, op: 'Javier López',   bas: 'BASC-01', obs: 'Recepción de proveedor · lote completo' },
    { h: [8, 41],  mat: 'PRODUCTO_SEMIELABORADO', rollo: 'PS-19004', ot: 'OT-2026-1241', neto: 486.0,  tara: 14.0, op: 'María Ruiz',     bas: 'BASC-02', obs: 'Salida de trefilado · calibre 2.5 mm' },
    { h: [9, 25],  mat: 'BOBINA_ALAMBRON',       rollo: 'RA-84513', ot: 'OT-2026-1240', neto: 1987.0, tara: 27.5, op: 'Javier López',   bas: 'BASC-01', obs: 'Recepción de proveedor · lote completo' },
    { h: [10, 3],  mat: 'PRODUCTO_SEMIELABORADO', rollo: 'PS-19005', ot: 'OT-2026-1242', neto: 2890.5, tara: 42.0, op: 'Carlos Mendoza', bas: 'BASC-03', obs: 'Paquete consolidado para despacho' },
    { h: [10, 48], mat: 'BOBINA_ALAMBRON',       rollo: 'RA-84514', ot: 'OT-2026-1243', neto: 2042.0, tara: 29.0, op: 'Ana Castillo',   bas: 'BASC-01', obs: 'Bobina con óxido superficial leve' },

    // ---- Día anterior ----
    { h: [11, 15], mat: 'PRODUCTO_SEMIELABORADO', rollo: 'PS-19002', ot: 'OT-2026-1238', neto: 52.5,   tara: 6.5,  op: 'María Ruiz',     bas: 'BASC-02', obs: 'Muestra para control de calidad' },
    { h: [13, 30], mat: 'BOBINA_ALAMBRON',       rollo: 'RA-84509', ot: 'OT-2026-1237', neto: 1968.5, tara: 28.0, op: 'Diego Sáenz',    bas: 'BASC-03', obs: '' },
    { h: [14, 52], mat: 'PRODUCTO_SEMIELABORADO', rollo: 'PS-19003', ot: 'OT-2026-1239', neto: 1240.0, tara: 22.5, op: 'Carlos Mendoza', bas: 'BASC-04', obs: 'Despacho a cliente Ferretería del Norte' },

    // ---- Hace dos días ----
    { h: [9, 10],  mat: 'BOBINA_ALAMBRON',       rollo: 'RA-84505', ot: 'OT-2026-1235', neto: 2005.0, tara: 28.5, op: 'Ana Castillo',   bas: 'BASC-01', obs: '' },
    { h: [15, 20], mat: 'PRODUCTO_SEMIELABORADO', rollo: 'PS-19001', ot: 'OT-2026-1236', neto: 764.5,  tara: 17.0, op: 'Diego Sáenz',    bas: 'BASC-02', obs: 'Reproceso por calibre fuera de tolerancia' }
  ],

  generar() {
    // Los cinco primeros son de hoy, los tres siguientes de ayer y los dos
    // últimos de anteayer.
    const diaDe = (i) => (i < 5 ? 0 : i < 8 ? 1 : 2);

    this.registros = this._semilla.map((s, i) => {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - diaDe(i));
      fecha.setHours(s.h[0], s.h[1], 0, 0);

      return {
        id: 900001 + i,
        folio: 'CP-' + String(this._folio - i).padStart(6, '0'),
        ordenTrabajo: s.ot,
        codigoRollo: s.rollo,
        tipoMaterial: s.mat,
        operario: s.op,
        operarioId: 12,
        pesoBruto: +(s.neto + s.tara).toFixed(1),
        tara: s.tara,
        pesoNeto: s.neto,
        unidad: 'kg',
        bascula: s.bas,
        modeloBascula: 'Hiweight X10',
        estable: true,
        observaciones: s.obs,
        capturadoEn: fecha.toISOString(),
        creadoEn: fecha.toISOString()
      };
    }).sort((a, b) => new Date(b.capturadoEn) - new Date(a.capturadoEn));

    return this.registros;
  }
};

MockData.generar();
