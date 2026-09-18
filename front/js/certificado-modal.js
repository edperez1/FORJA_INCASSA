/* ============================================================================
 *  INCASA · js/certificado-modal.js
 *  ---------------------------------------------------------------------------
 *  Vista previa del «CERTIFICADO DE PESAJE - INCASA» antes de descargarlo.
 *
 *  La maqueta de este modal replica la del PDF (js/reportes-pdf.js): mismo
 *  orden de bloques, mismos rótulos y el mismo logotipo. El operario ve en
 *  pantalla exactamente lo que va a imprimir, así que si un dato está mal lo
 *  detecta ANTES de emitir el documento y no después de archivarlo.
 *
 *  No habla con la red: recibe del llamador `alDescargarPDF` y `alDescargarTicket`.
 *  ==========================================================================*/

import { abrirModal, esc, kg, miles, fechaHora } from './ui.js';

/** Ruta del logotipo oficial, la misma que usa el PDF. */
const RUTA_LOGO = '/logo-incasa.jpg';

/**
 * Los datos del equipo (modelo, capacidad, división) vienen en el propio
 * registro; los valores de fábrica sólo cubren un registro antiguo sin ellos.
 *
 * @param {object}   registro
 * @param {object}   opciones
 * @param {Function} opciones.alDescargarPDF        async (registro) => void
 * @param {Function} opciones.alDescargarTicket     async (registro) => void
 * @param {Function} [opciones.alImprimir]          async (registro) => void · certificado A4
 * @param {Function} [opciones.alImprimirTicket]    async (registro) => void · ticket 80 mm
 */
export function verCertificado(registro, { alDescargarPDF, alDescargarTicket, alImprimir, alImprimirTicket } = {}) {
  const modelo = registro.modeloBascula || 'Hiweight X10';
  const capacidad = registro.capacidadKg ?? 4600;
  const division = registro.divisionKg ?? 0.5;

  const esSalida = registro.tipo === 'SALIDA';
  const recorrido = registro.areaProceso || registro.areaDestino
    ? `${registro.areaProceso || '—'} → ${registro.areaDestino || '—'}`
    : '—';

  abrirModal({
    ancho: 'ancho',
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--ok"><i data-icono="file-check"></i></span>
        <div>
          <h3>Certificado de pesaje</h3>
          <p>Vista previa del documento oficial · Folio ${esc(registro.folio)}</p>
        </div>
        <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
          <i data-icono="x"></i>
        </button>
      </div>

      <div class="modal__cuerpo modal__cuerpo--liso">
        <article class="certificado">

          <header class="certificado__cabeza">
            <img src="${RUTA_LOGO}" alt="INCASA" width="56" height="56">
            <div>
              <b>INCASA</b>
              <small>Industria Centroamericana, S.A.</small>
            </div>
            <span class="certificado__sello">Documento<br>controlado</span>
          </header>

          <h2 class="certificado__titulo">Certificado de Pesaje</h2>
          <p class="certificado__sub">Sistema de Pesaje INCASA · Nicaragua</p>

          <dl class="certificado__folio">
            <div>
              <dt>Folio del certificado</dt>
              <dd>${esc(registro.folio)}</dd>
            </div>
            <div style="text-align:right">
              <dt>Fecha y hora de pesaje</dt>
              <dd>${esc(fechaHora(registro.capturadoEn))}</dd>
            </div>
          </dl>

          <section class="certificado__bloque">
            <h4>Identificación del pesaje</h4>
            <dl class="certificado__pares">
              <div>
                <dt>Tipo de pesaje</dt>
                <dd>${esSalida ? 'Salida · producto' : 'Entrada · bobina'}</dd>
              </div>
              <div>
                <dt>${esSalida ? 'Código de lote' : 'Código de bobina'}</dt>
                <dd>${esc(registro.codigoBobina || '—')}</dd>
              </div>
              <div>
                <dt>Producción</dt>
                <dd>${esc(registro.produccion || '—')}</dd>
              </div>
              <div>
                <dt>Orden de trabajo</dt>
                <dd>${esc(registro.ordenTrabajo || '—')}</dd>
              </div>
              <div>
                <dt>Producto</dt>
                <dd>${esc(registro.producto || '—')}</dd>
              </div>
              <div>
                <dt>Materia</dt>
                <dd>${esc(registro.materia || '—')}</dd>
              </div>
              <div>
                <dt>Proceso → Destino</dt>
                <dd>${esc(recorrido)}</dd>
              </div>
              <div>
                <dt>Operario responsable</dt>
                <dd>${esc(registro.operario || '—')}</dd>
              </div>
              ${registro.tipo === 'SALIDA' && registro.cantidad != null ? `
              <div>
                <dt>Cantidad producida</dt>
                <dd>${miles(registro.cantidad, Number.isInteger(registro.cantidad) ? 0 : 2)} ${esc(registro.unidadProduccion || '')}</dd>
              </div>` : ''}
            </dl>
          </section>

          <section class="certificado__bloque">
            <h4>Resultado de la pesada</h4>
            <div class="certificado__pesos">
              <div class="certificado__peso">
                <span>Peso bruto</span>
                <b>${kg(registro.pesoBruto)} kg</b>
              </div>
              <div class="certificado__peso">
                <span>Tara</span>
                <b>${kg(registro.tara)} kg</b>
              </div>
              <div class="certificado__peso certificado__peso--neto">
                <span>Peso neto</span>
                <b>${kg(registro.pesoNeto)} kg</b>
              </div>
            </div>
          </section>

          <section class="certificado__bloque">
            <h4>Equipo de medición</h4>
            <dl class="certificado__pares">
              <div><dt>Báscula</dt><dd>${esc(registro.bascula)}</dd></div>
              <div><dt>Modelo del indicador</dt><dd>${esc(modelo)}</dd></div>
              <div><dt>Capacidad máxima</dt><dd>${miles(capacidad)} kg</dd></div>
              <div><dt>División de escala</dt><dd>${division} kg</dd></div>
            </dl>
          </section>

          <section class="certificado__bloque">
            <h4>Observaciones</h4>
            <p style="font-size:14px; line-height:1.55">
              ${registro.observaciones ? esc(registro.observaciones) : 'Sin observaciones.'}
            </p>
          </section>

          <p class="certificado__declaracion">
            Los pesos consignados proceden de la lectura directa y certificada de la
            celda de carga del equipo indicado.<br>
            Este documento no es válido con enmiendas ni tachaduras.
          </p>

          <div class="certificado__firmas">
            <div class="certificado__firma">
              <i>${esc(registro.operario)}</i>
              <b>Operario de báscula</b>
              <small>Nombre y firma</small>
            </div>
            <div class="certificado__firma">
              <i></i>
              <b>Supervisor de planta</b>
              <small>Nombre y firma</small>
            </div>
          </div>
        </article>
      </div>

      <div class="modal__pie">
        <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
        ${alImprimirTicket ? `
        <button type="button" class="btn btn--linea" data-imprimir-ticket>
          <i data-icono="printer"></i> Imprimir ticket
        </button>` : ''}
        <button type="button" class="btn btn--linea" data-ticket>
          <i data-icono="file-down"></i> Ticket 80 mm
        </button>
        ${alImprimir ? `
        <button type="button" class="btn btn--linea" data-imprimir>
          <i data-icono="printer"></i> Imprimir
        </button>` : ''}
        <button type="button" class="btn btn--primario" data-pdf>
          <i data-icono="file-down"></i> Descargar PDF
        </button>
      </div>`,

    alMontar(caja) {
      /** Envuelve una descarga para mostrar el estado de carga en su botón. */
      const conCarga = (selector, accion) => {
        const boton = caja.querySelector(selector);
        if (!boton) return;

        boton.addEventListener('click', async () => {
          boton.dataset.cargando = 'si';
          boton.disabled = true;
          try { await accion(registro); }
          finally { delete boton.dataset.cargando; boton.disabled = false; }
        });
      };

      conCarga('[data-pdf]', alDescargarPDF);
      conCarga('[data-ticket]', alDescargarTicket);
      conCarga('[data-imprimir]', alImprimir);
      conCarga('[data-imprimir-ticket]', alImprimirTicket);
    }
  });
}
