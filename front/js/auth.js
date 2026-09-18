/* ============================================================================
 *  INCASA · js/auth.js
 *  ---------------------------------------------------------------------------
 *  Punto de entrada de index.html. Al cargar pregunta al backend si el
 *  sistema ya tiene propietario (GET /auth/estado) y muestra una de dos
 *  pantallas:
 *
 *    · Configuración inicial → crea la cuenta del PROPIETARIO. Una sola vez.
 *    · Iniciar sesión        → el resto del tiempo.
 *
 *  No hay registro público: las demás cuentas se crean en Administración.
 *  Ninguna llamada de red vive aquí; todo pasa por js/api.js.
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
  $, $$, aviso, sesion, guardarSesion, marcarCampos, iniciarTema, montarInterruptorTema
} from './ui.js';

/* ============================================================================
 *  PANTALLAS
 * ==========================================================================*/

const PANTALLAS = {
  sesion: {
    forma: 'forma-acceso',
    rotulo: 'Turno activo',
    titulo: 'Iniciar sesión',
    sub: 'Identifícate para abrir la terminal de pesaje.'
  },
  configuracion: {
    forma: 'forma-configuracion',
    rotulo: 'Primer arranque',
    titulo: 'Configuración inicial',
    sub: 'Crea la cuenta del propietario del sistema.'
  },
  sinServidor: {
    forma: 'sin-servidor',
    rotulo: 'Sin conexión',
    titulo: 'Servidor no disponible',
    sub: 'La terminal no puede comunicarse con el sistema de pesaje.'
  }
};

function mostrar(cual) {
  Object.entries(PANTALLAS).forEach(([clave, cfg]) => {
    $('#' + cfg.forma).hidden = clave !== cual;
  });
  $('#acceso-rotulo').textContent = PANTALLAS[cual].rotulo;
  $('#acceso-titulo').textContent = PANTALLAS[cual].titulo;
  $('#acceso-sub').textContent = PANTALLAS[cual].sub;
  $(`#${PANTALLAS[cual].forma} input`)?.focus();
}

/** Pregunta al backend qué pantalla toca. */
async function decidirPantalla() {
  try {
    const { requiereConfiguracion } = await API.estado();
    mostrar(requiereConfiguracion ? 'configuracion' : 'sesion');
  } catch {
    mostrar('sinServidor');
  }
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
 * es una señal visual para que nadie ponga "1234" a la cuenta con más poder.
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
  'Aceptable, pero mejorable para la cuenta del propietario.',
  'Buena. Añade un símbolo para reforzarla.',
  'Excelente.'
];

function montarMedidorFuerza() {
  const campo = $('#p-clave');
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

/** Guarda la sesión y entra al panel. */
function entrar(datos, titulo) {
  guardarSesion(datos);
  aviso(titulo, `${datos.usuario.nombre} · ${datos.usuario.rolNombre}`, 'ok');
  setTimeout(() => { location.href = 'app.html'; }, 350);
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

    if (!usuario) return aviso('Falta el usuario', 'Escribe tu nombre de usuario', 'error');
    if (!clave)   return aviso('Falta la contraseña', 'Escribe tu contraseña', 'error');

    const liberar = ocupar(forma.querySelector('button[type="submit"]'));

    try {
      entrar(await API.login({ usuario, clave }), 'Bienvenido');
    } catch (error) {
      // 401 credenciales · 403 cuenta desactivada · o el servidor no responde.
      aviso('No se pudo entrar', error.message || 'Revisa tus credenciales', 'error');
      liberar();
    }
  });
}

/* ============================================================================
 *  CONFIGURACIÓN INICIAL · la cuenta del propietario
 * ==========================================================================*/

function montarConfiguracion() {
  const forma = $('#forma-configuracion');

  forma.addEventListener('submit', async ev => {
    ev.preventDefault();

    const datos = {
      nombres:           $('#p-nombres').value.trim(),
      apellidos:         $('#p-apellidos').value.trim(),
      usuario:           $('#p-usuario').value.trim(),
      correo:            $('#p-correo').value.trim(),
      clave:             $('#p-clave').value,
      codigoInstalacion: $('#p-codigo').value.trim()
    };

    /* --- Validación en cliente: sólo evita viajes de red. El backend la repite. --- */
    if (!datos.nombres || !datos.apellidos) {
      return aviso('Faltan datos', 'Escribe nombres y apellidos', 'error');
    }
    if (!/^[\w.-]{3,40}$/.test(datos.usuario)) {
      return aviso('Usuario inválido', 'De 3 a 40 caracteres: letras, números, punto o guion', 'error');
    }
    if (datos.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) {
      return aviso('Correo inválido', 'Revisa la dirección o déjala vacía', 'error');
    }
    if (datos.clave.length < 8) {
      return aviso('Contraseña corta', 'Usa al menos 8 caracteres', 'error');
    }
    if (datos.clave !== $('#p-repetir').value) {
      return aviso('No coinciden', 'La contraseña y su repetición son distintas', 'error');
    }
    if (!datos.codigoInstalacion) {
      return aviso('Falta el código', 'Escribe el código de instalación del servidor', 'error');
    }

    const liberar = ocupar(forma.querySelector('button[type="submit"]'));

    try {
      entrar(await API.configurar(datos), 'Sistema configurado');
    } catch (error) {
      aviso('No se pudo configurar', error.message || 'Revisa los datos', 'error');
      marcarCampos(error, {
        nombres: 'p-nombres', apellidos: 'p-apellidos', usuario: 'p-usuario',
        correo: 'p-correo', clave: 'p-clave', codigoInstalacion: 'p-codigo'
      }, forma);
      // Otro equipo pudo configurar el sistema mientras tanto.
      if (error.codigo === 'YA_CONFIGURADO') mostrar('sesion');
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

  montarOjos();
  montarMedidorFuerza();
  montarLogin();
  montarConfiguracion();
  $('#btn-reintentar').addEventListener('click', decidirPantalla);

  await decidirPantalla();
});
