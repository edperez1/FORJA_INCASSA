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
 * Los datos del equipo (modelo, capacidad, división) viajan en el propio
 * registro, así que no hace falta pasarlos aparte.
 *
 * @param {object} registro  pesaje ya guardado (con folio)
 * @returns {Promise<'servidor'|'navegador'>}
 */
export async function descargarCertificado(registro) {
  const blobDelServidor = await API.certificadoPesaje(registro.id);

  if (blobDelServidor instanceof Blob) {
    descargarBlob(blobDelServidor, nombreCertificado(registro));
    return 'servidor';
  }

  const { construirCertificado } = await import('./reportes-pdf.js');
  const doc = await construirCertificado(registro);
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
 *  IMPRESIÓN
 *  --------------------------------------------------------------------------
 *  El PDF se abre en una pestaña nueva con el diálogo de impresión ya lanzado
 *  (jsPDF `autoPrint`). La pestaña se abre ANTES de cualquier `await`: si se
 *  abriera después de generar el PDF, el navegador lo trataría como una
 *  ventana emergente no solicitada y la bloquearía.
 * ==========================================================================*/

/**
 * @param {Function} pedirAlServidor  () => Promise<Blob|null>
 * @param {Function} construir        () => Promise<jsPDF>
 * @param {string}   nombre           para la descarga de respaldo
 * @returns {Promise<'impreso'|'descargado'>}
 */
async function imprimirPDF(pedirAlServidor, construir, nombre) {
  const ventana = window.open('', '_blank');

  let blob;
  try {
    blob = await pedirAlServidor();
    if (!(blob instanceof Blob)) {
      const doc = await construir();
      doc.autoPrint();
      blob = doc.output('blob');
    }
  } catch (error) {
    ventana?.close();
    throw error;
  }

  // Emergentes bloqueadas: al menos que el operario se quede con el archivo.
  if (!ventana) {
    descargarBlob(blob, nombre);
    return 'descargado';
  }
  ventana.location.href = URL.createObjectURL(blob);
  return 'impreso';
}

/** Imprime el certificado A4 de un pesaje. */
export function imprimirCertificado(registro) {
  return imprimirPDF(
    () => API.certificadoPesaje(registro.id),
    async () => (await import('./reportes-pdf.js')).construirCertificado(registro),
    nombreCertificado(registro));
}

/** Imprime el ticket de 80 mm en la impresora térmica de la terminal. */
export function imprimirTicket(registro) {
  return imprimirPDF(
    () => API.ticketPesaje(registro.id),
    async () => (await import('./reportes-pdf.js')).construirTicket(registro),
    `Ticket-INCASA-${registro.folio}.pdf`);
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
