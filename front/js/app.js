/* ============================================================================
 *  INCASA · js/app.js
 *  ---------------------------------------------------------------------------
 *  Punto de entrada del panel (app.html): arranque, permisos, enrutado entre
 *  vistas, cabecera y «Mi perfil». Cada vista vive en su módulo:
 *
 *    vista-pesaje.js        Pesaje en vivo          (PESAR)
 *    vista-producciones.js  Producciones            (CONSULTAR)
 *    vista-historial.js     Historial de pesajes    (CONSULTAR)
 *    vista-reportes.js      Reportes gerenciales    (CONSULTAR)
 *    vista-admin.js         Administración          (GESTIONAR_* / VER_AUDITORIA)
 *
 *  Ninguna llamada de red vive aquí: todo pasa por API.* (js/api.js).
 *  ==========================================================================*/

import '../css/tokens.css';
import '../css/base.css';
import '../css/components.css';
import '../css/panel.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/700.css';

import { API } from './api.js';
import { Estado } from './estado.js';
import { montarIconos } from './iconos.js';
import { verDetalle } from './pesajes-modales.js';
import { VistaPesaje, abrirCertificado } from './vista-pesaje.js';
import { VistaProducciones } from './vista-producciones.js';
import { VistaHistorial } from './vista-historial.js';
import { VistaReportes } from './vista-reportes.js';
import { montarAdmin } from './vista-admin.js';
import {
  $, $$, aviso, miles, fechaHora, hora, iniciales, hoyISO, marcarCampos,
  iniciarTema, montarInterruptorTema, sesion, actualizarSesion, cerrarSesion, puede
} from './ui.js';

const TITULOS = {
  pesaje: 'Pesaje en vivo',
  producciones: 'Producciones',
  historial: 'Historial de pesajes',
  reportes: 'Reportes gerenciales',
  admin: 'Administración',
  perfil: 'Mi perfil'
};

const CLAVE_VISTA = 'incasa_vista';

const App = {
  vista: null,

  /* ======================================================================
   *  ARRANQUE
   * ====================================================================*/
  async iniciar() {
    iniciarTema();
    montarIconos();
    montarInterruptorTema();

    if (!sesion()) { location.replace('index.html'); return; }

    // El perfil se pide al servidor en cada arranque: si un administrador le
    // cambió el rol o lo desactivó, la pantalla lo refleja ya (un 401 expulsa).
    try {
      const { usuario } = await API.miPerfil();
      actualizarSesion(usuario);
      Estado.usuario = usuario;
      Estado.fijarCatalogos(await API.catalogos());
    } catch (error) {
      aviso('No se pudo cargar el panel', error.message, 'error');
      return;
    }

    this.aplicarPermisos();
    this.pintarUsuario();
    this.reloj();
    this.acciones();
    this.montarVistas();
    this.enrutar();
    this.pintarPerfil();
  },

  /**
   * Oculta lo que el rol no puede usar. `data-permiso` admite varios
   * permisos separados por espacio: basta con tener uno.
   */
  aplicarPermisos() {
    $$('[data-permiso]').forEach(el => {
      el.hidden = !el.dataset.permiso.split(/\s+/).some(p => puede(p));
    });
  },

  montarVistas() {
    const alCertificar = r => abrirCertificado(r);
    const alVerPesaje = r => verDetalle(r, { alCertificar });

    if (puede('PESAR')) VistaPesaje.montar();
    if (puede('CONSULTAR')) {
      VistaProducciones.montar({ ir: (v, o) => this.ir(v, o), alVerPesaje, alCertificar });
      VistaHistorial.montar({ alCertificar, alCambiar: () => VistaReportes.alCambiarHistorial() });
      VistaReportes.montar();
    }
    Estado.on('pesajes', () => this.pintarPerfil());
  },

  /* ======================================================================
   *  CABECERA Y ENRUTADO
   * ====================================================================*/

  pintarUsuario() {
    const u = Estado.usuario;
    $('#barra-nombre').textContent = u.nombre;
    $('#barra-rol').textContent = u.rolNombre;
    $('#ficha-usuario').textContent = iniciales(u.nombre);
  },

  reloj() {
    const pintar = () => { $('#reloj').textContent = hora(new Date().toISOString()); };
    pintar();
    setInterval(pintar, 1000);
  },

  /** ¿Puede este usuario abrir la vista? Mismo criterio que el menú. */
  permitida(vista) {
    const item = $(`.menu__item[data-vista="${vista}"]`);
    return Boolean(item) && !item.hidden;
  },

  enrutar() {
    $$('.menu__item[data-vista]').forEach(b => b.addEventListener('click', () => this.ir(b.dataset.vista)));
    $$('[data-ir]').forEach(b => b.addEventListener('click', () => this.ir(b.dataset.ir)));

    $('#btn-menu').addEventListener('click', () => {
      const lateral = $('#lateral');
      const abierto = lateral.dataset.abierto === 'si';
      lateral.dataset.abierto = abierto ? 'no' : 'si';
      $('#velo-menu').hidden = abierto;
      $('#btn-menu').setAttribute('aria-expanded', String(!abierto));
    });
    $('#velo-menu').addEventListener('click', () => this.cerrarMenuMovil());

    // La vista con la que se trabaja: el operario pesa, el administrador administra.
    let inicial = null;
    try { inicial = sessionStorage.getItem(CLAVE_VISTA); } catch { /* */ }
    if (!inicial || !this.permitida(inicial)) {
      inicial = ['pesaje', 'producciones', 'admin', 'perfil'].find(v => this.permitida(v));
    }
    this.ir(inicial);
  },

  /**
   * @param {string} vista
   * @param {object} [opciones]  { produccionId } para abrir el pesaje en una producción
   */
  ir(vista, opciones = {}) {
    if (!this.permitida(vista)) vista = 'perfil';

    if (this.vista === 'reportes' && vista !== 'reportes') VistaReportes.alOcultar();

    $$('.vista').forEach(v => { v.hidden = v.id !== 'vista-' + vista; });
    $$('.menu__item[data-vista]').forEach(b => {
      if (b.dataset.vista === vista) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#titulo-barra').textContent = TITULOS[vista];
    this.cerrarMenuMovil();
    window.scrollTo({ top: 0 });

    this.vista = vista;
    try { sessionStorage.setItem(CLAVE_VISTA, vista); } catch { /* */ }

    switch (vista) {
      case 'pesaje':
        VistaPesaje.alMostrar();
        if (opciones.produccionId) VistaPesaje.elegirProduccion(opciones.produccionId);
        break;
      case 'producciones': VistaProducciones.alMostrar(); break;
      case 'historial':    VistaHistorial.alMostrar(); break;
      case 'reportes':     VistaReportes.alMostrar(); break;
      case 'admin':
        montarAdmin($('#vista-admin'))
          // Lo que se cambió en Administración (productos, áreas…) llega a los formularios.
          .then(() => API.catalogos())
          .then(c => Estado.fijarCatalogos(c))
          .catch(() => { /* el propio panel ya avisó */ });
        break;
      case 'perfil':       this.pintarPerfil(); break;
    }
  },

  cerrarMenuMovil() {
    $('#lateral').dataset.abierto = 'no';
    $('#velo-menu').hidden = true;
    $('#btn-menu').setAttribute('aria-expanded', 'false');
  },

  /* ======================================================================
   *  ESCUCHAS
   * ====================================================================*/

  acciones() {
    const salir = async () => {
      try { await API.logout(); } catch { /* se sale igual */ }
      cerrarSesion();
      location.replace('index.html');
    };
    $('#btn-salir').addEventListener('click', salir);
    $('#btn-salir-2').addEventListener('click', salir);

    $('#forma-perfil').addEventListener('submit', ev => this.guardarPerfil(ev));
    $('#forma-clave').addEventListener('submit', ev => this.guardarClave(ev));
  },

  /* ======================================================================
   *  PERFIL
   * ====================================================================*/

  async pintarPerfil() {
    const u = Estado.usuario;
    $('#perfil-iniciales').textContent = iniciales(u.nombre);
    $('#perfil-nombre').textContent = u.nombre;
    $('#perfil-rol').textContent = u.rolNombre;
    $('#perfil-usuario').textContent = u.usuario;
    $('#perfil-ingreso').textContent = fechaHora(u.ingreso || new Date().toISOString());

    $('#p-nombres').value = u.nombres;
    $('#p-apellidos').value = u.apellidos;
    $('#p-usuario').value = u.usuario;
    $('#p-rol').value = u.rolNombre;
    $('#p-correo').value = u.correo || '';

    // Lo pesado hoy por este usuario.
    if (!puede('CONSULTAR')) return;
    try {
      const { datos } = await API.listarPesajes({ desde: hoyISO(), hasta: hoyISO() });
      const mios = datos.filter(r => r.operarioId === u.id);
      $('#perfil-pesajes').textContent = miles(mios.length);
      $('#perfil-kilos').textContent = `${miles(mios.reduce((s, r) => s + r.pesoNeto, 0), 1)} kg`;
    } catch { /* no es imprescindible */ }
  },

  async guardarPerfil(ev) {
    ev.preventDefault();

    const datos = {
      nombres: $('#p-nombres').value.trim(),
      apellidos: $('#p-apellidos').value.trim(),
      correo: $('#p-correo').value.trim()
    };
    if (!datos.nombres || !datos.apellidos) {
      return aviso('Faltan datos', 'Nombres y apellidos no pueden quedar vacíos', 'error');
    }

    const boton = ev.target.querySelector('button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      const { usuario } = await API.guardarPerfil(datos);
      Estado.usuario = usuario;
      actualizarSesion(usuario);
      this.pintarUsuario();
      this.pintarPerfil();
      $('#operario').value = usuario.nombre;
      aviso('Perfil actualizado', 'Los cambios ya están aplicados', 'ok');
    } catch (error) {
      aviso('No se pudo guardar', error.message || 'Intenta de nuevo', 'error');
      marcarCampos(error, { nombres: 'p-nombres', apellidos: 'p-apellidos', correo: 'p-correo' }, ev.target);
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  },

  async guardarClave(ev) {
    ev.preventDefault();

    const actual = $('#c-actual').value;
    const nueva = $('#c-nueva').value;
    const repetir = $('#c-repetir').value;

    if (!actual || !nueva) return aviso('Campos incompletos', 'Escribe la contraseña actual y la nueva', 'error');
    if (nueva.length < 8)  return aviso('Contraseña corta', 'Usa al menos 8 caracteres', 'error');
    if (nueva !== repetir) return aviso('No coinciden', 'La nueva contraseña y su repetición son distintas', 'error');

    const boton = ev.target.querySelector('button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      await API.cambiarClave({ claveActual: actual, claveNueva: nueva });
      ev.target.reset();
      aviso('Contraseña actualizada', 'Tus otras sesiones se cerraron', 'ok');
    } catch (error) {
      aviso('No se actualizó', error.message, 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.iniciar());

// Cómodo para depurar desde la consola del navegador.
window.App = App;
