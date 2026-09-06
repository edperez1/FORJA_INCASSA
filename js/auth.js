/* ============================================================================
 *  INCASA · js/auth.js
 *  ---------------------------------------------------------------------------
 *  Punto de entrada de index.html: inicio de sesión y alta de cuenta.
 *
 *  Ninguna llamada de red vive aquí. Todo pasa por API.login() y
 *  API.registrar() (js/api.js), así que este archivo NO cambia cuando exista
 *  el backend de Java: basta con poner API.MODO = 'produccion'.
 *  ==========================================================================*/

import '../css/tokens.css';
import '../css/base.css';
import '../css/components.css';
import '../css/acceso.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/700.css';

import { API } from './api.js';
import { montarIconos, icono } from './iconos.js';
import {
  $, $$, esc, aviso, sesion, guardarSesion, iniciarTema, montarInterruptorTema
} from './ui.js';

/* ============================================================================
 *  PESTAÑAS
 * ==========================================================================*/

const PANELES = {
  sesion: {
    forma: 'forma-acceso',
    titulo: 'Iniciar sesión',
    sub: 'Identifícate para abrir la terminal de pesaje.'
  },
  registro: {
    forma: 'forma-registro',
    titulo: 'Crear cuenta',
    sub: 'Alta de operario o administrador en el sistema de pesaje.'
  }
};

function mostrarPanel(cual) {
  $('#pestanas').dataset.activa = cual;

  $$('[data-panel]').forEach(b => {
    b.setAttribute('aria-selected', String(b.dataset.panel === cual));
  });

  Object.entries(PANELES).forEach(([clave, cfg]) => {
    $('#' + cfg.forma).hidden = clave !== cual;
  });

  $('#acceso-titulo').textContent = PANELES[cual].titulo;
  $('#acceso-sub').textContent = PANELES[cual].sub;

  // Enfocamos el primer campo del panel que acaba de aparecer.
  $(`#${PANELES[cual].forma} input`)?.focus();
}

/* ============================================================================
 *  CATÁLOGO DE BÁSCULAS
 * ==========================================================================*/

/** Rellena los dos desplegables de báscula desde GET /catalogos/basculas. */
async function llenarBasculas() {
  const basculas = await API.listarBasculas();

  const opciones = basculas
    .map(b => `<option value="${esc(b.codigo)}">${esc(b.nombre)}</option>`)
    .join('');

  ['#bascula', '#r-bascula'].forEach(sel => {
    const campo = $(sel);
    if (!campo) return;
    campo.innerHTML = opciones;
    // BAS-03 (patio de bobinas) es la báscula con más movimiento.
    if (basculas.some(b => b.codigo === 'BAS-03')) campo.value = 'BAS-03';
  });
}

/* ============================================================================
 *  UTILIDADES DE FORMULARIO
 * ==========================================================================*/

/** Alterna el tipo del campo de contraseña y el icono del botón. */
function montarOjos() {
  $$('[data-ojo]').forEach(boton => {
    boton.addEventListener('click', () => {
      const campo = document.getElementById(boton.dataset.ojo);
      const oculto = campo.type === 'password';

      campo.type = oculto ? 'text' : 'password';
      boton.innerHTML = icono(oculto ? 'eye-off' : 'eye');
      boton.setAttribute('aria-label', oculto ? 'Ocultar contraseña' : 'Mostrar contraseña');
      campo.focus();
    });
  });
}

/**
 * Fuerza de la contraseña, 0–4. No pretende ser un medidor criptográfico:
 * es una señal visual para que nadie registre "1234" en una terminal de planta.
 */
function nivelClave(clave) {
  if (!clave) return 0;
  let puntos = 0;
  if (clave.length >= 8) puntos++;
  if (clave.length >= 12) puntos++;
  if (/[A-Z]/.test(clave) && /[a-z]/.test(clave)) puntos++;
  if (/\d/.test(clave) && /[^\w\s]/.test(clave)) puntos++;
  return Math.min(4, puntos);
}

const TEXTO_FUERZA = [
  'Usa 8 o más caracteres, con números y mayúsculas.',
  'Muy débil. Añade longitud y variedad de caracteres.',
  'Aceptable, pero mejorable para una terminal de planta.',
  'Buena. Añade un símbolo para reforzarla.',
  'Excelente.'
];

function montarMedidorFuerza() {
  const campo = $('#r-clave');
  const medidor = $('#fuerza-clave');
  const texto = $('#fuerza-texto');

  campo.addEventListener('input', () => {
    const nivel = nivelClave(campo.value);
    medidor.dataset.nivel = String(nivel);
    texto.textContent = TEXTO_FUERZA[nivel];
  });
}

/** Deja el botón en estado «trabajando» y devuelve la función que lo restaura. */
function ocupar(boton) {
  boton.dataset.cargando = 'si';
  boton.disabled = true;
  return () => {
    delete boton.dataset.cargando;
    boton.disabled = false;
  };
}

/* ============================================================================
 *  INICIO DE SESIÓN
 * ==========================================================================*/

function montarLogin() {
  const forma = $('#forma-acceso');

  forma.addEventListener('submit', async ev => {
    ev.preventDefault();

    const usuario = $('#usuario').value.trim();
    const clave   = $('#clave').value;
    const bascula = $('#bascula').value;

    if (!usuario) return aviso('Falta el usuario', 'Escribe tu nombre de usuario', 'error');

    const liberar = ocupar(forma.querySelector('button[type="submit"]'));

    try {
      /* ╔══════════════════════════════════════════════════════════════════╗
         ║  La llamada completa vive en API.login() (js/api.js).            ║
         ║  Aquí sólo se maneja el resultado, así que este bloque NO cambia  ║
         ║  cuando exista el backend de Java.                               ║
         ╚══════════════════════════════════════════════════════════════════╝ */
      const datos = await API.login({ usuario, clave, bascula });

      guardarSesion(datos);
      aviso('Bienvenido', `${datos.usuario.nombre} · ${datos.usuario.bascula}`, 'ok');
      setTimeout(() => { location.href = 'app.html'; }, 350);

    } catch (error) {
      // Con backend real, aquí caen las credenciales inválidas (401).
      aviso('No se pudo entrar', error.message || 'Revisa tus credenciales', 'error');
      liberar();
    }
  });
}

/* ============================================================================
 *  ALTA DE CUENTA
 * ==========================================================================*/

function montarRegistro() {
  const forma = $('#forma-registro');

  forma.addEventListener('submit', async ev => {
    ev.preventDefault();

    const datos = {
      nombre:       $('#r-nombre').value.trim(),
      usuario:      $('#r-usuario').value.trim(),
      correo:       $('#r-correo').value.trim(),
      clave:        $('#r-clave').value,
      rol:          $('#r-rol').value,
      bascula:      $('#r-bascula').value,
      codigoPlanta: $('#r-planta').value.trim()
    };
    const repetir = $('#r-repetir').value;

    /* --- Validación en cliente. El backend de Java debe repetirla toda:
           esto sólo evita viajes de red innecesarios. --- */
    if (!datos.nombre)  return aviso('Falta el nombre', 'Escribe tu nombre completo', 'error');
    if (!datos.usuario) return aviso('Falta el usuario', 'Elige un nombre de usuario', 'error');
    if (!/^[\w.-]{3,}$/.test(datos.usuario)) {
      return aviso('Usuario inválido', 'Mínimo 3 caracteres: letras, números, punto o guion', 'error');
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) {
      return aviso('Correo inválido', 'Revisa la dirección de correo', 'error');
    }
    if (datos.clave.length < 8) {
      return aviso('Contraseña corta', 'Usa al menos 8 caracteres', 'error');
    }
    if (datos.clave !== repetir) {
      return aviso('No coinciden', 'La contraseña y su repetición son distintas', 'error');
    }
    if (!datos.codigoPlanta) {
      return aviso('Falta el código de planta', 'Lo entrega el administrador del sistema', 'error');
    }
    if (!$('#r-terminos').checked) {
      return aviso('Falta confirmar', 'Debes aceptar las normas de uso del sistema', 'error');
    }

    const liberar = ocupar(forma.querySelector('button[type="submit"]'));

    try {
      /* ╔══════════════════════════════════════════════════════════════════╗
         ║  POST {BASE}/auth/registro — contrato completo en js/api.js.     ║
         ║  Devuelve lo mismo que el login, así que el alta deja la sesión  ║
         ║  ya abierta y entramos directo al panel.                         ║
         ╚══════════════════════════════════════════════════════════════════╝ */
      const respuesta = await API.registrar(datos);

      guardarSesion(respuesta);
      aviso('Cuenta creada', `${respuesta.usuario.nombre} · ${respuesta.usuario.rol}`, 'ok');
      setTimeout(() => { location.href = 'app.html'; }, 600);

    } catch (error) {
      // 409 usuario existente · 403 código de planta · 422 validación.
      aviso('No se pudo registrar', error.message || 'Revisa los datos', 'error');
      liberar();
    }
  });
}

/* ============================================================================
 *  ARRANQUE
 * ==========================================================================*/

document.addEventListener('DOMContentLoaded', async () => {
  iniciarTema();
  montarIconos();
  montarInterruptorTema();

  // Si ya hay sesión abierta, no volvemos a pedir credenciales.
  if (sesion()) { location.replace('app.html'); return; }

  $$('[data-panel]').forEach(b => {
    b.addEventListener('click', () => mostrarPanel(b.dataset.panel));
  });
  $$('[data-ir-panel]').forEach(b => {
    b.addEventListener('click', () => mostrarPanel(b.dataset.irPanel));
  });

  montarOjos();
  montarMedidorFuerza();
  montarLogin();
  montarRegistro();

  await llenarBasculas();
});
