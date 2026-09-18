/* ============================================================================
 *  INCASA · js/vista-historial.js
 *  ---------------------------------------------------------------------------
 *  Historial de pesajes: filtros, tabla ordenable, indicadores, acciones por
 *  fila (ver, corregir, anular, certificado) y exportaciones.
 *
 *  Es también la fuente de datos de los reportes: «Reportes» analiza
 *  exactamente los pesajes que deja el filtro del historial.
 *  ==========================================================================*/

import { API } from './api.js';
import { Estado } from './estado.js';
import { icono } from './iconos.js';
import { nombreTipo, iconoTipo } from './reportes-columnas.js';
import { exportarCSV, exportarPDF } from './reportes.js';
import { verDetalle, editarPesaje, confirmarAnulacion } from './pesajes-modales.js';
import {
  $, $$, aviso, kg, miles, fechaHora, relativo, hoyISO, diaISO, esc, contarHasta, puede
} from './ui.js';

export const VistaHistorial = {
  /** Pesajes que cumplen el filtro, en el orden de la tabla. */
  filtrados: [],
  orden: { campo: 'capturadoEn', direccion: 'desc' },
  cargando: null,

  /** Lo pone app.js. */
  alCertificar: null,
  alCambiar: () => {},

  montar({ alCertificar, alCambiar }) {
    this.alCertificar = alCertificar;
    this.alCambiar = alCambiar || (() => {});

    const filtros = ['#f-busqueda', '#f-tipo', '#f-producto', '#f-desde', '#f-hasta'];
    filtros.forEach(sel => {
      $(sel).addEventListener('input', () => {
        if (sel === '#f-desde' || sel === '#f-hasta') this.marcarRango(null);
        this.cargar();
      });
    });

    $('#btn-limpiar-filtros').addEventListener('click', () => {
      ['#f-busqueda', '#f-tipo', '#f-producto'].forEach(s => { $(s).value = ''; });
      this.aplicarRango('30');
    });

    $$('#rangos button').forEach(b => b.addEventListener('click', () => this.aplicarRango(b.dataset.rango)));
    $$('#vista-historial thead th[data-orden]').forEach(th =>
      th.addEventListener('click', () => this.ordenarPor(th.dataset.orden)));

    $('#tabla-historial').addEventListener('click', ev => this.accion(ev));

    $('#btn-csv').addEventListener('click', () => this.exportarCSV());
    $('#btn-csv-pie').addEventListener('click', () => this.exportarCSV());
    $('#btn-pdf').addEventListener('click', ev => this.exportarPDF(ev.currentTarget));

    Estado.on('catalogos', () => this.llenarProductos());
    Estado.on('pesajes', () => this.cargar());
    Estado.on('producciones', () => this.cargar());

    this.llenarProductos();
    // 30 días por defecto: «Todo» puede ser años de planta.
    this.fijarRango('30');
  },

  alMostrar() {
    this.cargar();
  },

  llenarProductos() {
    const actual = $('#f-producto').value;
    $('#f-producto').innerHTML = '<option value="">Todos</option>' + Estado.catalogos.productos
      .map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('#f-producto').value = actual;
  },

  /* ======================================================================
   *  FILTROS
   * ====================================================================*/

  filtrosActuales() {
    return {
      buscar: $('#f-busqueda').value.trim(),
      tipo: $('#f-tipo').value,
      productoId: $('#f-producto').value,
      desde: $('#f-desde').value,
      hasta: $('#f-hasta').value
    };
  },

  /** Los filtros tal como los imprime el reporte (con el nombre del producto). */
  filtrosLegibles() {
    const f = this.filtrosActuales();
    const producto = Estado.catalogos.productos.find(p => String(p.id) === f.productoId);
    return { desde: f.desde, hasta: f.hasta, tipo: f.tipo, producto: producto?.nombre || '', buscar: f.buscar };
  },

  fijarRango(cual) {
    if (cual === 'todo') {
      $('#f-desde').value = '';
      $('#f-hasta').value = '';
    } else if (cual === 'hoy') {
      $('#f-desde').value = hoyISO();
      $('#f-hasta').value = hoyISO();
    } else {
      $('#f-desde').value = hoyISO(-Number(cual) + 1);
      $('#f-hasta').value = hoyISO();
    }
    this.marcarRango(cual);
  },

  aplicarRango(cual) {
    this.fijarRango(cual);
    this.cargar();
  },

  marcarRango(cual) {
    $$('#rangos button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rango === cual)));
  },

  async cargar() {
    const turno = this.cargando = Symbol();
    let respuesta;
    try {
      respuesta = await API.listarPesajes(this.filtrosActuales());
    } catch (error) {
      aviso('No se cargó el historial', error.message, 'error');
      return;
    }
    if (turno !== this.cargando) return;

    this.filtrados = respuesta.datos;
    this.aplicarOrden();
    this.pintarTabla();
    this.pintarIndicadores();
    this.alCambiar(this.filtrados);
  },

  /* ======================================================================
   *  ORDEN
   * ====================================================================*/

  ordenarPor(campo) {
    this.orden = {
      campo,
      direccion: this.orden.campo === campo && this.orden.direccion === 'desc' ? 'asc' : 'desc'
    };
    this.aplicarOrden();
    this.pintarTabla();
  },

  aplicarOrden() {
    const { campo, direccion } = this.orden;
    const signo = direccion === 'asc' ? 1 : -1;

    this.filtrados.sort((a, b) => {
      let x = a[campo] ?? '';
      let y = b[campo] ?? '';
      if (campo === 'capturadoEn') { x = new Date(x).getTime(); y = new Date(y).getTime(); }
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
      return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo;
    });

    $$('#vista-historial thead th[data-orden]').forEach(th => {
      if (th.dataset.orden === campo) th.setAttribute('aria-sort', direccion === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  },

  /* ======================================================================
   *  TABLA
   * ====================================================================*/

  filaHTML(r, i) {
    const corregir = puede('CORREGIR');
    return `
      <tr class="entra-fila" style="--i:${i}">
        <td class="num">${esc(r.folio)}</td>
        <td>
          ${esc(fechaHora(r.capturadoEn))}
          <span class="sub-dato">${esc(relativo(r.capturadoEn))}${r.modificadoEn ? ' · corregido' : ''}</span>
        </td>
        <td class="num">
          ${esc(r.produccion)}
          ${r.ordenTrabajo ? `<span class="sub-dato">${esc(r.ordenTrabajo)}</span>` : ''}
        </td>
        <td>
          <span class="etiqueta ${r.tipo === 'ENTRADA' ? 'etiqueta--ambar' : 'etiqueta--ok'}">
            ${icono(iconoTipo(r.tipo))}${esc(nombreTipo(r.tipo))}
          </span>
        </td>
        <td class="num">${esc(r.codigoBobina || '—')}</td>
        <td>${esc(r.producto)}</td>
        <td>${esc(r.operario)}${r.origenLectura === 'manual'
          ? '<span class="sub-dato">ingreso manual</span>' : ''}</td>
        <td class="num">${kg(r.pesoBruto)}</td>
        <td class="num">${kg(r.tara)}</td>
        <td class="num"><b>${kg(r.pesoNeto)}</b></td>
        <td class="num">${r.cantidad != null
          ? `${miles(r.cantidad, Number.isInteger(r.cantidad) ? 0 : 2)} ${esc(r.unidadProduccion)}` : '—'}</td>
        <td>
          <div class="acciones-fila">
            <button class="btn-icono" data-accion="ver" data-id="${r.id}"
                    title="Ver detalle" aria-label="Ver detalle de ${esc(r.folio)}">${icono('search')}</button>
            ${corregir ? `
            <button class="btn-icono" data-accion="editar" data-id="${r.id}"
                    title="Corregir" aria-label="Corregir ${esc(r.folio)}">${icono('pencil')}</button>
            <button class="btn-icono btn-icono--peligro" data-accion="anular" data-id="${r.id}"
                    title="Anular" aria-label="Anular ${esc(r.folio)}">${icono('ban')}</button>` : ''}
          </div>
        </td>
        <td class="col-fija">
          <button class="btn-certificado" data-accion="certificado" data-id="${r.id}"
                  title="Ver y descargar el certificado de ${esc(r.folio)}">
            ${icono('file-check')} Ver / Descargar
          </button>
        </td>
      </tr>`;
  },

  pintarTabla() {
    const cuerpo = $('#tabla-historial');
    const datos = this.filtrados;

    cuerpo.innerHTML = datos.length
      ? datos.map((r, i) => this.filaHTML(r, Math.min(i, 24))).join('')
      : `<tr><td colspan="13">
           <div class="vacio">${icono('inbox')}<b>Sin registros</b>
             <p>Ningún pesaje coincide con los filtros. Ajusta el rango de fechas
                o limpia la búsqueda.</p></div>
         </td></tr>`;

    $('#conteo-historial').textContent =
      `${miles(datos.length)} ${datos.length === 1 ? 'registro' : 'registros'}`;
  },

  resumir(datos = this.filtrados) {
    const entradas = datos.filter(r => r.tipo === 'ENTRADA');
    const salidas = datos.filter(r => r.tipo === 'SALIDA');
    const suma = arr => arr.reduce((s, r) => s + r.pesoNeto, 0);
    return {
      total: datos.length,
      entradas: entradas.length,
      salidas: salidas.length,
      kgEntrada: suma(entradas),
      kgSalida: suma(salidas),
      producciones: new Set(datos.map(r => r.produccionId)).size
    };
  },

  pintarIndicadores() {
    const r = this.resumir();

    contarHasta($('#kpi-registros'), r.total);
    contarHasta($('#kpi-entrada'), r.kgEntrada, { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#kpi-salida'), r.kgSalida, { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#kpi-producciones'), r.producciones);

    const hoy = this.filtrados.filter(x => diaISO(x.capturadoEn) === hoyISO()).length;
    this.pie('#kpi-registros-pie', 'clipboard-list', `${miles(hoy)} en la jornada de hoy`);
    this.pie('#kpi-entrada-pie', 'disc-3',
      `${miles(r.entradas)} ${r.entradas === 1 ? 'bobina pesada' : 'bobinas pesadas'}`);
    this.pie('#kpi-salida-pie', 'package-check',
      `${miles(r.salidas)} ${r.salidas === 1 ? 'pesaje de producto' : 'pesajes de producto'}`);
    this.pie('#kpi-producciones-pie', 'factory', r.total ? 'Con pesajes en el filtro' : 'Sin datos en el filtro');
  },

  pie(selector, nombreIcono, texto) {
    const el = $(selector);
    el.innerHTML = `${icono(nombreIcono)}<span></span>`;
    el.querySelector('span').textContent = texto;
  },

  /* ======================================================================
   *  ACCIONES POR FILA
   * ====================================================================*/

  accion(ev) {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const registro = this.filtrados.find(r => String(r.id) === boton.dataset.id);
    if (!registro) return;

    if (boton.dataset.accion === 'certificado') this.alCertificar(registro);
    if (boton.dataset.accion === 'ver')         this.verPesaje(registro);
    if (boton.dataset.accion === 'editar')      this.corregir(registro);
    if (boton.dataset.accion === 'anular')      this.anular(registro);
  },

  verPesaje(registro) {
    verDetalle(registro, {
      alEditar: puede('CORREGIR') ? r => this.corregir(r) : undefined,
      alCertificar: r => this.alCertificar(r)
    });
  },

  corregir(registro) {
    editarPesaje(registro, {
      alGuardar: async (id, cambios) => {
        try {
          const actualizado = await API.actualizarPesaje(id, cambios);
          aviso('Pesaje corregido', `Folio ${actualizado.folio}`, 'ok');
          Estado.emitir('pesajes', actualizado);
          return actualizado;
        } catch (error) {
          aviso('No se pudo corregir', error.message || 'Intenta de nuevo', 'error');
          throw error;
        }
      }
    });
  },

  async anular(registro) {
    const motivo = await confirmarAnulacion(registro);
    if (motivo === null) return;

    try {
      await API.eliminarPesaje(registro.id, motivo);
      aviso('Pesaje anulado', `Folio ${registro.folio} dado de baja`, 'ok');
      Estado.emitir('pesajes', registro);
    } catch (error) {
      aviso('No se pudo anular', error.message || 'Intenta de nuevo', 'error');
    }
  },

  /* ======================================================================
   *  EXPORTACIONES
   * ====================================================================*/

  exportarCSV() {
    if (!this.filtrados.length) return aviso('Nada que exportar', 'La tabla está vacía', 'error');
    exportarCSV(this.filtrados);
    aviso('CSV descargado', `${miles(this.filtrados.length)} registros exportados`, 'ok');
  },

  async exportarPDF(boton) {
    if (!this.filtrados.length) return aviso('Nada que exportar', 'La tabla está vacía', 'error');

    boton.dataset.cargando = 'si';
    boton.disabled = true;
    try {
      const { origen, filas } = await exportarPDF(this.filtrados, {
        filtros: this.filtrosLegibles(),
        resumen: this.resumir(),
        usuario: Estado.usuario
      });
      aviso('Reporte descargado', `${miles(filas)} registros · generado por el ${origen}`, 'ok');
    } catch (error) {
      aviso('No se pudo generar', error.message || 'Intenta de nuevo', 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  }
};
