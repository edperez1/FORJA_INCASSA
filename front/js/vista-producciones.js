/* ============================================================================
 *  INCASA · js/vista-producciones.js
 *  ---------------------------------------------------------------------------
 *  Listado de producciones con su balance de báscula (entrada, salida, merma)
 *  y las acciones que permite cada rol:
 *
 *    Ver        todos
 *    Pesar      PESAR                · lleva a «Pesaje en vivo» con la producción elegida
 *    Terminar   TERMINAR_PRODUCCION  · sólo en proceso
 *    Corregir   CORREGIR  · en proceso o terminada
 *    Anular     CORREGIR  · sólo en proceso y sin pesajes
 *  ==========================================================================*/

import { API } from './api.js';
import { Estado } from './estado.js';
import { icono } from './iconos.js';
import {
  formularioProduccion, verProduccion, terminarProduccion, anularProduccion,
  etiquetaEstado, ruta, producido, merma
} from './produccion-modales.js';
import { $, aviso, kg, miles, fechaHora, relativo, esc, contarHasta, puede } from './ui.js';

export const VistaProducciones = {
  datos: [],
  cargando: null,

  /** Lo pone app.js: cómo ir a otra vista y cómo abrir un pesaje. */
  ir: () => {},
  alVerPesaje: null,
  alCertificar: null,

  montar({ ir, alVerPesaje, alCertificar }) {
    this.ir = ir;
    this.alVerPesaje = alVerPesaje;
    this.alCertificar = alCertificar;

    $('#btn-abrir-produccion').addEventListener('click', () => formularioProduccion());

    ['#pr-buscar', '#pr-estado', '#pr-producto', '#pr-desde', '#pr-hasta'].forEach(sel =>
      $(sel).addEventListener('input', () => this.cargar()));
    $('#pr-limpiar').addEventListener('click', () => {
      ['#pr-buscar', '#pr-producto', '#pr-desde', '#pr-hasta'].forEach(s => { $(s).value = ''; });
      $('#pr-estado').value = '';
      this.cargar();
    });

    // Delegación: la tabla se repinta entera en cada carga.
    $('#tabla-producciones').addEventListener('click', ev => this.accion(ev));

    Estado.on('catalogos', () => this.llenarProductos());
    Estado.on('producciones', () => this.cargar());
    Estado.on('pesajes', () => this.cargar());

    this.llenarProductos();
  },

  alMostrar() {
    this.cargar();
  },

  llenarProductos() {
    const actual = $('#pr-producto').value;
    $('#pr-producto').innerHTML = '<option value="">Todos</option>' + Estado.catalogos.productos
      .map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
    $('#pr-producto').value = actual;
  },

  filtros() {
    return {
      buscar: $('#pr-buscar').value.trim(),
      estado: $('#pr-estado').value,
      productoId: $('#pr-producto').value,
      desde: $('#pr-desde').value,
      hasta: $('#pr-hasta').value
    };
  },

  async cargar() {
    // Si llegan varias recargas seguidas (teclear en el buscador), sólo pinta la última.
    const turno = this.cargando = Symbol();
    let datos;
    try {
      datos = await API.listarProducciones(this.filtros());
    } catch (error) {
      aviso('No se cargaron las producciones', error.message, 'error');
      return;
    }
    if (turno !== this.cargando) return;

    this.datos = datos;
    this.pintarTabla();
    this.pintarIndicadores();
    $('#contador-producciones').textContent = miles(datos.filter(p => p.estado === 'PROCESO').length);
  },

  /* ======================================================================
   *  TABLA
   * ====================================================================*/

  pintarTabla() {
    const cuerpo = $('#tabla-producciones');
    const datos = this.datos;

    if (!datos.length) {
      cuerpo.innerHTML = `
        <tr><td colspan="11">
          <div class="vacio">${icono('factory')}
            <b>Sin producciones</b>
            <p>${puede('ABRIR_PRODUCCION')
              ? 'Abre una producción para empezar a pesar.'
              : 'Ninguna producción coincide con los filtros.'}</p>
          </div>
        </td></tr>`;
    } else {
      cuerpo.innerHTML = datos.map((p, i) => this.filaHTML(p, Math.min(i, 24))).join('');
    }

    $('#conteo-producciones').textContent =
      `${miles(datos.length)} ${datos.length === 1 ? 'producción' : 'producciones'}`;
  },

  filaHTML(p, i) {
    const enProceso = p.estado === 'PROCESO';
    const boton = (accion, nombreIcono, titulo, clase = '') => `
      <button class="btn-icono ${clase}" data-accion="${accion}" data-id="${p.id}"
              title="${titulo}" aria-label="${titulo} ${esc(p.codigo)}">${icono(nombreIcono)}</button>`;

    const acciones = [
      boton('ver', 'search', 'Ver detalle'),
      enProceso && puede('PESAR') ? boton('pesar', 'scale', 'Pesar') : '',
      enProceso && puede('TERMINAR_PRODUCCION') ? boton('terminar', 'flag', 'Terminar') : '',
      p.estado !== 'ANULADA' && puede('CORREGIR') ? boton('editar', 'pencil', 'Corregir') : '',
      enProceso && puede('CORREGIR') && !p.entradas && !p.salidas
        ? boton('anular', 'ban', 'Anular', 'btn-icono--peligro') : ''
    ].join('');

    return `
      <tr class="entra-fila ${p.estado === 'ANULADA' ? 'fila--apagada' : ''}" style="--i:${i}">
        <td class="num">
          <b>${esc(p.codigo)}</b>
          ${p.ordenTrabajo ? `<span class="sub-dato">${esc(p.ordenTrabajo)}</span>` : ''}
        </td>
        <td>
          ${esc(fechaHora(p.inicioEn))}
          <span class="sub-dato">${esc(relativo(p.inicioEn))}</span>
        </td>
        <td>
          ${esc(p.producto)}
          <span class="sub-dato">${esc(p.materia)}</span>
        </td>
        <td>${ruta(p)}</td>
        <td class="num">${producido(p)}</td>
        <td class="num">${esc(p.bobinas.join(', ') || '—')}</td>
        <td class="num">${p.entradas ? kg(p.kgEntrada) : '—'}</td>
        <td class="num">${p.salidas ? kg(p.kgSalida) : '—'}</td>
        <td class="num">${merma(p)}</td>
        <td>${etiquetaEstado(p.estado)}</td>
        <td><div class="acciones-fila">${acciones}</div></td>
      </tr>`;
  },

  async accion(ev) {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const p = this.datos.find(x => String(x.id) === boton.dataset.id);
    if (!p) return;

    switch (boton.dataset.accion) {
      case 'ver':
        verProduccion(p.id, { alVerPesaje: this.alVerPesaje, alCertificar: this.alCertificar });
        break;
      case 'pesar':
        this.ir('pesaje', { produccionId: p.id });
        break;
      case 'terminar':
        await terminarProduccion(p);
        break;
      case 'editar':
        await formularioProduccion(p);
        break;
      case 'anular':
        await anularProduccion(p);
        break;
    }
  },

  /* ======================================================================
   *  INDICADORES
   * ====================================================================*/

  pintarIndicadores() {
    const enProceso = this.datos.filter(p => p.estado === 'PROCESO');
    const terminadas = this.datos.filter(p => p.estado === 'TERMINADO');

    const kgEntrada = terminadas.reduce((s, p) => s + p.kgEntrada, 0);
    const kgSalida = terminadas.reduce((s, p) => s + p.kgSalida, 0);
    const mermaTotal = kgEntrada - kgSalida;
    const rendimiento = kgEntrada ? (kgSalida / kgEntrada) * 100 : null;

    contarHasta($('#pr-kpi-proceso'), enProceso.length);
    contarHasta($('#pr-kpi-terminadas'), terminadas.length);
    contarHasta($('#pr-kpi-merma'), mermaTotal, { decimales: 1, sufijo: ' <span>kg</span>' });
    if (rendimiento == null) $('#pr-kpi-rendimiento').innerHTML = '— <span>%</span>';
    else contarHasta($('#pr-kpi-rendimiento'), rendimiento, { decimales: 1, sufijo: ' <span>%</span>' });

    const kgEnCurso = enProceso.reduce((s, p) => s + p.kgEntrada, 0);
    this.pie('#pr-kpi-proceso-pie', 'scale',
      enProceso.length ? `${miles(kgEnCurso, 1)} kg de bobina en proceso` : 'Ninguna abierta');
    this.pie('#pr-kpi-terminadas-pie', 'package-check',
      terminadas.length ? `${miles(kgSalida, 1)} kg de producto` : 'Sin terminadas en el filtro');
    this.pie('#pr-kpi-merma-pie', 'weight',
      kgEntrada ? `${miles(mermaTotal / kgEntrada * 100, 1)} % de ${miles(kgEntrada, 1)} kg de entrada`
                : 'Sin terminadas en el filtro');

    const peor = terminadas.filter(p => p.rendimiento != null)
      .reduce((a, p) => (!a || p.rendimiento < a.rendimiento ? p : a), null);
    this.pie('#pr-kpi-rendimiento-pie', 'percent',
      peor ? `El más bajo: ${peor.codigo} (${miles(peor.rendimiento, 1)} %)` : 'Sin terminadas en el filtro');
  },

  pie(selector, nombreIcono, texto) {
    const el = $(selector);
    el.innerHTML = `${icono(nombreIcono)}<span></span>`;
    el.querySelector('span').textContent = texto;
  }
};
