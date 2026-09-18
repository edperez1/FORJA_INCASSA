/* ============================================================================
 *  INCASA · js/api.js
 *  ---------------------------------------------------------------------------
 *  ★ CAPA DE INTEGRACIÓN ★
 *
 *  El ÚNICO archivo que habla con el backend de Java. El resto de la
 *  aplicación llama siempre a `API.*` y nunca a `fetch` directamente.
 *  Cada método documenta aquí su contrato; el backend lo implementa en
 *  backend/src/main/java y lo prueba en ContratoApiTest.
 *
 *  ── ENTORNO ──────────────────────────────────────────────────────────────
 *  Spring Boot en http://localhost:8080
 *      REST       →  /api
 *      WebSocket  →  /ws/bascula
 *
 *  Las URL son relativas: en desarrollo el proxy de vite.config.js las
 *  reenvía al 8080, y en producción el JAR sirve estos estáticos desde el
 *  mismo origen. En los dos casos no hay CORS que configurar.
 *
 *  ── ERRORES ──────────────────────────────────────────────────────────────
 *  Todo error del backend llega con este cuerpo:
 *      { "error": "CODIGO_MAQUINA", "mensaje": "Texto para el operario",
 *        "campos": { "campo": "motivo" } }          ← sólo en validaciones (422)
 *  `pedir()` lanza un Error con `mensaje`, `codigo`, `estado` y `campos`.
 *  ==========================================================================*/

/** Lee una variable de entorno de Vite con valor por defecto. */
const env = (clave, porDefecto) => import.meta.env?.[clave] ?? porDefecto;

/** Convierte un objeto de filtros en query string, sin los vacíos. */
const consulta = (filtros = {}) => {
  const q = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => v !== '' && v != null)
  ).toString();
  return q ? '?' + q : '';
};

export const API = {

  /* ========================================================================
   *  ⚙️  CONFIGURACIÓN
   * ======================================================================*/

  /** Raíz de la API REST de Spring Boot. */
  BASE: env('VITE_API_BASE', '/api'),

  /** Punto de conexión del WebSocket que reemite la báscula. */
  WS: env('VITE_WS_BASE', '/ws/bascula'),

  /** Token guardado tras el login. En producción conviene cookie httpOnly. */
  token() { return sessionStorage.getItem('incasa_token') || ''; },

  cabeceras() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + this.token()
    };
  },

  /**
   * Envoltorio único de `fetch`: URL base, errores del backend y expulsión
   * automática cuando el token caduca (401).
   *
   * Las rutas /auth/* quedan fuera de la expulsión: un 401 en el login son
   * credenciales incorrectas, no una sesión caducada, y el operario tiene que
   * ver el mensaje en lugar de una recarga de la pantalla de acceso.
   */
  async pedir(ruta, opciones = {}) {
    const r = await fetch(`${this.BASE}${ruta}`, {
      headers: this.cabeceras(),
      ...opciones
    });

    if (r.status === 401 && !ruta.startsWith('/auth/')) {
      sessionStorage.clear();
      location.replace('index.html');
      throw new Error('La sesión caducó');
    }

    if (!r.ok) {
      // El backend puede responder texto plano si algo falló muy abajo.
      const cuerpo = await r.json().catch(() => ({}));
      const error = new Error(cuerpo.mensaje || `Error ${r.status} en ${ruta}`);
      error.codigo = cuerpo.error;
      error.estado = r.status;
      error.campos = cuerpo.campos || {};
      throw error;
    }

    return r.status === 204 ? null : r.json();
  },

  enviar(ruta, metodo, cuerpo) {
    return this.pedir(ruta, {
      method: metodo,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
  },

  /* ========================================================================
   *  🔐  1 · ACCESO
   *  ------------------------------------------------------------------------
   *  No hay registro público. La primera cuenta es la del PROPIETARIO, que
   *  se crea una sola vez con el código de instalación; las demás las crean
   *  el propietario o los administradores (bloque 6).
   *
   *  GET  /auth/estado          → { requiereConfiguracion: true|false }   sin token
   *
   *  POST /auth/configuracion   → 201 { token, expiraEn, usuario }
   *    { usuario, nombres, apellidos, correo?, clave, codigoInstalacion }
   *    403 CODIGO_INSTALACION_INVALIDO · 409 YA_CONFIGURADO
   *
   *  POST /auth/login           → { token, expiraEn, usuario }
   *    { usuario, clave }
   *    401 CREDENCIALES_INVALIDAS · 403 CUENTA_INACTIVA
   *
   *  POST /auth/logout          → 204
   *
   *  EL OBJETO `usuario`:
   *  { id, usuario, nombres, apellidos, nombre, correo,
   *    rol: "OPERARIO", rolNombre: "Operario de báscula",
   *    permisos: ["PESAR","TERMINAR_PRODUCCION","CONSULTAR"], activo, creadoEn, ultimoIngreso,
   *    unidad: "kg", ingreso }
   *
   *  PERMISOS: ABRIR_PRODUCCION · PESAR · TERMINAR_PRODUCCION · CORREGIR ·
   *  CONSULTAR · GESTIONAR_USUARIOS · GESTIONAR_CATALOGOS · VER_AUDITORIA ·
   *  GESTIONAR_ADMINISTRADORES y GESTIONAR_PERMISOS (sólo el propietario).
   *  Qué tiene cada rol lo decide el propietario (bloque 6, «Roles y permisos»).
   * ======================================================================*/

  estado()               { return this.pedir('/auth/estado'); },
  configurar(datos)      { return this.enviar('/auth/configuracion', 'POST', datos); },
  login({ usuario, clave }) { return this.enviar('/auth/login', 'POST', { usuario, clave }); },
  logout()               { return this.enviar('/auth/logout', 'POST'); },

  /* ========================================================================
   *  ⚖️  2 · LECTURA DE BÁSCULA EN TIEMPO REAL
   *  ------------------------------------------------------------------------
   *  ws://localhost:8080/ws/bascula?token=…
   *
   *  El sistema trabaja con la báscula activa. ~10 tramas por segundo:
   *  { "bascula": "BASC-01", "modelo": "Hiweight X10", "peso": 1284.5,
   *    "bruto": 1310.0, "tara": 25.5, "unidad": "kg", "estable": true,
   *    "modo": "NETO", "sobrecarga": false, "capacidad": 4600.0,
   *    "division": 0.5, "ts": "2026-08-31T15:04:11.320Z" }
   *
   *  Comandos por el mismo socket: {"comando":"CERO"|"TARA"|"BRUTO"|"NETO"}
   *
   *  Reconexión con espera creciente: si la red de planta se cae, el
   *  operario no tiene que recargar la página.
   *
   *  @returns {{ enviar: (cmd: string) => void, cerrar: () => void }}
   * ======================================================================*/
  conectarBascula(alRecibir, alCambiarEstado) {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = this.WS.startsWith('ws') ? this.WS : `${protocolo}//${location.host}${this.WS}`;

    let socket;
    let reintentos = 0;
    let cerradoAposta = false;

    const abrir = () => {
      alCambiarEstado?.('conectando');
      socket = new WebSocket(`${url}?token=${encodeURIComponent(this.token())}`);

      socket.onopen = () => { reintentos = 0; alCambiarEstado?.('conectada'); };

      socket.onmessage = ev => {
        try { alRecibir(JSON.parse(ev.data)); }
        catch { console.warn('[bascula] trama ilegible:', ev.data); }
      };

      socket.onerror = () => alCambiarEstado?.('error');

      socket.onclose = () => {
        if (cerradoAposta) return;
        alCambiarEstado?.('desconectada');
        // Espera creciente: 1,6 s · 3,2 s · 6,4 s … hasta 15 s.
        reintentos += 1;
        setTimeout(abrir, Math.min(15000, 800 * 2 ** reintentos));
      };
    };

    abrir();

    return {
      enviar: comando => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ comando }));
      },
      cerrar: () => { cerradoAposta = true; socket?.close(); }
    };
  },

  /* ========================================================================
   *  🏭  3 · PRODUCCIONES
   *  ------------------------------------------------------------------------
   *  Una producción es la bobina que entra a un área de PROCESO para
   *  convertirse en un producto que va a un área de DESTINO.
   *
   *    PROCESO → TERMINADO   (con al menos un pesaje de entrada y uno de salida)
   *    PROCESO → ANULADA     (sólo sin pesajes vigentes)
   *
   *  GET  /producciones?estado=&productoId=&areaId=&desde=&hasta=&buscar=
   *       → [ produccion ]     sin `estado`: PROCESO y TERMINADO
   *  GET  /producciones/{id}  → { produccion, pesajes: [ pesaje ] }
   *  POST /producciones       → 201 produccion             (ABRIR_PRODUCCION)
   *  PUT  /producciones/{id}  → produccion                 (CORREGIR)
   *    { ordenTrabajo?, productoId, materiaId, cantidad, unidadId,
   *      areaProcesoId, areaDestinoId, observaciones? }
   *  POST /producciones/{id}/terminar  { observaciones?, forzar? } → produccion  (TERMINAR_PRODUCCION)
   *    409 FALTA_ENTRADA · FALTA_SALIDA · PRODUCCION_CERRADA
   *    409 MERMA_FUERA_DE_TOLERANCIA si la merma supera `mermaMaximaPct` (2 %).
   *        Con `forzar: true` se cierra igual: exige CORREGIR y `observaciones`.
   *  POST /producciones/{id}/anular    { motivo }         → 204          (CORREGIR)
   *    409 PRODUCCION_CON_PESAJES
   *
   *  EL OBJETO `produccion`:
   *  { id, codigo: "PR-000001", ordenTrabajo, productoId, producto,
   *    materiaId, materia, cantidad, unidadId, unidad: "kg", unidadNombre,
   *    areaProcesoId, areaProceso, areaDestinoId, areaDestino,
   *    estado, inicioEn, finEn, abiertaPor, terminadaPor, observaciones,
   *    modificadoEn, modificadoPor,
   *    kgEntrada, kgSalida, mermaKg, rendimiento, entradas, salidas,
   *    cantidadProducida, avance (% de `cantidad`), exceso,
   *    mermaPct, mermaMaximaPct, bobinas: ["BOB-001"] }
   *
   *  REGLAS: la salida acumulada nunca pesa más que la entrada; al alcanzar
   *  la cantidad pedida la producción se TERMINA SOLA (si la merma está en
   *  tolerancia) y el exceso queda anotado. Ver `cierre` en el bloque 4.
   * ======================================================================*/

  listarProducciones(filtros)   { return this.pedir('/producciones' + consulta(filtros)); },
  obtenerProduccion(id)         { return this.pedir(`/producciones/${id}`); },
  abrirProduccion(datos)        { return this.enviar('/producciones', 'POST', datos); },
  corregirProduccion(id, datos) { return this.enviar(`/producciones/${id}`, 'PUT', datos); },
  terminarProduccion(id, observaciones, forzar = false) {
    return this.enviar(`/producciones/${id}/terminar`, 'POST', { observaciones, forzar });
  },
  anularProduccion(id, motivo)  { return this.enviar(`/producciones/${id}/anular`, 'POST', { motivo }); },

  /* ========================================================================
   *  📦  4 · PESAJES
   *  ------------------------------------------------------------------------
   *  POST /pesajes → 201 pesaje                                    (PESAR)
   *  { produccionId, tipo: "ENTRADA"|"SALIDA", codigoBobina, cantidad?,
   *    pesoBruto, tara, unidad: "kg", estable, origenLectura, observaciones? }
   *    · codigoBobina es obligatorio en ENTRADA
   *    · cantidad: producto que dejó una SALIDA, en la unidad de la producción.
   *      Obligatoria salvo que esa unidad sea kg (entonces vale el neto).
   *    · Una SALIDA exige entrada previa y no puede dejar la salida acumulada
   *      por encima de la entrada (422 en pesoBruto).
   *    · La respuesta de una SALIDA puede traer `cierre`:
   *      { alcanzada, terminada, exceso, unidad, mermaPct, mensaje }
   *      terminada = la producción se cerró sola al alcanzar lo pedido.
   *    · operario, neto, báscula y hora los pone el servidor
   *    · origenLectura: "conectada" | "manual" | "simulador"
   *      (el servidor rechaza "simulador" salvo que planta lo habilite)
   *
   *  GET /pesajes?buscar=&tipo=&produccionId=&productoId=&desde=&hasta=
   *    → { datos: [ pesaje ], meta: { total, totales: { entradaKg, salidaKg } } }
   *    Sin `porPagina` devuelve todo el filtro: los reportes agregan aquí.
   *
   *  GET    /pesajes/{id}
   *  PUT    /pesajes/{id}  { codigoBobina?, cantidad?, observaciones? }  (CORREGIR)
   *  DELETE /pesajes/{id}?motivo=…  → 204 · baja lógica             (CORREGIR)
   *
   *  EL OBJETO `pesaje`:
   *  { id, folio: "CP-000001", tipo, codigoBobina, pesoBruto, tara, pesoNeto,
   *    unidad, estable, origenLectura, cantidad, unidadProduccion: "und",
   *    observaciones, capturadoEn, creadoEn,
   *    operario, operarioId, modificadoEn, modificadoPor,
   *    bascula, modeloBascula, capacidadKg, divisionKg,
   *    produccionId, produccion: "PR-000001", produccionEstado, ordenTrabajo,
   *    producto, materia, areaProceso, areaDestino }
   * ======================================================================*/

  guardarPesaje(pesaje)         { return this.enviar('/pesajes', 'POST', pesaje); },
  listarPesajes(filtros)        { return this.pedir('/pesajes' + consulta(filtros)); },
  obtenerPesaje(id)             { return this.pedir(`/pesajes/${id}`); },
  actualizarPesaje(id, cambios) { return this.enviar(`/pesajes/${id}`, 'PUT', cambios); },
  eliminarPesaje(id, motivo)    { return this.enviar(`/pesajes/${id}` + consulta({ motivo }), 'DELETE'); },

  /* ========================================================================
   *  📄  CERTIFICADO, TICKET Y REPORTE EN PDF
   *  ------------------------------------------------------------------------
   *  GET  /pesajes/{id}/certificado   → application/pdf
   *  GET  /pesajes/{id}/ticket        → application/pdf (80 mm)
   *  POST /reportes/pesajes.pdf       → application/pdf
   *
   *  El backend responde hoy 501: `blobPDF()` lo traduce a `null` y
   *  js/reportes.js arma el documento en el navegador con jsPDF.
   * ======================================================================*/

  async certificadoPesaje(id) {
    const r = await fetch(`${this.BASE}/pesajes/${id}/certificado`, {
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' }
    });
    return this.blobPDF(r, 'No se pudo generar el certificado');
  },

  async ticketPesaje(id) {
    const r = await fetch(`${this.BASE}/pesajes/${id}/ticket`, {
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' }
    });
    return this.blobPDF(r, 'No se pudo generar el ticket');
  },

  async reportePDF(filtros) {
    const r = await fetch(`${this.BASE}/reportes/pesajes.pdf`, {
      method: 'POST',
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' },
      body: JSON.stringify(filtros)
    });
    return this.blobPDF(r, 'El servidor no pudo generar el reporte');
  },

  /** Blob del PDF, o `null` si el servidor todavía no lo genera (501). */
  async blobPDF(r, mensajeError) {
    if (r.status === 501) return null;
    if (!r.ok) throw new Error(mensajeError);
    return r.blob();
  },

  /* ========================================================================
   *  🗂️  5 · CATÁLOGOS
   *  ------------------------------------------------------------------------
   *  GET /catalogos             → { areas, productos, materias, unidades, bascula }
   *  GET /catalogos?todos=true  → incluye desactivados   (GESTIONAR_CATALOGOS)
   *    elemento: { id, nombre, codigo (sólo unidades), observaciones, activo }
   *    bascula:  { id, codigo, marca, modelo, modeloCompleto,
   *                capacidadKg, divisionKg, areaId, area }
   *
   *  POST /catalogos/{tipo}       { nombre, codigo?, observaciones?, activo? }
   *  PUT  /catalogos/{tipo}/{id}  mismo cuerpo
   *    tipo: areas | productos | materias | unidades
   *  PUT  /catalogos/bascula      { marca, modelo, capacidadKg, divisionKg, areaId? }
   * ======================================================================*/

  catalogos(todos = false)           { return this.pedir('/catalogos' + (todos ? '?todos=true' : '')); },
  crearCatalogo(tipo, datos)         { return this.enviar(`/catalogos/${tipo}`, 'POST', datos); },
  editarCatalogo(tipo, id, datos)    { return this.enviar(`/catalogos/${tipo}/${id}`, 'PUT', datos); },
  editarBascula(datos)               { return this.enviar('/catalogos/bascula', 'PUT', datos); },

  /* ========================================================================
   *  👤  6 · CUENTAS
   *  ------------------------------------------------------------------------
   *  Perfil propio (cualquier sesión)
   *    GET /usuarios/me           → { usuario }
   *    PUT /usuarios/me           { nombres, apellidos, correo? } → { usuario }
   *    PUT /usuarios/me/clave     { claveActual, claveNueva }     → 204
   *                               400 CLAVE_ACTUAL_INVALIDA
   *
   *  Gestión (GESTIONAR_USUARIOS; administradores sólo con GESTIONAR_ADMINISTRADORES)
   *    GET  /usuarios             → [ usuario ]
   *    GET  /usuarios/roles       → [ { codigo, nombre } ]  los que puedo asignar
   *    POST /usuarios             { usuario, nombres, apellidos, correo?, rol, clave } → 201
   *    PUT  /usuarios/{id}        { nombres, apellidos, correo?, rol, activo }
   *    PUT  /usuarios/{id}/clave  { claveNueva } → 204   (cierra sus sesiones)
   *    El propietario y la propia cuenta no se gestionan por aquí (403).
   * ======================================================================*/

  miPerfil()                       { return this.pedir('/usuarios/me'); },
  guardarPerfil({ nombres, apellidos, correo }) {
    return this.enviar('/usuarios/me', 'PUT', { nombres, apellidos, correo });
  },
  cambiarClave({ claveActual, claveNueva }) {
    return this.enviar('/usuarios/me/clave', 'PUT', { claveActual, claveNueva });
  },

  listarUsuarios()                 { return this.pedir('/usuarios'); },
  rolesAsignables()                { return this.pedir('/usuarios/roles'); },
  crearUsuario(datos)              { return this.enviar('/usuarios', 'POST', datos); },
  editarUsuario(id, datos)         { return this.enviar(`/usuarios/${id}`, 'PUT', datos); },
  restablecerClave(id, claveNueva) { return this.enviar(`/usuarios/${id}/clave`, 'PUT', { claveNueva }); },

  /* ------------------------------------------------------------------------
   *  Roles y permisos (GESTIONAR_PERMISOS · sólo el propietario)
   *    GET /permisos        → { permisos: [ { codigo, nombre, descripcion, fijo } ],
   *                             roles:    [ { codigo, nombre, editable, permisos: [codigo] } ] }
   *    PUT /permisos/{rol}  { permisos: [codigo] } → rol
   *    Un permiso `fijo` es exclusivo del propietario y no se asigna (422).
   * ----------------------------------------------------------------------*/
  permisos()                       { return this.pedir('/permisos'); },
  asignarPermisos(rol, permisos)   { return this.enviar(`/permisos/${rol}`, 'PUT', { permisos }); },

  /* ========================================================================
   *  🛡️  7 · AUDITORÍA                                         (VER_AUDITORIA)
   *  GET /auditoria?limite=200 → [ { id, en, usuario, accion, entidad, entidadId, detalle } ]
   * ======================================================================*/

  auditoria(limite = 200) { return this.pedir('/auditoria' + consulta({ limite })); }
};
