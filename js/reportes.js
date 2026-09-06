/* ============================================================================
 *  INCASA · js/reportes.js
 *  ---------------------------------------------------------------------------
 *  Salidas documentales del sistema.
 *
 *    · CSV          — siempre en el navegador. No necesita backend.
 *    · CERTIFICADO  — «CERTIFICADO DE PESAJE - INCASA» de una pesada (A4).
 *    · TICKET       — comprobante de 80 mm para la impresora térmica.
 *    · REPORTE      — listado del periodo filtrado (A4 apaisado).
 *
 *  Los PDF se piden primero al backend de Java. Si responde el blob se descarga
 *  el suyo; si no (modo simulación), se arman aquí con jsPDF. Las dos ramas
 *  acaban en la misma descarga, así que la vista no distingue una de otra y al
 *  conectar Java no hay que tocar nada.
 *
 *  jsPDF vive en js/reportes-pdf.js y se carga con `import()` dinámico: son
 *  ~300 kB que la terminal sólo descarga si alguien exporta de verdad.
 *  ==========================================================================*/

import { API } from './api.js';
import { COLUMNAS } from './reportes-columnas.js';
import { descargarBlob, descargarCSV, hoyISO } from './ui.js';

/* ============================================================================
 *  CSV
 * ==========================================================================*/

export function exportarCSV(registros) {
  descargarCSV(registros, COLUMNAS, `incasa-pesajes-${hoyISO()}.csv`);
}

/* ============================================================================
 *  CERTIFICADO DE PESAJE
 * ==========================================================================*/

/** Nombre de archivo del certificado: lleva el folio para archivarlo sin abrirlo. */
export const nombreCertificado = (registro) =>
  `Certificado-Pesaje-INCASA-${registro.folio || registro.id}.pdf`;

/**
 * Descarga el «Certificado de Pesaje - INCASA» de un pesaje.
 * Espejo de GET /pesajes/{id}/certificado.
 *
 * @param {object} registro  pesaje ya guardado (con folio)
 * @param {object} [equipo]  { modelo, capacidad, division } de la báscula
 * @returns {Promise<'servidor'|'navegador'>}
 */
export async function descargarCertificado(registro, equipo) {
  const blobDelServidor = await API.certificadoPesaje(registro.id);

  if (blobDelServidor instanceof Blob) {
    descargarBlob(blobDelServidor, nombreCertificado(registro));
    return 'servidor';
  }

  const { construirCertificado } = await import('./reportes-pdf.js');
  const doc = await construirCertificado(registro, equipo);
  doc.save(nombreCertificado(registro));
  return 'navegador';
}

/**
 * Descarga el ticket de 80 mm de un pesaje.
 * Espejo de GET /pesajes/{id}/ticket.
 *
 * @returns {Promise<'servidor'|'navegador'>}
 */
export async function descargarTicket(registro) {
  const blobDelServidor = await API.ticketPesaje(registro.id);

  if (blobDelServidor instanceof Blob) {
    descargarBlob(blobDelServidor, `Ticket-INCASA-${registro.folio}.pdf`);
    return 'servidor';
  }

  const { construirTicket } = await import('./reportes-pdf.js');
  const doc = await construirTicket(registro);
  doc.save(`Ticket-INCASA-${registro.folio}.pdf`);
  return 'navegador';
}

/* ============================================================================
 *  REPORTE DE PRODUCCIÓN
 * ==========================================================================*/

/**
 * Descarga el listado del periodo filtrado.
 *
 * @param {object[]} registros  filas ya filtradas que se van a imprimir
 * @param {object}   contexto   { filtros, resumen, usuario }
 * @returns {Promise<{origen: 'servidor'|'navegador', filas: number}>}
 */
export async function exportarPDF(registros, contexto) {
  const blobDelServidor = await API.reportePDF(contexto.filtros);

  if (blobDelServidor instanceof Blob) {
    descargarBlob(blobDelServidor, `incasa-reporte-${hoyISO()}.pdf`);
    return { origen: 'servidor', filas: registros.length };
  }

  const { construirReporte } = await import('./reportes-pdf.js');
  const doc = await construirReporte(registros, contexto);
  doc.save(`incasa-reporte-${hoyISO()}.pdf`);
  return { origen: 'navegador', filas: registros.length };
}
