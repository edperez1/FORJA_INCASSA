/* ============================================================================
 *  INCASA · js/vista-reportes.js
 *  ---------------------------------------------------------------------------
 *  Reportes gerenciales sobre los pesajes que deja el filtro del historial,
 *  más el rendimiento de las producciones TERMINADAS en ese periodo.
 *
 *  La merma y el rendimiento sólo se calculan con producciones terminadas:
 *  en una producción a medias falta pesar lo producido y la merma saldría
 *  inflada.
 *  ==========================================================================*/

import { API } from './api.js';
import { icono } from './iconos.js';
import { nombreTipo } from './reportes-columnas.js';
import { merma, producido } from './produccion-modales.js';
import { VistaHistorial } from './vista-historial.js';
import { $, aviso, kg, miles, fecha, fechaHora, iniciales, diaISO, esc, contarHasta } from './ui.js';

export const VistaReportes = {
  terminadas: [],
  visible: false,

  montar() {
    $('#btn-csv-rep').addEventListener('click', () => VistaHistorial.exportarCSV());
    $('#btn-pdf-rep').addEventListener('click', ev => VistaHistorial.exportarPDF(ev.currentTarget));
  },

  async alMostrar() {
    this.visible = true;
    await this.cargar();
  },

  alOcultar() {
    this.visible = false;
  },

  /** El historial cambió de filtro o de datos: si los reportes se ven, se repintan. */
  alCambiarHistorial() {
    if (this.visible) this.cargar();
  },

  async cargar() {
    const f = VistaHistorial.filtrosActuales();
    try {
      this.terminadas = await API.listarProducciones({
        estado: 'TERMINADO', desde: f.desde, hasta: f.hasta, productoId: f.productoId
      });
    } catch (error) {
      aviso('No se cargaron las producciones', error.message, 'error');
      this.terminadas = [];
    }
    this.pintar();
  },

  /* ======================================================================
   *  PINTADO
   * ====================================================================*/

  pintar() {
    const datos = VistaHistorial.filtrados;
    const r = VistaHistorial.resumir(datos);
    const salidas = datos.filter(x => x.tipo === 'SALIDA');

    /* --- Alcance --- */
    const f = VistaHistorial.filtrosLegibles();
    const periodo = f.desde || f.hasta
      ? `${f.desde ? fecha(f.desde + 'T12:00') : 'inicio'} — ${f.hasta ? fecha(f.hasta + 'T12:00') : 'hoy'}`
      : 'todo el histórico';
    $('#reportes-alcance').textContent =
      `${miles(r.total)} pesajes · ${periodo}` +
      (f.tipo ? ` · ${nombreTipo(f.tipo)}s` : '') +
      (f.producto ? ` · ${f.producto}` : '');

    /* --- Entrada y salida --- */
    contarHasta($('#rep-entrada'), r.kgEntrada, { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#rep-salida'), r.kgSalida, { decimales: 1, sufijo: ' <span>kg</span>' });
    this.pie('#rep-entrada-pie', 'disc-3',
      `${miles(r.entradas)} bobinas · ${miles(r.kgEntrada / 1000, 2)} t`);
    this.pie('#rep-salida-pie', 'package-check',
      `${miles(r.salidas)} pesajes · ${miles(r.kgSalida / 1000, 2)} t`);

    /* --- Merma y rendimiento de las terminadas --- */
    const t = this.terminadas;
    const kgE = t.reduce((s, p) => s + p.kgEntrada, 0);
    const kgS = t.reduce((s, p) => s + p.kgSalida, 0);
    contarHasta($('#rep-merma'), kgE - kgS, { decimales: 1, sufijo: ' <span>kg</span>' });
    this.pie('#rep-merma-pie', 'weight',
      kgE ? `${miles((kgE - kgS) / kgE * 100, 1)} % de ${miles(t.length)} producciones terminadas`
          : 'Sin producciones terminadas');
    if (kgE) contarHasta($('#rep-rendimiento'), kgS / kgE * 100, { decimales: 1, sufijo: ' <span>%</span>' });
    else $('#rep-rendimiento').innerHTML = '— <span>%</span>';
    this.pie('#rep-rendimiento-pie', 'percent',
      kgE ? `${miles(kgS, 1)} kg de producto por ${miles(kgE, 1)} kg de bobina` : 'Sin producciones terminadas');

    /* --- Producto líder por salida --- */
    const porProducto = this.agruparPor(salidas, x => x.producto);
    const lider = porProducto[0];
    $('#rep-lider').textContent = lider ? lider.clave : '—';
    this.pie('#rep-lider-pie', 'trending-up',
      lider ? `${miles(lider.neto / 1000, 2)} t · ${miles(lider.neto / r.kgSalida * 100, 1)} % de la salida`
            : 'Sin salidas en el filtro');

    /* --- Hora pico --- */
    const porHora = this.agruparPorHora(datos);
    const pico = porHora.reduce((mx, h) => (h.cuenta > (mx?.cuenta ?? 0) ? h : mx), null);
    const franja = pico
      ? `${String(pico.hora).padStart(2, '0')}:00 – ${String(pico.hora + 1).padStart(2, '0')}:00` : '—';
    $('#rep-pico-hora').textContent = franja;
    this.pie('#rep-pico-hora-pie', 'clock',
      pico ? `${miles(pico.cuenta)} pesajes · ${miles(pico.neto, 1)} kg` : 'Sin datos en el filtro');
    $('#hora-pico-valor').textContent = franja;
    $('#hora-pico-detalle').textContent = pico
      ? `Mayor flujo de báscula: ${miles(pico.cuenta)} ${pico.cuenta === 1 ? 'pesaje' : 'pesajes'} y ${miles(pico.neto, 1)} kg`
      : 'Sin datos en el periodo';

    /* --- Gráficos y tablas --- */
    this.pintarReparto('#reparto-producto', porProducto, r.kgSalida, 'verde');
    $('#tonelaje-rotulo').textContent = `${miles(r.kgSalida / 1000, 2)} t`;
    this.pintarReparto('#reparto-destino', this.agruparPor(salidas, x => x.areaDestino), r.kgSalida, 'ambar');
    this.pintarGraficoHoras(porHora, pico);
    this.pintarGraficoDias(this.agruparPorDia(salidas));
    this.pintarRendimiento();
    this.pintarOperarios(datos);
  },

  pie(selector, nombreIcono, texto) {
    const el = $(selector);
    el.innerHTML = `${icono(nombreIcono)}<span></span>`;
    el.querySelector('span').textContent = texto;
  },

  /* ======================================================================
   *  AGRUPACIONES
   * ====================================================================*/

  /** Agrupa por una clave y ordena por kg descendente. */
  agruparPor(datos, clave) {
    const mapa = new Map();
    datos.forEach(r => {
      const k = clave(r) || '—';
      const a = mapa.get(k) || { clave: k, neto: 0, cuenta: 0 };
      a.neto += r.pesoNeto;
      a.cuenta += 1;
      mapa.set(k, a);
    });
    return [...mapa.values()].sort((a, b) => b.neto - a.neto);
  },

  agruparPorDia(datos) {
    const mapa = new Map();
    datos.forEach(r => {
      const dia = diaISO(r.capturadoEn);
      const a = mapa.get(dia) || { dia, neto: 0, cuenta: 0 };
      a.neto += r.pesoNeto;
      a.cuenta += 1;
      mapa.set(dia, a);
    });
    return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  },

  /**
   * Distribución por hora del día. Se devuelven las 24 horas aunque estén
   * vacías: el gráfico necesita el eje completo para ver dónde empieza y
   * acaba la jornada.
   */
  agruparPorHora(datos) {
    const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, cuenta: 0, neto: 0 }));
    datos.forEach(r => {
      const h = new Date(r.capturadoEn).getHours();
      horas[h].cuenta += 1;
      horas[h].neto += r.pesoNeto;
    });
    return horas;
  },

  /* ======================================================================
   *  GRÁFICOS
   * ====================================================================*/

  /** Barras horizontales de reparto porcentual. */
  pintarReparto(selector, filas, total, color) {
    const caja = $(selector);

    if (!filas.length) {
      caja.innerHTML = `<div class="vacio">${icono('layers')}
        <b>Sin salidas</b><p>Ajusta los filtros del historial.</p></div>`;
      return;
    }

    caja.innerHTML = filas.map((f, i) => {
      const pct = total ? (f.neto / total) * 100 : 0;
      return `
        <div class="reparto__fila" style="--i:${i}">
          <div class="reparto__cabeza">
            <b>${esc(f.clave)}</b>
            <span>${miles(f.cuenta)} pesajes · ${miles(f.neto, 1)} kg · ${miles(pct, 1)} %</span>
          </div>
          <div class="reparto__pista">
            <div class="reparto__nivel reparto__nivel--${color}" style="width:${pct.toFixed(2)}%"></div>
          </div>
        </div>`;
    }).join('');
  },

  /** Histograma de pesajes por hora, con la franja pico resaltada. */
  pintarGraficoHoras(porHora, pico) {
    const svg = $('#grafico-horas');

    if (!porHora.some(h => h.cuenta > 0)) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle"
        class="grafico__eje">Sin pesajes en el periodo filtrado</text>`;
      $('#grafico-horas-rotulo').textContent = 'sin datos';
      return;
    }

    // Sólo la franja con actividad, más un margen a cada lado.
    const activas = porHora.filter(h => h.cuenta > 0).map(h => h.hora);
    const desde = Math.max(0, Math.min(...activas) - 1);
    const hasta = Math.min(23, Math.max(...activas) + 1);
    const franja = porHora.slice(desde, hasta + 1);

    const ANCHO = 800, ALTO = 210;
    const MARGEN = { arriba: 14, abajo: 26, izq: 4, der: 4 };
    const alturaUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
    const anchoUtil = ANCHO - MARGEN.izq - MARGEN.der;

    const maximo = Math.max(...franja.map(h => h.cuenta));
    const paso = anchoUtil / franja.length;
    const anchoBarra = Math.max(6, Math.min(42, paso * 0.66));

    const guias = [0.5, 1].map(f => {
      const y = MARGEN.arriba + alturaUtil * (1 - f);
      return `<line class="grafico__guia" x1="${MARGEN.izq}" y1="${y}" x2="${ANCHO - MARGEN.der}" y2="${y}"/>`;
    }).join('');

    const barras = franja.map((h, i) => {
      const altura = h.cuenta ? Math.max(3, (h.cuenta / maximo) * alturaUtil) : 2;
      const x = MARGEN.izq + i * paso + (paso - anchoBarra) / 2;
      const y = MARGEN.arriba + alturaUtil - altura;
      const esPico = pico && h.hora === pico.hora && h.cuenta > 0;
      return `
        <g style="--i:${i}">
          <rect class="grafico__barra ${esPico ? 'grafico__barra--pico' : ''}"
                x="${x}" y="${y}" width="${anchoBarra}" height="${altura}" rx="3"
                ${h.cuenta ? '' : 'opacity=".35"'}>
            <title>${String(h.hora).padStart(2, '0')}:00 · ${h.cuenta} pesajes · ${miles(h.neto, 1)} kg</title>
          </rect>
          <text class="grafico__eje" x="${x + anchoBarra / 2}" y="${ALTO - 10}"
                text-anchor="middle">${String(h.hora).padStart(2, '0')}</text>
        </g>`;
    }).join('');

    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = guias + barras;
    $('#grafico-horas-rotulo').textContent =
      `${String(desde).padStart(2, '0')}:00 – ${String(hasta + 1).padStart(2, '0')}:00`;
  },

  pintarGraficoDias(porDia) {
    const svg = $('#grafico-dias');

    if (!porDia.length) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle"
        class="grafico__eje">Sin salidas en el periodo filtrado</text>`;
      $('#grafico-rotulo').textContent = 'sin datos';
      return;
    }

    const dias = porDia.slice(-21);
    const ANCHO = 800, ALTO = 210;
    const MARGEN = { arriba: 14, abajo: 26, izq: 4, der: 4 };
    const alturaUtil = ALTO - MARGEN.arriba - MARGEN.abajo;
    const anchoUtil = ANCHO - MARGEN.izq - MARGEN.der;

    const maximo = Math.max(...dias.map(d => d.neto));
    const paso = anchoUtil / dias.length;
    const anchoBarra = Math.max(6, Math.min(56, paso * 0.6));
    const salto = Math.ceil(dias.length / 10);

    const guias = [0.5, 1].map(f => {
      const y = MARGEN.arriba + alturaUtil * (1 - f);
      return `<line class="grafico__guia" x1="${MARGEN.izq}" y1="${y}" x2="${ANCHO - MARGEN.der}" y2="${y}"/>`;
    }).join('');

    const barras = dias.map((d, i) => {
      const altura = maximo ? Math.max(2, (d.neto / maximo) * alturaUtil) : 2;
      const x = MARGEN.izq + i * paso + (paso - anchoBarra) / 2;
      const y = MARGEN.arriba + alturaUtil - altura;
      // «T12:00» para que el día no se corra al convertirlo desde UTC.
      const etiqueta = i % salto === 0
        ? `<text class="grafico__eje" x="${x + anchoBarra / 2}" y="${ALTO - 10}"
                 text-anchor="middle">${fecha(d.dia + 'T12:00').slice(0, 5)}</text>` : '';
      return `
        <g style="--i:${i}">
          <rect class="grafico__barra ${d.neto === maximo ? 'grafico__barra--pico' : ''}"
                x="${x}" y="${y}" width="${anchoBarra}" height="${altura}" rx="3">
            <title>${fecha(d.dia + 'T12:00')} · ${miles(d.neto, 1)} kg · ${d.cuenta} pesajes</title>
          </rect>
          ${etiqueta}
        </g>`;
    }).join('');

    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = guias + barras;
    $('#grafico-rotulo').textContent = `máximo ${miles(maximo, 1)} kg · ${dias.length} jornadas`;
  },

  /* ======================================================================
   *  TABLAS
   * ====================================================================*/

  pintarRendimiento() {
    const cuerpo = $('#tabla-rendimiento');
    const t = this.terminadas;
    $('#rendimiento-rotulo').textContent = `${t.length} ${t.length === 1 ? 'producción' : 'producciones'}`;

    if (!t.length) {
      cuerpo.innerHTML = `<tr><td colspan="9"><div class="vacio">${icono('package-check')}
        <b>Sin producciones terminadas</b><p>En el periodo del filtro no se cerró ninguna.</p></div></td></tr>`;
      return;
    }

    // Primero las de peor rendimiento: son las que hay que revisar.
    const filas = [...t].sort((a, b) => (a.rendimiento ?? 100) - (b.rendimiento ?? 100));
    cuerpo.innerHTML = filas.map((p, i) => `
      <tr class="entra-fila" style="--i:${Math.min(i, 24)}">
        <td class="num"><b>${esc(p.codigo)}</b>
          ${p.ordenTrabajo ? `<span class="sub-dato">${esc(p.ordenTrabajo)}</span>` : ''}</td>
        <td>${esc(p.producto)}</td>
        <td class="num">${esc(p.bobinas.join(', ') || '—')}</td>
        <td class="num">${kg(p.kgEntrada)}</td>
        <td class="num">${kg(p.kgSalida)}</td>
        <td class="num">${producido(p)}</td>
        <td class="num">${merma(p)}</td>
        <td class="num"><b>${p.rendimiento == null ? '—' : miles(p.rendimiento, 1) + ' %'}</b></td>
        <td>${esc(fechaHora(p.finEn))}</td>
      </tr>`).join('');
  },

  pintarOperarios(datos) {
    const cuerpo = $('#tabla-operarios');

    if (!datos.length) {
      cuerpo.innerHTML = `<tr><td colspan="6"><div class="vacio">${icono('user')}
        <b>Sin datos</b><p>Ajusta los filtros del historial.</p></div></td></tr>`;
      $('#operarios-rotulo').textContent = '0 operarios';
      return;
    }

    const mapa = new Map();
    datos.forEach(r => {
      const o = mapa.get(r.operario) || { nombre: r.operario, cuenta: 0, entradas: 0, salidas: 0, kgE: 0, kgS: 0 };
      o.cuenta += 1;
      if (r.tipo === 'ENTRADA') { o.entradas += 1; o.kgE += r.pesoNeto; }
      else { o.salidas += 1; o.kgS += r.pesoNeto; }
      mapa.set(r.operario, o);
    });

    const filas = [...mapa.values()].sort((a, b) => b.cuenta - a.cuenta);
    $('#operarios-rotulo').textContent = `${filas.length} ${filas.length === 1 ? 'operario' : 'operarios'}`;

    cuerpo.innerHTML = filas.map((o, i) => `
      <tr class="entra-fila" style="--i:${i}">
        <td>
          <span style="display:inline-flex; align-items:center; gap:10px">
            <span class="ficha" style="width:32px; height:32px; font-size:13px">${esc(iniciales(o.nombre))}</span>
            ${esc(o.nombre)}
          </span>
        </td>
        <td class="num">${miles(o.cuenta)}</td>
        <td class="num">${miles(o.entradas)}</td>
        <td class="num">${miles(o.salidas)}</td>
        <td class="num">${miles(o.kgE, 1)}</td>
        <td class="num"><b>${miles(o.kgS, 1)}</b></td>
      </tr>`).join('');
  }
};
