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

/** Nombre legible de un tipo de material a partir de su código. */
export const NOMBRE_MATERIAL = {
  BOBINA_ALAMBRON: 'Bobina de Alambrón',
  PRODUCTO_SEMIELABORADO: 'Producto Semielaborado'
};

export const nombreMaterial = (codigo) => NOMBRE_MATERIAL[codigo] || codigo || '—';

/**
 * `ancho` es en milímetros y sólo lo usa el PDF; el CSV lo ignora.
 *
 * ⚠️  La suma de anchos debe caber en el área imprimible del A4 apaisado:
 *     297 mm de papel − 24 mm de márgenes = 273 mm. Si se pasa, la última
 *     columna se sale de la página sin avisar. Hay una comprobación al final
 *     de este archivo que lo canta en consola durante el desarrollo.
 */
export const COLUMNAS = [
  { titulo: 'Folio',          ancho: 24, valor: r => r.folio },
  { titulo: 'Fecha y hora',   ancho: 28, valor: r => fechaHora(r.capturadoEn) },
  { titulo: 'Orden trabajo',  ancho: 28, valor: r => r.ordenTrabajo },
  { titulo: 'Código rollo',   ancho: 26, valor: r => r.codigoRollo },
  { titulo: 'Tipo material',  ancho: 38, valor: r => nombreMaterial(r.tipoMaterial) },
  { titulo: 'Operario',       ancho: 30, valor: r => r.operario },
  { titulo: 'Bruto (kg)',     ancho: 20, valor: r => kg(r.pesoBruto), num: true },
  { titulo: 'Tara (kg)',      ancho: 18, valor: r => kg(r.tara), num: true },
  { titulo: 'Neto (kg)',      ancho: 20, valor: r => kg(r.pesoNeto), num: true },
  { titulo: 'Báscula',        ancho: 20, valor: r => r.bascula },
  { titulo: 'Observaciones',  ancho: 21, valor: r => r.observaciones || '' }
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
