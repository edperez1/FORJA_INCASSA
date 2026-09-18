/* ============================================================================
 *  INCASA · js/reportes-columnas.js
 *  ---------------------------------------------------------------------------
 *  Definición única de las columnas del listado exportable. La comparten el
 *  CSV (js/reportes.js) y el reporte PDF (js/reportes-pdf.js), así que añadir
 *  un campo se hace en un solo sitio.
 *
 *  Vive aparte de los dos para que el CSV no tenga que arrastrar jsPDF.
 *  ==========================================================================*/

import { kg, fechaHora } from './ui.js';

/** Nombre legible del tipo de pesaje. */
export const NOMBRE_TIPO = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida'
};

export const nombreTipo = (tipo) => NOMBRE_TIPO[tipo] || tipo || '—';

/** Icono de cada tipo: la bobina entra al proceso, el producto sale de él. */
export const ICONO_TIPO = {
  ENTRADA: 'arrow-down-to-line',
  SALIDA: 'arrow-up-from-line'
};

export const iconoTipo = (tipo) => ICONO_TIPO[tipo] || 'scale';

/**
 * `ancho` es en milímetros y sólo lo usa el PDF; el CSV lo ignora.
 *
 * ⚠️  La suma de anchos debe caber en el área imprimible del A4 apaisado:
 *     297 mm de papel − 24 mm de márgenes = 273 mm. Si se pasa, la última
 *     columna se sale de la página sin avisar. Hay una comprobación al final
 *     de este archivo que lo canta en consola durante el desarrollo.
 */
export const COLUMNAS = [
  { titulo: 'Folio',          ancho: 20, valor: r => r.folio },
  { titulo: 'Fecha y hora',   ancho: 26, valor: r => fechaHora(r.capturadoEn) },
  { titulo: 'Producción',     ancho: 22, valor: r => r.produccion || '' },
  { titulo: 'Tipo',           ancho: 16, valor: r => nombreTipo(r.tipo) },
  { titulo: 'Bobina / lote',  ancho: 26, valor: r => r.codigoBobina || '' },
  { titulo: 'Producto',       ancho: 28, valor: r => r.producto || '' },
  { titulo: 'Operario',       ancho: 30, valor: r => r.operario || '' },
  { titulo: 'Bruto (kg)',     ancho: 19, valor: r => kg(r.pesoBruto), num: true },
  { titulo: 'Tara (kg)',      ancho: 17, valor: r => kg(r.tara), num: true },
  { titulo: 'Neto (kg)',      ancho: 19, valor: r => kg(r.pesoNeto), num: true },
  // Sólo las salidas: el producto que dejaron, en la unidad de su producción.
  { titulo: 'Producido',      ancho: 20, valor: r => (r.cantidad != null ? `${r.cantidad} ${r.unidadProduccion || ''}` : ''), num: true },
  { titulo: 'Observaciones',  ancho: 30, valor: r => r.observaciones || '' }
];

/** Ancho imprimible del A4 apaisado con los márgenes del reporte. */
export const ANCHO_IMPRIMIBLE = 273;

/* Red de seguridad en desarrollo: si alguien añade una columna sin recortar
   las demás, el aviso sale en consola antes de que nadie imprima un reporte
   con la última columna cortada. */
if (import.meta.env?.DEV) {
  const total = COLUMNAS.reduce((s, c) => s + c.ancho, 0);
  if (total > ANCHO_IMPRIMIBLE) {
    console.warn(
      `[reportes] Las columnas suman ${total} mm y sólo caben ${ANCHO_IMPRIMIBLE} mm ` +
      `en el A4 apaisado. Recorta ${total - ANCHO_IMPRIMIBLE} mm o el reporte saldrá cortado.`
    );
  }
}
