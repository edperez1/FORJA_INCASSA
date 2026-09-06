/* ============================================================================
 *  INCASA · js/api.js
 *  ---------------------------------------------------------------------------
 *  ★ CAPA DE INTEGRACIÓN ★
 *
 *  Este es el ÚNICO archivo que hay que tocar para conectar el backend de
 *  Java. El resto de la aplicación llama siempre a `API.*` y nunca a `fetch`
 *  directamente, así que ninguna vista se entera del cambio.
 *
 *  ╔══════════════════════════════════════════════════════════════════════════╗
 *  ║  PASO A PRODUCCIÓN — UNA SOLA BANDERA                                    ║
 *  ║                                                                          ║
 *  ║     API.MODO = 'produccion'      (línea marcada más abajo)               ║
 *  ║                                                                          ║
 *  ║  o, sin tocar código, creando un archivo `.env` en la raíz:              ║
 *  ║                                                                          ║
 *  ║     VITE_API_MODO=produccion                                             ║
 *  ║                                                                          ║
 *  ║  Cada método ya trae escrita su llamada `fetch` real: la bandera sólo    ║
 *  ║  elige entre la rama simulada y la rama de red.                          ║
 *  ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *  ── ENTORNO JAVA ESPERADO ────────────────────────────────────────────────
 *  Spring Boot escuchando en  http://localhost:8080
 *
 *      REST       →  http://localhost:8080/api
 *      WebSocket  →  ws://localhost:8080/ws/bascula
 *
 *  ── POR QUÉ LAS URL SON RELATIVAS ────────────────────────────────────────
 *  `BASE` vale '/api' y `WS` vale '/ws/bascula': rutas relativas, no absolutas.
 *
 *    · En desarrollo, el proxy de `vite.config.js` reenvía /api y /ws al
 *      puerto 8080. El navegador cree que habla con su propio origen.
 *    · En producción, el JAR de Spring Boot sirve estos estáticos desde
 *      `src/main/resources/static`, así que también es el mismo origen.
 *
 *  En los dos casos NO hay CORS, ni preflight, ni cabeceras `Access-Control-*`
 *  que configurar en Java. Si algún día el frontend se despliega en un dominio
 *  distinto, basta con poner aquí la URL absoluta y añadir `@CrossOrigin` (o un
 *  `WebMvcConfigurer`) en el backend.
 *  ==========================================================================*/

import { MockData } from './mock-data.js';
import { Bascula } from './bascula.js';

/** Retardo artificial para que la simulación se sienta como una red real. */
const espera = (ms) => new Promise(r => setTimeout(r, ms));

/** Lee una variable de entorno de Vite con valor por defecto. */
const env = (clave, porDefecto) => import.meta.env?.[clave] ?? porDefecto;

export const API = {

  /* ========================================================================
   *  ⚙️  CONFIGURACIÓN
   * ======================================================================*/

  /**
   * ★ LA BANDERA ★
   *   'simulacion' → datos de js/mock-data.js, sin red. La demo funciona sola.
   *   'produccion' → llamadas reales al backend de Java.
   */
  MODO: env('VITE_API_MODO', 'simulacion'),

  /** Raíz de la API REST de Spring Boot. */
  BASE: env('VITE_API_BASE', '/api'),

  /** Punto de conexión del WebSocket que reemite la báscula. */
  WS: env('VITE_WS_BASE', '/ws/bascula'),

  /** ¿Estamos contra el backend real? Lo consultan las vistas para ocultar
   *  los controles del simulador. */
  get enProduccion() { return this.MODO === 'produccion'; },

  /** Token guardado tras el login. En producción conviene cookie httpOnly. */
  token() { return sessionStorage.getItem('incasa_token') || ''; },

  /** Cabeceras estándar de toda llamada autenticada. */
  cabeceras() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + this.token()
    };
  },

  /**
   * Envoltorio único de `fetch`. Centraliza tres cosas que si no se repetirían
   * en cada método: la URL base, el manejo de errores del backend y la
   * expulsión automática cuando el token caduca (401).
   *
   * El backend de Java debe responder los errores con este cuerpo
   * (un `@ControllerAdvice` con `@ExceptionHandler` basta):
   *
   *     { "error": "CODIGO_MAQUINA", "mensaje": "Texto para el operario" }
   */
  async pedir(ruta, opciones = {}) {
    const r = await fetch(`${this.BASE}${ruta}`, {
      headers: this.cabeceras(),
      ...opciones
    });

    if (r.status === 401) {
      sessionStorage.clear();
      location.replace('index.html');
      throw new Error('La sesión caducó');
    }

    if (!r.ok) {
      // El backend puede responder texto plano si algo falló muy abajo.
      const cuerpo = await r.json().catch(() => ({}));
      throw new Error(cuerpo.mensaje || `Error ${r.status} en ${ruta}`);
    }

    return r.status === 204 ? null : r.json();
  },

  /* ========================================================================
   *  🔐  1 · AUTENTICACIÓN
   *  ------------------------------------------------------------------------
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  POST {BASE}/auth/login                                              ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  ENVIAR:
   *  {
   *    "usuario": "jlopez",
   *    "clave":   "••••••••",
   *    "bascula": "BASC-03"
   *  }
   *
   *  RECIBIR (200):
   *  {
   *    "token": "eyJhbGciOiJIUzI1NiIsIn...",
   *    "expiraEn": 28800,
   *    "usuario": {
   *      "id": 12,
   *      "usuario": "jlopez",
   *      "nombre": "Javier López",
   *      "rol": "Operario de báscula",
   *      "correo": "jlopez@incasa.com.ni",
   *      "bascula": "BASC-03",
   *      "unidad": "kg"
   *    }
   *  }
   *
   *  ERROR (401):
   *  { "error": "CREDENCIALES_INVALIDAS", "mensaje": "Usuario o contraseña incorrectos" }
   * ======================================================================*/
  async login({ usuario, clave, bascula }) {

    if (!this.enProduccion) {
      await espera(480);
      return MockData.autenticar({ usuario, clave, bascula });
    }

    return this.pedir('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ usuario, clave, bascula })
    });
  },

  /* ========================================================================
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  POST {BASE}/auth/registro     ← ALTA DE OPERARIO / ADMINISTRADOR    ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  ENVIAR:
   *  {
   *    "nombre":       "Ana Castillo",
   *    "usuario":      "acastillo",
   *    "correo":       "acastillo@incasa.com.ni",
   *    "clave":        "••••••••",
   *    "rol":          "Operario de báscula",
   *    "bascula":      "BASC-02",
   *    "codigoPlanta": "INCASA-2026"
   *  }
   *
   *  RECIBIR (201): idéntico al login — el alta deja la sesión ya abierta.
   *
   *  ERRORES:
   *   409 { "error": "USUARIO_EXISTENTE",       "mensaje": "…" }
   *   403 { "error": "CODIGO_PLANTA_INVALIDO",  "mensaje": "…" }
   *   422 { "error": "VALIDACION", "campos": { "clave": "Mínimo 8 caracteres" } }
   *
   *  NOTA PARA EL BACKEND: `codigoPlanta` es el secreto compartido que impide
   *  que cualquiera se dé de alta desde la red de planta. El alta con rol
   *  «Administrador» debería exigir además aprobación de un administrador
   *  existente (responder 202 y dejar la cuenta pendiente).
   * ======================================================================*/
  async registrar(datos) {

    if (!this.enProduccion) {
      await espera(700);
      return MockData.registrar(datos);
    }

    return this.pedir('/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(datos)
    });
  },

  /* ========================================================================
   *  POST {BASE}/auth/logout
   *  ENVIAR: nada (sólo el Bearer token)   ·   RECIBIR: 204 sin cuerpo
   * ======================================================================*/
  async logout() {
    if (!this.enProduccion) { await espera(140); return true; }
    return this.pedir('/auth/logout', { method: 'POST' });
  },

  /* ========================================================================
   *  GET {BASE}/usuarios/me
   *  Valida el token al arrancar la aplicación y devuelve el perfil vigente.
   *  RECIBIR: { "usuario": { …mismo objeto del login… } }
   * ======================================================================*/
  async miPerfil() {
    if (!this.enProduccion) { await espera(120); return null; }
    return this.pedir('/usuarios/me');
  },

  /* ========================================================================
   *  ⚖️  2 · LECTURA DE BÁSCULA EN TIEMPO REAL
   *  ------------------------------------------------------------------------
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  ws://localhost:8080/ws/bascula?bascula=BASC-03&token=…               ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  El indicador Hiweight X10 publica por el puerto serie; el backend de Java
   *  lo lee (jSerialComm) y lo reemite por WebSocket. Con Spring basta un
   *  `@ServerEndpoint` o un `WebSocketHandler` registrado en `/ws/bascula`.
   *
   *  TRAMA ESPERADA, ~10 mensajes por segundo:
   *  {
   *    "bascula": "BASC-03",
   *    "modelo": "Hiweight X10",
   *    "peso": 1284.5,          // lo que muestra el visor (neto o bruto)
   *    "bruto": 1310.0,
   *    "tara": 25.5,
   *    "unidad": "kg",          // SIEMPRE "kg"
   *    "estable": true,         // el indicador ya no oscila
   *    "modo": "NETO",          // "NETO" | "BRUTO"
   *    "sobrecarga": false,
   *    "capacidad": 4600.0,
   *    "division": 0.5,
   *    "ts": "2026-08-31T15:04:11.320Z"
   *  }
   *
   *  COMANDOS que el frontend envía por el mismo socket:
   *    { "comando": "CERO" }   { "comando": "TARA" }
   *    { "comando": "BRUTO" }  { "comando": "NETO" }
   *
   *  ALTERNATIVA SIN WEBSOCKET (polling cada 300 ms):
   *    GET {BASE}/basculas/{codigo}/lectura  →  el mismo JSON de arriba
   *
   *  La reconexión con espera creciente ya está implementada aquí abajo: si
   *  la red de planta se cae, el operario no tiene que recargar la página.
   *
   *  @returns {{ enviar: (cmd: string) => void, cerrar: () => void }}
   *           La misma interfaz en simulación y en producción.
   * ======================================================================*/
  conectarBascula(bascula, alRecibir, alCambiarEstado) {

    if (!this.enProduccion) {
      // El simulador (js/bascula.js) expone exactamente esta misma interfaz.
      return Bascula.iniciar(bascula, alRecibir, alCambiarEstado);
    }

    /* Origen absoluto para el socket: ws:// en local, wss:// tras HTTPS. */
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = this.WS.startsWith('ws')
      ? this.WS
      : `${protocolo}//${location.host}${this.WS}`;

    let socket;
    let reintentos = 0;
    let cerradoAposta = false;

    const abrir = () => {
      alCambiarEstado?.('conectando');
      socket = new WebSocket(
        `${url}?bascula=${encodeURIComponent(bascula)}&token=${this.token()}`
      );

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
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ comando }));
        }
      },
      cerrar: () => { cerradoAposta = true; socket?.close(); }
    };
  },

  /* ========================================================================
   *  📦  3 · PESAJES
   *  ------------------------------------------------------------------------
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  POST {BASE}/pesajes                                                 ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  ENVIAR:
   *  {
   *    "ordenTrabajo":  "OT-2026-1248",
   *    "codigoRollo":   "RA-84532",
   *    "tipoMaterial":  "BOBINA_ALAMBRON",
   *    "operario":      "Javier López",
   *    "operarioId":    12,
   *    "pesoBruto":     1310.0,
   *    "tara":          25.5,
   *    "pesoNeto":      1284.5,
   *    "unidad":        "kg",
   *    "bascula":       "BASC-03",
   *    "modeloBascula": "Hiweight X10",
   *    "estable":       true,
   *    "observaciones": "Rollo con óxido superficial leve",
   *    "capturadoEn":   "2026-08-31T15:04:11.320Z"
   *  }
   *
   *  RECIBIR (201): el mismo objeto más `id`, `folio` y `creadoEn`.
   *  { "id": 4821, "folio": "CP-004821", "creadoEn": "2026-08-31T15:04:12.001Z", … }
   *
   *  El `folio` (CP = Certificado de Pesaje) lo genera el backend y es el
   *  número que aparece impreso en el certificado en PDF.
   *
   *  ERROR (422):
   *  { "error": "VALIDACION", "campos": { "codigoRollo": "Ya existe un pesaje con ese rollo" } }
   * ======================================================================*/
  async guardarPesaje(pesaje) {
    if (!this.enProduccion) {
      await espera(340);
      return MockData.crear(pesaje);
    }
    return this.pedir('/pesajes', { method: 'POST', body: JSON.stringify(pesaje) });
  },

  /* ========================================================================
   *  GET {BASE}/pesajes
   *
   *  QUERY: ?desde=2026-08-01&hasta=2026-08-31&tipoMaterial=BOBINA_ALAMBRON
   *         &bascula=BASC-03&buscar=OT-2026&pagina=1&porPagina=50
   *
   *  RECIBIR (200):
   *  {
   *    "datos": [ { …mismo objeto de guardarPesaje… } ],
   *    "meta": {
   *      "pagina": 1, "porPagina": 50, "total": 128,
   *      "totales": { "netoKg": 152348.5 }
   *    }
   *  }
   * ======================================================================*/
  async listarPesajes(filtros = {}) {
    if (!this.enProduccion) {
      await espera(180);
      const datos = MockData.filtrar(filtros);
      return { datos, meta: { total: datos.length, pagina: 1, porPagina: datos.length } };
    }
    // Los filtros vacíos no viajan: ensucian el log y algunos validadores de
    // Spring los rechazan.
    const q = new URLSearchParams(
      Object.entries(filtros).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return this.pedir(`/pesajes${q ? '?' + q : ''}`);
  },

  /* ========================================================================
   *  GET {BASE}/pesajes/{id}
   *  RECIBIR (200): el objeto completo del pesaje.
   *  ERROR (404): { "error": "NO_ENCONTRADO", "mensaje": "El pesaje no existe" }
   * ======================================================================*/
  async obtenerPesaje(id) {
    if (!this.enProduccion) {
      await espera(120);
      const r = MockData.buscarPorId(id);
      if (!r) throw new Error('El pesaje no existe');
      return r;
    }
    return this.pedir(`/pesajes/${id}`);
  },

  /* ========================================================================
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  PUT {BASE}/pesajes/{id}       ← EDICIÓN DE UN REGISTRO             ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  Sólo se editan los datos de identificación del material. El peso NO se
   *  toca nunca: es la lectura certificada de la celda de carga y modificarla
   *  invalidaría el certificado ya emitido. Si un peso está mal, se anula el
   *  registro y se vuelve a pesar el material.
   *
   *  ENVIAR:
   *  {
   *    "tipoMaterial":  "PRODUCTO_SEMIELABORADO",
   *    "codigoRollo":   "RA-84532",
   *    "ordenTrabajo":  "OT-2026-1249",
   *    "observaciones": "Corregido tras revisión de calidad"
   *  }
   *
   *  RECIBIR (200): el objeto ya actualizado, con `modificadoEn` y
   *                 `modificadoPor` para la auditoría.
   *
   *  ERROR (403): { "error": "SIN_PERMISO", "mensaje": "Sólo un supervisor puede editar pesajes cerrados" }
   * ======================================================================*/
  async actualizarPesaje(id, cambios) {
    if (!this.enProduccion) {
      await espera(320);
      return MockData.actualizar(id, cambios);
    }
    return this.pedir(`/pesajes/${id}`, { method: 'PUT', body: JSON.stringify(cambios) });
  },

  /* ========================================================================
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  DELETE {BASE}/pesajes/{id}    ← BAJA DE UN REGISTRO                ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  RECIBIR: 204 sin cuerpo.
   *
   *  RECOMENDACIÓN PARA EL BACKEND: no borrar la fila. Marcarla como anulada
   *  (`anuladoEn`, `anuladoPor`, `motivo`) y excluirla de las consultas. Un
   *  certificado de pesaje es un documento comercial y puede hacer falta en una
   *  auditoría o en una reclamación de cliente meses después.
   * ======================================================================*/
  async eliminarPesaje(id) {
    if (!this.enProduccion) {
      await espera(300);
      return MockData.eliminar(id);
    }
    return this.pedir(`/pesajes/${id}`, { method: 'DELETE' });
  },

  /* ========================================================================
   *  📄  4 · CERTIFICADO DE PESAJE
   *  ------------------------------------------------------------------------
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  GET {BASE}/pesajes/{id}/certificado                                 ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *
   *  Documento oficial de una pesada concreta.
   *  RECIBIR: 200 con Content-Type: application/pdf (blob → descarga directa).
   *
   *  Mientras el backend no exista, este método devuelve `null` y
   *  js/reportes.js arma el certificado en el navegador con jsPDF. Así la demo
   *  descarga un PDF de verdad y, al conectar Java, sólo cambia de dónde viene
   *  el blob: el resto del flujo es idéntico.
   * ======================================================================*/
  async certificadoPesaje(id) {
    if (!this.enProduccion) { await espera(320); return null; }

    const r = await fetch(`${this.BASE}/pesajes/${id}/certificado`, {
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' }
    });
    if (!r.ok) throw new Error('No se pudo generar el certificado');
    return r.blob();
  },

  /* ========================================================================
   *  GET {BASE}/pesajes/{id}/ticket
   *  Comprobante de 80 mm para la impresora térmica de la terminal.
   *  RECIBIR: 200 con Content-Type: application/pdf (blob).
   *
   *  Igual que el certificado: si el backend no lo sirve, js/reportes.js lo
   *  arma en el navegador con jsPDF.
   * ======================================================================*/
  async ticketPesaje(id) {
    if (!this.enProduccion) { await espera(260); return null; }

    const r = await fetch(`${this.BASE}/pesajes/${id}/ticket`, {
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' }
    });
    if (!r.ok) throw new Error('No se pudo generar el ticket');
    return r.blob();
  },

  /* ========================================================================
   *  ╔══════════════════════════════════════════════════════════════════════╗
   *  ║  POST {BASE}/reportes/pesajes.pdf                                    ║
   *  ╚══════════════════════════════════════════════════════════════════════╝
   *  Listado de producción del periodo filtrado (no confundir con el
   *  certificado individual de arriba).
   *
   *  ENVIAR:  { "desde": "2026-08-01", "hasta": "2026-08-31",
   *             "tipoMaterial": null, "bascula": "BASC-03" }
   *  RECIBIR: 200 con Content-Type: application/pdf (blob).
   *
   *  El CSV se genera siempre en el navegador y no necesita backend
   *  (ver js/reportes.js).
   * ======================================================================*/
  async reportePDF(filtros) {
    if (!this.enProduccion) { await espera(500); return null; }

    const r = await fetch(`${this.BASE}/reportes/pesajes.pdf`, {
      method: 'POST',
      headers: { ...this.cabeceras(), 'Accept': 'application/pdf' },
      body: JSON.stringify(filtros)
    });
    if (!r.ok) throw new Error('El servidor no pudo generar el reporte');
    return r.blob();
  },

  /* ========================================================================
   *  🗂️  5 · CATÁLOGOS
   *  ------------------------------------------------------------------------
   *  GET {BASE}/catalogos/materiales
   *  RECIBIR:
   *  [ { "codigo": "BOBINA_ALAMBRON", "nombre": "Bobina de Alambrón",
   *      "descripcion": "…", "icono": "disc-3" } ]
   *
   *  GET {BASE}/catalogos/basculas
   *  RECIBIR:
   *  [ { "codigo": "BASC-03", "nombre": "BASC-03 · Patio de bobinas" } ]
   * ======================================================================*/
  async listarMateriales() {
    if (!this.enProduccion) { await espera(90); return MockData.materiales; }
    return this.pedir('/catalogos/materiales');
  },

  async listarBasculas() {
    if (!this.enProduccion) { await espera(60); return MockData.basculas; }
    return this.pedir('/catalogos/basculas');
  },

  /* ========================================================================
   *  👤  6 · PERFIL
   *  ------------------------------------------------------------------------
   *  PUT {BASE}/usuarios/me
   *  ENVIAR:  { "nombre": "Javier López", "rol": "Supervisor de planta",
   *             "correo": "jlopez@incasa.com.ni", "bascula": "BASC-03" }
   *  RECIBIR: { "usuario": { …objeto actualizado… } }
   *
   *  PUT {BASE}/usuarios/me/clave
   *  ENVIAR:  { "claveActual": "…", "claveNueva": "…" }
   *  RECIBIR: 204   |   ERROR 400: { "error": "CLAVE_ACTUAL_INVALIDA" }
   * ======================================================================*/
  async guardarPerfil(datos) {
    if (!this.enProduccion) { await espera(320); return { usuario: datos }; }
    return this.pedir('/usuarios/me', { method: 'PUT', body: JSON.stringify(datos) });
  },

  async cambiarClave({ claveActual, claveNueva }) {
    if (!this.enProduccion) { await espera(320); return true; }
    return this.pedir('/usuarios/me/clave', {
      method: 'PUT',
      body: JSON.stringify({ claveActual, claveNueva })
    });
  }
};
