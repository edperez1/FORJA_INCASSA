/* ============================================================================
 *  INCASA · js/reportes-pdf.js
 *  ---------------------------------------------------------------------------
 *  Maquetación de los documentos PDF con jsPDF:
 *
 *    · construirCertificado()  → «CERTIFICADO DE PESAJE - INCASA» (A4 vertical),
 *                                el documento oficial de UNA pesada.
 *    · construirTicket()       → ticket de 80 mm para la impresora térmica.
 *    · construirReporte()      → listado de producción del periodo (A4 apaisado).
 *
 *  Los tres llevan el logotipo real (`public/logo-incasa.jpg`) incrustado.
 *
 *  Este módulo se carga BAJO DEMANDA desde js/reportes.js (import dinámico):
 *  jsPDF pesa unos 300 kB y no tiene sentido que la terminal los descargue
 *  sólo para pesar bobinas.
 *  ==========================================================================*/

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { COLUMNAS, nombreMaterial } from './reportes-columnas.js';
import { kg, miles, fecha, fechaHora } from './ui.js';

/* Paleta corporativa en RGB para jsPDF. */
const TINTA = {
  pizarra:  [63, 74, 80],     // #3F4A50
  oscuro:   [45, 53, 57],     // #2D3539
  verde:    [0, 135, 68],     // #008744
  verdeOsc: [20, 92, 37],
  verdeSuave: [227, 245, 235],
  ambar:    [230, 154, 0],    // #E69A00
  gris:     [110, 122, 130],
  linea:    [221, 226, 229],
  nieve:    [248, 249, 250]
};

/* ============================================================================
 *  LOGOTIPO
 * ==========================================================================*/

/** Ruta del logotipo oficial. Cambia aquí si se renombra el archivo. */
const RUTA_LOGO = '/logo-incasa.jpg';

let logoCache = null;

/**
 * Carga `public/logo-incasa.jpg` y lo devuelve como data URL para jsPDF.
 * Se cachea: el operario puede emitir decenas de certificados por turno y no
 * tiene sentido volver a leer el archivo cada vez.
 *
 * Si el archivo no está, devuelve `null` y los documentos se dibujan con el
 * recuadro de respaldo: un certificado sin logo es mejor que un error.
 */
export async function cargarLogo() {
  if (logoCache !== null) return logoCache;

  try {
    const r = await fetch(RUTA_LOGO);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();

    logoCache = await new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result);
      lector.onerror = () => rechazar(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`[pdf] No se pudo cargar ${RUTA_LOGO}; el documento saldrá sin logotipo.`, e);
    logoCache = false;   // false = intentado y fallido, no reintentar
  }

  return logoCache;
}

/** Dibuja el logotipo, o un recuadro con las iniciales si no está disponible. */
function dibujarLogo(doc, logo, x, y, lado) {
  if (logo) {
    // El JPG ya trae fondo pizarra opaco, así que se coloca tal cual.
    doc.addImage(logo, 'JPEG', x, y, lado, lado);
    return;
  }
  doc.setFillColor(...TINTA.pizarra);
  doc.roundedRect(x, y, lado, lado, lado * 0.16, lado * 0.16, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(lado * 0.34);
  doc.text('IC', x + lado / 2, y + lado * 0.62, { align: 'center' });
}

/** Cabecera común: banda pizarra con logotipo y subtítulo. */
function dibujarCabecera(doc, logo, ancho, subtitulo, alto = 30) {
  doc.setFillColor(...TINTA.pizarra);
  doc.rect(0, 0, ancho, alto, 'F');

  const lado = alto - 10;
  dibujarLogo(doc, logo, 14, 5, lado);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('INCASA', 18 + lado, alto / 2 - 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 208, 213);
  doc.text('Industria Centroamericana, S.A.', 18 + lado, alto / 2 + 4.5);

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(subtitulo, ancho - 14, alto / 2 - 1, { align: 'right' });

  return alto;
}

/* ============================================================================
 *  1 · CERTIFICADO DE PESAJE  (A4 vertical)
 *  --------------------------------------------------------------------------
 *  Documento oficial de una sola pesada. Es lo que acompaña a la bobina y lo
 *  que se archiva: por eso lleva folio, datos del equipo y espacio de firmas.
 * ==========================================================================*/

/**
 * @param {object} registro  el pesaje ya guardado (con `folio`)
 * @param {object} [equipo]  { modelo, capacidad, division }
 * @returns {Promise<jsPDF>}
 */
export async function construirCertificado(registro, equipo = {}) {
  const logo = await cargarLogo();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();   // 210
  const alto = doc.internal.pageSize.getHeight();   // 297

  const modelo = equipo.modelo || registro.modeloBascula || 'Hiweight X10';
  const capacidad = equipo.capacidad ?? 4600;
  const division = equipo.division ?? 0.5;

  dibujarCabecera(doc, logo, ancho, 'Documento controlado', 32);

  /* ---------- Título ---------- */
  let y = 46;
  doc.setTextColor(...TINTA.oscuro);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('CERTIFICADO DE PESAJE', ancho / 2, y, { align: 'center' });

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TINTA.gris);
  doc.text('Sistema de Pesaje INCASA · Nicaragua', ancho / 2, y, { align: 'center' });

  /* ---------- Folio y fecha ---------- */
  y += 9;
  doc.setDrawColor(...TINTA.linea);
  doc.setFillColor(...TINTA.nieve);
  doc.roundedRect(14, y, ancho - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...TINTA.gris);
  doc.text('FOLIO DEL CERTIFICADO', 20, y + 6.5);
  doc.text('FECHA Y HORA DE PESAJE', ancho - 20, y + 6.5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TINTA.oscuro);
  doc.text(String(registro.folio || '—'), 20, y + 13.5);
  doc.text(fechaHora(registro.capturadoEn), ancho - 20, y + 13.5, { align: 'right' });

  y += 26;

  /** Bloque titulado con pares rótulo/valor en dos columnas. */
  const bloque = (titulo, pares) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TINTA.pizarra);
    doc.text(titulo.toUpperCase(), 14, y);

    y += 2;
    doc.setDrawColor(...TINTA.pizarra);
    doc.setLineWidth(0.4);
    doc.line(14, y, ancho - 14, y);
    y += 6;

    const anchoCol = (ancho - 28) / 2;
    pares.forEach((par, i) => {
      const col = i % 2;
      const x = 14 + col * anchoCol;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TINTA.gris);
      doc.text(par[0].toUpperCase(), x, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...TINTA.oscuro);
      doc.text(String(par[1] ?? '—'), x, y + 5.5);

      if (col === 1 || i === pares.length - 1) y += 13;
    });
    y += 4;
  };

  bloque('Identificación del material', [
    ['Tipo de material', nombreMaterial(registro.tipoMaterial)],
    ['Código de rollo / lote', registro.codigoRollo],
    ['Orden de trabajo', registro.ordenTrabajo],
    ['Operario responsable', registro.operario]
  ]);

  /* ---------- Pesos: el corazón del certificado ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TINTA.pizarra);
  doc.text('RESULTADO DE LA PESADA', 14, y);
  y += 2;
  doc.setDrawColor(...TINTA.pizarra);
  doc.line(14, y, ancho - 14, y);
  y += 6;

  const anchoCaja = (ancho - 28 - 8) / 3;
  [
    ['PESO BRUTO', kg(registro.pesoBruto), false],
    ['TARA',       kg(registro.tara), false],
    ['PESO NETO',  kg(registro.pesoNeto), true]
  ].forEach(([rotulo, valor, destacado], i) => {
    const x = 14 + i * (anchoCaja + 4);

    doc.setDrawColor(...(destacado ? TINTA.verde : TINTA.linea));
    doc.setLineWidth(destacado ? 0.8 : 0.3);
    doc.setFillColor(...(destacado ? TINTA.verdeSuave : [255, 255, 255]));
    doc.roundedRect(x, y, anchoCaja, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TINTA.gris);
    doc.text(rotulo, x + anchoCaja / 2, y + 7, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(destacado ? 20 : 16);
    doc.setTextColor(...(destacado ? TINTA.verdeOsc : TINTA.oscuro));
    doc.text(`${valor} kg`, x + anchoCaja / 2, y + 18, { align: 'center' });
  });

  y += 32;

  bloque('Equipo de medición', [
    ['Báscula', registro.bascula],
    ['Modelo del indicador', modelo],
    ['Capacidad máxima', `${miles(capacidad)} kg`],
    ['División de escala', `${division} kg`]
  ]);

  /* ---------- Observaciones ---------- */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TINTA.pizarra);
  doc.text('OBSERVACIONES', 14, y);
  y += 2;
  doc.setDrawColor(...TINTA.pizarra);
  doc.line(14, y, ancho - 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TINTA.oscuro);
  doc.text(doc.splitTextToSize(registro.observaciones?.trim() || 'Sin observaciones.', ancho - 28), 14, y);

  /* ---------- Declaración y firmas, ancladas al pie ---------- */
  const yFirmas = alto - 62;

  doc.setDrawColor(...TINTA.linea);
  doc.setLineWidth(0.3);
  doc.setFillColor(...TINTA.nieve);
  doc.roundedRect(14, yFirmas - 16, ancho - 28, 13, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TINTA.gris);
  doc.text(
    'Los pesos consignados proceden de la lectura directa y certificada de la celda de carga del',
    ancho / 2, yFirmas - 10.5, { align: 'center' }
  );
  doc.text(
    'equipo indicado. Este documento no es válido con enmiendas ni tachaduras.',
    ancho / 2, yFirmas - 6, { align: 'center' }
  );

  const anchoFirma = (ancho - 28 - 16) / 2;
  ['Operario de báscula', 'Supervisor de planta'].forEach((rol, i) => {
    const x = 14 + i * (anchoFirma + 16);

    doc.setDrawColor(...TINTA.oscuro);
    doc.setLineWidth(0.4);
    doc.line(x, yFirmas + 16, x + anchoFirma, yFirmas + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...TINTA.oscuro);
    doc.text(rol, x + anchoFirma / 2, yFirmas + 21, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TINTA.gris);
    doc.text('Nombre y firma', x + anchoFirma / 2, yFirmas + 25.5, { align: 'center' });
  });

  // El nombre del operario ya lo sabemos: se imprime sobre su línea.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TINTA.gris);
  doc.text(registro.operario || '', 14 + anchoFirma / 2, yFirmas + 13, { align: 'center' });

  /* ---------- Pie ---------- */
  doc.setDrawColor(...TINTA.linea);
  doc.setLineWidth(0.3);
  doc.line(14, alto - 16, ancho - 14, alto - 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...TINTA.gris);
  doc.text('INCASA · Industria Centroamericana, S.A. · Sistema de Pesaje', 14, alto - 11);
  doc.text(`Emitido el ${fechaHora(new Date().toISOString())}`, ancho - 14, alto - 11, { align: 'right' });
  doc.text(`Certificado ${registro.folio || '—'}`, ancho - 14, alto - 7, { align: 'right' });

  return doc;
}

/* ============================================================================
 *  2 · TICKET DE 80 mm
 *  --------------------------------------------------------------------------
 *  El comprobante corto que sale por la impresora térmica de la terminal y
 *  viaja grapado al material.
 * ==========================================================================*/

/** @returns {Promise<jsPDF>} */
export async function construirTicket(registro) {
  const logo = await cargarLogo();

  const doc = new jsPDF({ unit: 'mm', format: [80, 165] });
  let y = 8;

  const centrado = (texto, tam, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.text(texto, 40, y, { align: 'center' });
    y += tam * 0.55;
  };

  const linea = () => {
    doc.setDrawColor(150, 150, 150);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(6, y, 74, y);
    doc.setLineDashPattern([], 0);
    y += 4.5;
  };

  const par = (rotulo, valor, negrita = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(rotulo, 6, y);
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.text(String(valor), 74, y, { align: 'right' });
    y += 5;
  };

  // Logotipo centrado en la cabecera del ticket.
  dibujarLogo(doc, logo, 32, y, 16);
  y += 20;

  centrado('INCASA', 13, true);
  centrado('Industria Centroamericana, S.A.', 7);
  y += 2;
  centrado('CERTIFICADO DE PESAJE', 8.5, true);
  y += 3;
  linea();

  par('Folio', registro.folio, true);
  par('Fecha', fechaHora(registro.capturadoEn));
  par('Báscula', registro.bascula);
  linea();

  par('Tipo de material', '');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(nombreMaterial(registro.tipoMaterial), 74, y - 5, { align: 'right' });

  par('Código de rollo', registro.codigoRollo, true);
  par('Orden de trabajo', registro.ordenTrabajo);
  par('Operario', registro.operario);
  linea();

  par('Peso bruto', `${kg(registro.pesoBruto)} kg`);
  par('Tara', `- ${kg(registro.tara)} kg`);
  y += 2;

  // El neto es EL dato del ticket: en grande y en negrita.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PESO NETO', 6, y);
  doc.setFontSize(15);
  doc.text(`${kg(registro.pesoNeto)} kg`, 74, y, { align: 'right' });
  y += 7;
  linea();

  if (registro.observaciones) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const lineas = doc.splitTextToSize(`Obs.: ${registro.observaciones}`, 68);
    doc.text(lineas, 6, y);
    y += lineas.length * 3.4 + 3;
  }

  y += 5;
  centrado('Lectura certificada de celda de carga', 6.5);
  centrado(`${registro.modeloBascula || 'Hiweight X10'} · máx. 4,600 kg`, 6.5);
  y += 6;
  centrado('_______________________', 8);
  y += 1;
  centrado('Firma del responsable', 6.5);

  return doc;
}

/* ============================================================================
 *  3 · REPORTE DE PRODUCCIÓN  (A4 apaisado)
 * ==========================================================================*/

/**
 * @param {object[]} registros
 * @param {object}   contexto  { filtros, resumen, usuario }
 * @returns {Promise<jsPDF>}
 */
export async function construirReporte(registros, { filtros = {}, resumen = {}, usuario = {} } = {}) {
  const logo = await cargarLogo();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();

  dibujarCabecera(doc, logo, ancho, 'Reporte de producción · Pesaje', 28);

  doc.setFontSize(8);
  doc.setTextColor(200, 208, 213);
  doc.text(`Emitido: ${fechaHora(new Date().toISOString())}`, ancho - 14, 20.5, { align: 'right' });

  /* ---------- Franja de filtros aplicados ---------- */
  const periodo = filtros.desde || filtros.hasta
    ? `${filtros.desde ? fecha(filtros.desde) : 'inicio'} - ${filtros.hasta ? fecha(filtros.hasta) : 'hoy'}`
    : 'Todo el histórico';

  doc.setTextColor(...TINTA.gris);
  doc.setFontSize(8.5);
  doc.text(
    `Periodo: ${periodo}` +
    `   |   Material: ${filtros.tipoMaterial ? nombreMaterial(filtros.tipoMaterial) : 'todos'}` +
    `   |   Báscula: ${filtros.bascula || 'todas'}` +
    `   |   Emitido por: ${usuario.nombre || '—'}` +
    (filtros.buscar ? `   |   Búsqueda: "${filtros.buscar}"` : ''),
    14, 36
  );

  /* ---------- Tarjetas de resumen ---------- */
  const tarjetas = [
    { rotulo: 'Pesajes',          valor: miles(resumen.total || 0) },
    { rotulo: 'Neto acumulado',   valor: `${miles(resumen.netoTotal || 0, 1)} kg` },
    { rotulo: 'Promedio / oper.', valor: `${kg(resumen.netoMedio || 0)} kg` },
    { rotulo: 'Bobinas alambrón', valor: miles(resumen.bobinas || 0) },
    { rotulo: 'Semielaborado',    valor: miles(resumen.semielaborado || 0) }
  ];

  const anchoTarjeta = (ancho - 28 - 4 * 4) / 5;
  tarjetas.forEach((t, i) => {
    const x = 14 + i * (anchoTarjeta + 4);

    doc.setDrawColor(...TINTA.linea);
    doc.setFillColor(...TINTA.nieve);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, 41, anchoTarjeta, 17, 1.5, 1.5, 'FD');

    doc.setFillColor(...(i === 1 ? TINTA.verde : TINTA.pizarra));
    doc.rect(x, 41, anchoTarjeta, 0.9, 'F');

    doc.setTextColor(...TINTA.gris);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(t.rotulo.toUpperCase(), x + 3, 47);

    doc.setTextColor(...TINTA.oscuro);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(String(t.valor), x + 3, 54);
  });

  /* ---------- Tabla de registros ---------- */
  autoTable(doc, {
    startY: 63,
    margin: { left: 12, right: 12, bottom: 16 },
    head: [COLUMNAS.map(c => c.titulo)],
    body: registros.map(r => COLUMNAS.map(c => String(c.valor(r)))),

    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.8,
      lineColor: TINTA.linea,
      lineWidth: 0.1,
      textColor: [45, 53, 57],
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: TINTA.pizarra,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'left'
    },
    alternateRowStyles: { fillColor: TINTA.nieve },
    columnStyles: Object.fromEntries(
      COLUMNAS.map((c, i) => [i, { cellWidth: c.ancho, halign: c.num ? 'right' : 'left' }])
    )
  });

  /* ---------- Pie numerado en todas las páginas ---------- */
  const paginas = doc.internal.getNumberOfPages();
  const alto = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...TINTA.linea);
    doc.setLineWidth(0.3);
    doc.line(12, alto - 11, ancho - 12, alto - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TINTA.gris);
    doc.text(
      'INCASA · Industria Centroamericana, S.A. — Los pesos provienen de la lectura ' +
      'certificada de la celda de carga.',
      12, alto - 6.5
    );
    doc.text(`Página ${p} de ${paginas}`, ancho - 12, alto - 6.5, { align: 'right' });
  }

  return doc;
}
