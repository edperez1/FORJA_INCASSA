/* ============================================================================
 *  INCASA · js/ui.js
 *  ---------------------------------------------------------------------------
 *  Utilidades compartidas por las dos páginas: selectores, tema claro/oscuro,
 *  avisos, formato de números, modales, descargas y sesión.
 *
 *  No hace ninguna llamada de red. Toda la red vive en js/api.js.
 *  ==========================================================================*/

import { icono, montarIconos } from './iconos.js';

const CLAVE_TEMA = 'incasa_tema';
const CLAVE_TOKEN = 'incasa_token';
const CLAVE_USUARIO = 'incasa_usuario';

export const $  = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

/* ============================================================================
 *  TEMA
 * ==========================================================================*/

/**
 * Aplica el tema guardado antes del primer pintado. Si el operario nunca ha
 * elegido, se respeta la preferencia del sistema; el claro es el
 * predeterminado porque la marca de INCASA es pizarra sobre blanco y es el
 * modo con más contraste bajo la luz de nave.
 */
export function iniciarTema() {
  let tema = null;
  try { tema = localStorage.getItem(CLAVE_TEMA); } catch { /* modo privado */ }

  if (!tema) {
    tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  document.documentElement.dataset.tema = tema;
  return tema;
}

export function fijarTema(tema) {
  document.documentElement.dataset.tema = tema;
  try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* sin persistencia */ }
  sincronizarBotonesTema();
}

export function temaActual() {
  return document.documentElement.dataset.tema || 'claro';
}

function sincronizarBotonesTema() {
  const actual = temaActual();
  $$('[data-tema-btn]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.temaBtn === actual));
  });
}

/** Conecta cualquier bloque `.tema` presente en la página. */
export function montarInterruptorTema() {
  $$('[data-tema-btn]').forEach(b => {
    b.addEventListener('click', () => fijarTema(b.dataset.temaBtn));
  });
  sincronizarBotonesTema();
}

/* ============================================================================
 *  AVISOS (toasts)
 * ==========================================================================*/

const ICONO_AVISO = {
  ok: 'circle-check',
  error: 'circle-alert',
  alerta: 'triangle-alert',
  '': 'info'
};

/**
 * UI.aviso('Pesaje guardado', 'Folio PS-004821', 'ok')
 * @param {'ok'|'error'|'alerta'|''} tipo
 */
export function aviso(titulo, detalle = '', tipo = '') {
  const caja = document.getElementById('avisos');
  if (!caja) return;

  const el = document.createElement('div');
  el.className = 'aviso' + (tipo ? ' aviso--' + tipo : '');
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');

  // El icono es HTML de confianza (viene del catálogo); el texto NO, así que
  // se asigna con textContent para que un lote llamado "<img onerror>" no
  // ejecute nada.
  el.innerHTML = `
    <span class="aviso__icono">${icono(ICONO_AVISO[tipo] ?? 'info')}</span>
    <div><b></b>${detalle ? '<p></p>' : ''}</div>`;
  el.querySelector('b').textContent = titulo;
  if (detalle) el.querySelector('p').textContent = detalle;

  caja.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px) scale(.97)';
    setTimeout(() => el.remove(), 320);
  }, 3800);
}

/* ============================================================================
 *  FORMATO
 * ==========================================================================*/

/**
 * Formato de peso en kilogramos.
 * Un solo decimal, porque la división del Hiweight X10 es 0,5 kg: mostrar
 * centésimas sería fingir una precisión que la celda no tiene.
 * Siempre el mismo ancho, para que el visor no baile.
 */
export const kg = (n) => Number(n || 0).toFixed(1);

/** 15234.8 → "15 234,8" */
export function miles(n, decimales = 0) {
  return Number(n || 0).toLocaleString('es-NI', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

const dosDigitos = (n) => String(n).padStart(2, '0');

/** ISO → "21/08/2026 15:04" */
export function fechaHora(iso) {
  const d = new Date(iso);
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/** ISO → "21/08/2026" */
export function fecha(iso) {
  const d = new Date(iso);
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO → "15:04:11" */
export function hora(iso) {
  const d = new Date(iso);
  return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}:${dosDigitos(d.getSeconds())}`;
}

/** ISO → "hace 4 min" · para el historial reciente. */
export function relativo(iso) {
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'hace instantes';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

/** "Javier López" → "JL" */
export function iniciales(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2)
    .map(p => p[0] || '').join('').toUpperCase() || '--';
}

/** Fecha de hoy en formato `YYYY-MM-DD`, en hora local (no UTC). */
export function hoyISO(desplazamientoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamientoDias);
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/**
 * Escapa texto que va a interpolarse dentro de una plantilla HTML.
 * El historial pinta observaciones escritas por operarios; sin esto, un
 * `<` en un comentario rompería la tabla.
 */
export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ============================================================================
 *  MICRO-INTERACCIONES
 * ==========================================================================*/

/**
 * Anima un número desde su valor actual hasta el nuevo. Se usa en las
 * tarjetas de indicadores: el salto seco de 0 a 15 234 no comunica nada,
 * el conteo sí deja ver la magnitud.
 */
export function contarHasta(el, destino, { decimales = 0, sufijo = '', ms = 620 } = {}) {
  if (!el) return;

  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desde = Number(el.dataset.valor || 0);
  el.dataset.valor = String(destino);

  const pintar = (v) => {
    el.innerHTML = miles(v, decimales) + sufijo;
  };

  if (reducido || desde === destino) { pintar(destino); return; }

  const inicio = performance.now();
  const paso = (ahora) => {
    const t = Math.min(1, (ahora - inicio) / ms);
    // easeOutCubic: arranca rápido y frena, se lee como un contador mecánico.
    const e = 1 - Math.pow(1 - t, 3);
    pintar(desde + (destino - desde) * e);
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/* ============================================================================
 *  MODALES
 *  --------------------------------------------------------------------------
 *  Un único contenedor `#modales` en el HTML. Cada modal se monta, atrapa el
 *  foco y se desmonta con animación. Devuelven una promesa para poder
 *  escribir  `if (await confirmar(...))`.
 * ==========================================================================*/

let modalAbierto = null;

/**
 * Monta un modal genérico.
 * @param {object} cfg
 * @param {string} cfg.html          contenido completo del `.modal`
 * @param {string} [cfg.ancho]       'angosto' | 'ancho'
 * @param {(caja: HTMLElement, cerrar: Function) => void} [cfg.alMontar]
 * @param {() => void} [cfg.alCerrar]  se ejecuta siempre, se cierre como se cierre
 * @returns {{ caja: HTMLElement, cerrar: Function }}
 */
export function abrirModal({ html, ancho = '', alMontar, alCerrar }) {
  const anfitrion = document.getElementById('modales');
  if (!anfitrion) return null;

  const enfocadoAntes = document.activeElement;

  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${ancho ? 'modal--' + ancho : ''}"
                          role="dialog" aria-modal="true">${html}</div>`;
  anfitrion.appendChild(fondo);
  document.body.classList.add('sin-scroll');
  montarIconos(fondo);

  const caja = fondo.querySelector('.modal');

  const cerrar = () => {
    if (fondo.dataset.cerrando === 'si') return;
    fondo.dataset.cerrando = 'si';
    document.removeEventListener('keydown', alTeclear);
    setTimeout(() => {
      fondo.remove();
      if (!anfitrion.children.length) document.body.classList.remove('sin-scroll');
      if (modalAbierto === cerrar) modalAbierto = null;
      // Devolvemos el foco a donde estaba: obligatorio para lectores de pantalla.
      if (enfocadoAntes?.isConnected) enfocadoAntes.focus();
    }, 150);
    alCerrar?.();
  };
  modalAbierto = cerrar;

  /* Escape cierra; Tab queda atrapado dentro del diálogo. */
  const alTeclear = (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); return; }
    if (ev.key !== 'Tab') return;

    const focales = $$(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])', caja
    );
    if (!focales.length) return;

    const primero = focales[0];
    const ultimo = focales[focales.length - 1];
    if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
  };
  document.addEventListener('keydown', alTeclear);

  // Clic en el velo (nunca dentro del diálogo) cierra.
  fondo.addEventListener('mousedown', ev => { if (ev.target === fondo) cerrar(); });
  $$('[data-cerrar]', caja).forEach(b => b.addEventListener('click', cerrar));

  alMontar?.(caja, cerrar);

  // Enfocamos el primer control útil, saltándonos la «X» de cerrar.
  const primerUtil = caja.querySelector(
    'input:not([readonly]), select, textarea, .modal__pie .btn'
  );
  (primerUtil || caja.querySelector('button'))?.focus();

  return { caja, cerrar };
}

/**
 * Diálogo de confirmación. Resuelve `true` si el usuario acepta.
 *
 *   if (await confirmar({ titulo: 'Eliminar pesaje', ... })) { … }
 */
export function confirmar({
  titulo,
  mensaje,
  detalleHTML = '',
  textoAceptar = 'Confirmar',
  textoCancelar = 'Cancelar',
  peligro = true
} = {}) {
  return new Promise(resolver => {
    // Se resuelve una sola vez: `alCerrar` corre siempre, así que si el
    // operario aceptó ya está decidido y el cierre no lo contradice.
    let respuesta = false;
    let resuelto = false;
    const decidir = () => { if (!resuelto) { resuelto = true; resolver(respuesta); } };

    abrirModal({
      ancho: 'angosto',
      alCerrar: decidir,
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello ${peligro ? '' : 'modal__sello--info'}">
            <i data-icono="${peligro ? 'triangle-alert' : 'info'}"></i>
          </span>
          <div>
            <h3>${esc(titulo)}</h3>
            <p>${esc(mensaje)}</p>
          </div>
        </div>
        ${detalleHTML ? `<div class="modal__cuerpo">${detalleHTML}</div>` : ''}
        <div class="modal__pie">
          <button type="button" class="btn btn--linea" data-no>${esc(textoCancelar)}</button>
          <button type="button" class="btn ${peligro ? 'btn--peligro' : 'btn--primario'}" data-si>
            ${esc(textoAceptar)}
          </button>
        </div>`,
      alMontar(caja, cerrarModal) {
        caja.querySelector('[data-si]').addEventListener('click', () => {
          respuesta = true;
          cerrarModal();
        });
        caja.querySelector('[data-no]').addEventListener('click', cerrarModal);
        caja.querySelector('[data-si]').focus();
      }
    });
  });
}

/* ============================================================================
 *  DESCARGAS
 * ==========================================================================*/

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Damos un respiro al navegador antes de liberar el objeto.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convierte un arreglo de objetos en CSV y lo descarga.
 * Separador ";" y BOM UTF-8 para que Excel en español lo abra sin asistente.
 */
export function descargarCSV(filas, columnas, nombreArchivo) {
  const escapar = v => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const cabecera = columnas.map(c => escapar(c.titulo)).join(';');
  const cuerpo = filas.map(f => columnas.map(c => escapar(c.valor(f))).join(';'));
  const csv = '﻿' + [cabecera, ...cuerpo].join('\r\n');
  descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), nombreArchivo);
}

/* ============================================================================
 *  SESIÓN
 *  --------------------------------------------------------------------------
 *  TODO: en producción el token debe viajar en una cookie httpOnly emitida por
 *  el backend de Java, y el perfil pedirse con GET /usuarios/me al arrancar.
 *  Mientras tanto vive en sessionStorage para que la demo sea autocontenida.
 * ==========================================================================*/

export function guardarSesion(datos) {
  sessionStorage.setItem(CLAVE_TOKEN, datos.token);
  sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
}

export function sesion() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_USUARIO)); }
  catch { return null; }
}

export function actualizarSesion(usuario) {
  sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_TOKEN);
  sessionStorage.removeItem(CLAVE_USUARIO);
}

/* Espacio de nombres agrupado, cómodo para depurar desde la consola. */
export const UI = {
  $, $$,
  iniciarTema, fijarTema, temaActual, montarInterruptorTema,
  aviso, kg, miles, fecha, fechaHora, hora, relativo, iniciales, hoyISO, esc,
  contarHasta, abrirModal, confirmar,
  descargarBlob, descargarCSV,
  guardarSesion, sesion, actualizarSesion, cerrarSesion
};
