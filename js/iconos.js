/* ============================================================================
 *  INCASA · js/iconos.js
 *  ---------------------------------------------------------------------------
 *  Puente con Lucide. Se importan sólo los iconos que se usan, así el paquete
 *  final lleva ~45 trazados y no la biblioteca entera (2000+).
 *
 *  Dos formas de usarlos:
 *
 *    1. En HTML estático:   <i data-icono="scale"></i>
 *       …y al arrancar la vista se llama a montarIconos() para sustituirlos.
 *
 *    2. En plantillas JS:   `${icono('trash-2')}`
 *       Devuelve la cadena SVG lista para interpolar.
 *  ==========================================================================*/

import {
  Scale, Weight, History, ChartColumn, User, LogOut, LogIn, UserPlus,
  Menu, Sun, Moon, Eye, EyeOff, Trash2, Pencil, Search, X,
  FileDown, FileText, FileCheck, Printer, Save, RotateCcw, Eraser,
  TriangleAlert, CircleCheck, CircleAlert, Info, ShieldCheck,
  Disc3, Package, Boxes, Layers, Factory, Warehouse, Truck, Cable,
  Target, Check, Ruler, Sigma, TrendingUp, Inbox, Gauge,
  RadioTower, Play, CircleStop, Keyboard, Clock,
  Lock, KeyRound, Mail, IdCard, CalendarDays, ArrowRight, ClipboardList
} from 'lucide';

/** Catálogo local: nombre en kebab-case → nodo de Lucide. */
const CATALOGO = {
  /* Báscula y pesaje */
  'scale': Scale,
  'weight': Weight,
  'gauge': Gauge,
  'target': Target,
  'layers': Layers,

  /* Materiales de acero y alambrón */
  'disc-3': Disc3,          // bobina de alambrón (sección enrollada)
  'package': Package,       // producto semielaborado
  'boxes': Boxes,
  'cable': Cable,
  'factory': Factory,
  'warehouse': Warehouse,
  'truck': Truck,

  /* Navegación e identidad */
  'history': History,
  'chart-column': ChartColumn,
  'user': User,
  'log-out': LogOut,
  'log-in': LogIn,
  'user-plus': UserPlus,
  'menu': Menu,
  'sun': Sun,
  'moon': Moon,
  'id-card': IdCard,

  /* Acciones */
  'eye': Eye,
  'eye-off': EyeOff,
  'trash-2': Trash2,
  'pencil': Pencil,
  'search': Search,
  'x': X,
  'save': Save,
  'rotate-ccw': RotateCcw,
  'eraser': Eraser,
  'check': Check,
  'arrow-right': ArrowRight,

  /* Fuente de lectura de la báscula */
  'radio-tower': RadioTower,
  'play': Play,
  'circle-stop': CircleStop,
  'keyboard': Keyboard,
  'clock': Clock,

  /* Documentos */
  'file-down': FileDown,
  'file-text': FileText,
  'file-check': FileCheck,   // certificado de pesaje
  'printer': Printer,
  'clipboard-list': ClipboardList,

  /* Estados y avisos */
  'triangle-alert': TriangleAlert,
  'circle-check': CircleCheck,
  'circle-alert': CircleAlert,
  'info': Info,
  'shield-check': ShieldCheck,

  /* Datos y métricas */
  'ruler': Ruler,
  'sigma': Sigma,
  'trending-up': TrendingUp,
  'inbox': Inbox,
  'calendar-days': CalendarDays,

  /* Acceso */
  'lock': Lock,
  'key-round': KeyRound,
  'mail': Mail
};

/** Atributos comunes del contenedor <svg>. */
const BASE = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.8',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true'
};

const atributos = (obj) =>
  Object.entries(obj).map(([k, v]) => `${k}="${v}"`).join(' ');

/**
 * Devuelve el SVG de un icono como cadena, listo para interpolar en una
 * plantilla. Si el nombre no existe devuelve cadena vacía en lugar de romper
 * el render: un icono que falta nunca debe tumbar una tabla de producción.
 *
 * @param {string} nombre   clave del catálogo, p. ej. 'trash-2'
 * @param {object} [extra]  atributos añadidos al <svg> (class, width…)
 */
export function icono(nombre, extra = {}) {
  const nodo = CATALOGO[nombre];
  if (!nodo) {
    console.warn(`[iconos] "${nombre}" no está en el catálogo de js/iconos.js`);
    return '';
  }
  const hijos = nodo
    .map(([etiqueta, attrs]) => `<${etiqueta} ${atributos(attrs)}/>`)
    .join('');
  return `<svg ${atributos({ ...BASE, ...extra })}>${hijos}</svg>`;
}

const plantilla = document.createElement('template');

/**
 * Sustituye los marcadores `<i data-icono="…">` del HTML estático por su SVG.
 *
 * El `<i>` se REEMPLAZA, no se rellena. Envolver el SVG dejaría un elemento
 * extra en medio y rompería los selectores de hijo directo (`.campo__control >
 * svg`), que es justo lo que coloca el icono dentro de un campo. Además hace
 * la función idempotente por construcción: el marcador ya no existe, así que
 * puede llamarse tras cada render parcial sin coste.
 *
 * @param {ParentNode} [raiz=document]
 */
export function montarIconos(raiz = document) {
  raiz.querySelectorAll('i[data-icono]').forEach(hueco => {
    const extra = {};
    if (hueco.dataset.grosor) extra['stroke-width'] = hueco.dataset.grosor;
    if (hueco.className) extra.class = hueco.className;

    const svg = icono(hueco.dataset.icono, extra);
    if (!svg) return;

    plantilla.innerHTML = svg;
    hueco.replaceWith(plantilla.content.firstElementChild);
  });
}
