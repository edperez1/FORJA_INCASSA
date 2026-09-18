/* ============================================================================
 *  INCASA · js/pesajes-modales.js
 *  ---------------------------------------------------------------------------
 *  Los diálogos del historial: Ver detalle, Editar y Anular.
 *
 *  Ninguno habla con la red directamente: reciben del llamador las funciones
 *  `alGuardar` / `alCertificar`, que en app.js son las que invocan
 *  API.actualizarPesaje() y descargarCertificado(). Así los modales son puro
 *  interfaz y siguen valiendo cuando el backend sea Java.
 *
 *  Cada pesaje pertenece a una PRODUCCIÓN y es una ENTRADA (la bobina que
 *  entra al proceso, con código obligatorio) o una SALIDA (el producto que
 *  sale; su código hace de lote y es opcional).
 *  ==========================================================================*/

import { abrirModal, esc, kg, miles, fechaHora, relativo, marcarCampos } from './ui.js';
import { nombreTipo, iconoTipo } from './reportes-columnas.js';
import { icono } from './iconos.js';

/** Valores de fábrica de la báscula, por si un registro antiguo no los trae. */
const CAPACIDAD_POR_DEFECTO = 4600;

/** Cómo llegó el peso al sistema. */
const NOMBRE_ORIGEN = {
  conectada: 'Báscula conectada',
  manual: 'Ingreso manual (contingencia)',
  simulador: 'Simulación'
};

/** Estado de la producción → texto y color de su etiqueta. */
const ESTADO_PRODUCCION = {
  PROCESO:   { texto: 'En proceso', clase: 'etiqueta--ambar' },
  TERMINADO: { texto: 'Terminada',  clase: 'etiqueta--ok' },
  ANULADA:   { texto: 'Anulada',    clase: 'etiqueta--neutra' }
};

/** Píldora con el tipo de pesaje y su icono. */
function pildoraTipo(tipo) {
  const clase = tipo === 'ENTRADA' ? 'etiqueta--ambar' : tipo === 'SALIDA' ? 'etiqueta--ok' : 'etiqueta--neutra';
  return `<span class="etiqueta ${clase}">${icono(iconoTipo(tipo))}${esc(nombreTipo(tipo))}</span>`;
}

/** Píldora del estado de la producción, o nada si no viene. */
function pildoraEstado(estado) {
  if (!estado) return '';
  const e = ESTADO_PRODUCCION[estado] || { texto: estado, clase: 'etiqueta--neutra' };
  return `<span class="etiqueta ${e.clase}">${esc(e.texto)}</span>`;
}

/** Rótulo del código según el tipo: en la SALIDA hace de código de lote. */
const rotuloCodigo = (tipo) => tipo === 'SALIDA' ? 'Código de lote' : 'Código de bobina';

/** «40,000 und» · la cantidad de una salida en la unidad de su producción. */
const cantidadTexto = (r) => r.cantidad == null
  ? '—'
  : `${miles(r.cantidad, Number.isInteger(r.cantidad) ? 0 : 2)} ${esc(r.unidadProduccion || '')}`;

/** «Refinado → Clavos», o «—» si la producción no trae áreas. */
const recorrido = (r) =>
  r.areaProceso || r.areaDestino ? `${r.areaProceso || '—'} → ${r.areaDestino || '—'}` : '—';

/* ============================================================================
 *  1 · VER DETALLE
 * ==========================================================================*/

/**
 * @param {object}   registro
 * @param {object}   opciones
 * @param {Function} [opciones.alEditar]      abre el modal de edición
 * @param {Function} [opciones.alCertificar]  descarga el certificado en PDF
 */
export function verDetalle(registro, { alEditar, alCertificar } = {}) {
  const capacidad = registro.capacidadKg ?? CAPACIDAD_POR_DEFECTO;
  const porcentajeTara = registro.pesoBruto
    ? (registro.tara / registro.pesoBruto) * 100
    : 0;
  const usoCapacidad = capacidad
    ? (registro.pesoBruto / capacidad) * 100
    : 0;

  abrirModal({
    ancho: 'ancho',
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--info">
          <i data-icono="${iconoTipo(registro.tipo)}"></i>
        </span>
        <div>
          <h3>Pesaje ${esc(registro.folio)}</h3>
          <p>
            ${esc(fechaHora(registro.capturadoEn))} · ${esc(relativo(registro.capturadoEn))}
            ${registro.modificadoEn
              ? ` · <b>editado</b> ${esc(relativo(registro.modificadoEn))}`
              : ''}
          </p>
        </div>
        <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
          <i data-icono="x"></i>
        </button>
      </div>

      <div class="modal__cuerpo">

        <p class="rotulo" style="margin-bottom:10px">Pesos certificados</p>
        <dl class="datos-lista" style="margin-bottom:20px">
          <div>
            <dt>Peso bruto</dt>
            <dd class="destacado">${kg(registro.pesoBruto)} <span style="font-size:14px">kg</span></dd>
          </div>
          <div>
            <dt>Tara</dt>
            <dd class="destacado">${kg(registro.tara)} <span style="font-size:14px">kg</span></dd>
          </div>
          <div>
            <dt>Peso neto</dt>
            <dd class="destacado" style="color:var(--ok-texto)">
              ${kg(registro.pesoNeto)} <span style="font-size:14px">kg</span>
            </dd>
          </div>
          <div>
            <dt>Tara sobre bruto</dt>
            <dd>${miles(porcentajeTara, 1)} %</dd>
          </div>
          <div>
            <dt>Uso de la báscula</dt>
            <dd>${miles(usoCapacidad, 1)} % de ${miles(capacidad)} kg</dd>
          </div>
          <div>
            <dt>Lectura</dt>
            <dd>${registro.estable ? 'Estable' : 'En movimiento'}</dd>
          </div>
          <div class="ancho">
            <dt>Origen del peso</dt>
            <dd>${esc(NOMBRE_ORIGEN[registro.origenLectura] || registro.origenLectura || '—')}</dd>
          </div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Identificación</p>
        <dl class="datos-lista" style="margin-bottom:20px">
          <div>
            <dt>Tipo de pesaje</dt>
            <dd style="margin-top:6px">${pildoraTipo(registro.tipo)}</dd>
          </div>
          <div>
            <dt>${rotuloCodigo(registro.tipo)}</dt>
            <dd>${esc(registro.codigoBobina || '—')}</dd>
          </div>
          <div>
            <dt>Producción</dt>
            <dd>
              ${esc(registro.produccion || '—')}
              ${registro.produccionEstado
                ? `<span style="margin-left:6px">${pildoraEstado(registro.produccionEstado)}</span>`
                : ''}
            </dd>
          </div>
          <div><dt>Orden de trabajo</dt><dd>${esc(registro.ordenTrabajo || '—')}</dd></div>
          ${registro.tipo === 'SALIDA' ? `
          <div><dt>Cantidad producida</dt><dd>${cantidadTexto(registro)}</dd></div>` : ''}
          <div><dt>Producto</dt><dd>${esc(registro.producto || '—')}</dd></div>
          <div><dt>Materia</dt><dd>${esc(registro.materia || '—')}</dd></div>
          <div><dt>Proceso → Destino</dt><dd>${esc(recorrido(registro))}</dd></div>
          <div><dt>Operario</dt><dd>${esc(registro.operario || '—')}</dd></div>
          <div class="ancho">
            <dt>Observaciones</dt>
            <dd>${registro.observaciones ? esc(registro.observaciones) : '—'}</dd>
          </div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Equipo y trazabilidad</p>
        <dl class="datos-lista">
          <div><dt>Báscula</dt><dd>${esc(registro.bascula || '—')}</dd></div>
          <div><dt>Modelo</dt><dd>${esc(registro.modeloBascula || '—')}</dd></div>
          <div><dt>Identificador</dt><dd>${esc(registro.id)}</dd></div>
          <div>
            <dt>Última edición</dt>
            <dd>${registro.modificadoEn
                  ? `${esc(fechaHora(registro.modificadoEn))}<br>
                     <span style="font-size:13px; color:var(--texto-2)">
                       por ${esc(registro.modificadoPor || '—')}
                     </span>`
                  : 'Sin ediciones'}</dd>
          </div>
        </dl>
      </div>

      <div class="modal__pie">
        <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
        ${alCertificar ? `
          <button type="button" class="btn btn--linea" data-certificado>
            <i data-icono="file-check"></i> Descargar certificado
          </button>` : ''}
        ${alEditar ? `
          <button type="button" class="btn btn--primario" data-editar>
            <i data-icono="pencil"></i> Editar
          </button>` : ''}
      </div>`,

    alMontar(caja, cerrar) {
      caja.querySelector('[data-editar]')?.addEventListener('click', () => {
        cerrar();
        alEditar(registro);
      });
      caja.querySelector('[data-certificado]')?.addEventListener('click', async ev => {
        const boton = ev.currentTarget;
        boton.dataset.cargando = 'si';
        boton.disabled = true;
        try { await alCertificar(registro); }
        finally { delete boton.dataset.cargando; boton.disabled = false; }
      });
    }
  });
}

/* ============================================================================
 *  2 · EDITAR
 *  --------------------------------------------------------------------------
 *  Sólo se corrigen el código de bobina/lote y las observaciones. El tipo y
 *  la producción definen a qué totales suma el peso, y los pesos son la
 *  lectura certificada de la celda de carga: nada de eso se toca aquí.
 * ==========================================================================*/

/**
 * @param {object}   registro
 * @param {object}   opciones
 * @param {Function} opciones.alGuardar   async (id, { codigoBobina, cantidad?, observaciones }) => registroActualizado
 */
export function editarPesaje(registro, { alGuardar }) {
  const esEntrada = registro.tipo === 'ENTRADA';

  abrirModal({
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--ambar"><i data-icono="pencil"></i></span>
        <div>
          <h3>Editar ${esc(registro.folio)}</h3>
          <p>
            ${esc(nombreTipo(registro.tipo))} · ${esc(registro.produccion || '—')}
            · ${esc(registro.operario || '—')}
          </p>
        </div>
        <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
          <i data-icono="x"></i>
        </button>
      </div>

      <form id="forma-editar" novalidate>
        <div class="modal__cuerpo">

          <!-- Pesos: sólo lectura, para dar contexto de lo que se está editando -->
          <dl class="datos-lista" style="margin-bottom:20px">
            <div><dt>Bruto</dt><dd>${kg(registro.pesoBruto)} kg</dd></div>
            <div><dt>Tara</dt><dd>${kg(registro.tara)} kg</dd></div>
            <div><dt>Neto</dt><dd class="destacado">${kg(registro.pesoNeto)} kg</dd></div>
          </dl>

          <p class="nota" style="margin-bottom:22px">
            <i data-icono="shield-check"></i>
            <span>
              Los pesos no son editables: provienen de la lectura certificada de la
              celda de carga y ya figuran en el certificado emitido. Si un peso es
              incorrecto, anula el pesaje y vuelve a pesar el material.
            </span>
          </p>

          <div class="rejilla rejilla--2">
            <div class="campo campo--ancho">
              <label for="e-bobina">${esEntrada ? 'Código de bobina' : 'Código de lote (opcional)'}</label>
              <input id="e-bobina" type="text" autocomplete="off"
                     value="${esc(registro.codigoBobina || '')}" ${esEntrada ? 'required' : ''}>
            </div>

            ${esEntrada ? '' : `
            <div class="campo campo--ancho">
              <label for="e-cantidad">Cantidad producida (${esc(registro.unidadProduccion || '')})</label>
              <input id="e-cantidad" type="number" min="0.01" step="0.01" inputmode="decimal"
                     value="${registro.cantidad ?? ''}">
              <small>Si se contó mal, corrígela aquí: no es un peso certificado.</small>
            </div>`}

            <div class="campo campo--ancho">
              <label for="e-observaciones">Observaciones (opcional)</label>
              <textarea id="e-observaciones"
                        placeholder="Motivo del cambio, incidencias del lote…">${esc(registro.observaciones || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="modal__pie">
          <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn--primario">
            <i data-icono="save"></i> Guardar cambios
          </button>
        </div>
      </form>`,

    alMontar(caja, cerrar) {
      const campoBobina = caja.querySelector('#e-bobina');
      const mapa = { codigoBobina: 'e-bobina', cantidad: 'e-cantidad', observaciones: 'e-observaciones' };

      caja.querySelector('#forma-editar').addEventListener('submit', async ev => {
        ev.preventDefault();

        const codigoBobina = campoBobina.value.trim();
        const observaciones = caja.querySelector('#e-observaciones').value.trim();

        // Misma regla que el servidor: la ENTRADA necesita su código de bobina.
        if (esEntrada && !codigoBobina) {
          marcarCampos({ campos: { codigoBobina: 'El código de bobina es obligatorio en una entrada.' } }, mapa, caja);
          campoBobina.focus();
          return;
        }
        marcarCampos(null, mapa, caja);

        const boton = caja.querySelector('button[type="submit"]');
        boton.dataset.cargando = 'si';
        boton.disabled = true;

        try {
          const cambios = { codigoBobina, observaciones };
          const campoCantidad = caja.querySelector('#e-cantidad');
          if (campoCantidad && campoCantidad.value !== '') cambios.cantidad = Number(campoCantidad.value);
          await alGuardar(registro.id, cambios);
          cerrar();
        } catch (error) {
          // El aviso de error lo emite el llamador; aquí pintamos los campos
          // que rechazó el servidor (422) y devolvemos el botón para reintentar.
          marcarCampos(error, mapa, caja);
          delete boton.dataset.cargando;
          boton.disabled = false;
        }
      });
    }
  });
}

/* ============================================================================
 *  3 · ANULAR
 *  --------------------------------------------------------------------------
 *  La anulación es una baja lógica: la fila se conserva para auditoría, pero
 *  sale del historial, de los reportes y de los totales de su producción.
 * ==========================================================================*/

/**
 * Confirmación de anulación con motivo. Muestra qué se va a retirar antes
 * de preguntar.
 *
 * @returns {Promise<string|null>}  el motivo escrito (recortado, puede ser '')
 *                                  si se confirma; `null` si se cancela
 */
export function confirmarAnulacion(registro) {
  return new Promise(resolver => {
    // Se resuelve una sola vez: `alCerrar` corre siempre, así que si el
    // operario confirmó ya está decidido y el cierre no lo contradice.
    let respuesta = null;
    let resuelto = false;
    const decidir = () => { if (!resuelto) { resuelto = true; resolver(respuesta); } };

    abrirModal({
      alCerrar: decidir,
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello"><i data-icono="ban"></i></span>
          <div>
            <h3>Anular pesaje</h3>
            <p>El pesaje ${esc(registro.folio)} dejará de contar en su producción.</p>
          </div>
          <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
            <i data-icono="x"></i>
          </button>
        </div>

        <form id="forma-anular">
          <div class="modal__cuerpo">
            <dl class="datos-lista" style="margin-bottom:16px">
              <div><dt>Folio</dt><dd>${esc(registro.folio)}</dd></div>
              <div><dt>Tipo</dt><dd style="margin-top:6px">${pildoraTipo(registro.tipo)}</dd></div>
              <div><dt>${rotuloCodigo(registro.tipo)}</dt><dd>${esc(registro.codigoBobina || '—')}</dd></div>
              <div><dt>Producción</dt><dd>${esc(registro.produccion || '—')}</dd></div>
              <div class="ancho"><dt>Neto</dt><dd class="destacado">${kg(registro.pesoNeto)} kg</dd></div>
            </dl>

            <p style="margin-bottom:18px; font-size:14px; color:var(--texto-2); line-height:1.5">
              El registro se conserva para <b>auditoría</b>, pero desaparece del
              historial y de los reportes, y deja de sumar a los totales de su
              producción (<b>kg de entrada / salida</b>). Si sólo hay que corregir
              el código o las observaciones, usa <b>Editar</b> en lugar de anular.
            </p>

            <div class="campo">
              <label for="a-motivo">Motivo de la anulación</label>
              <textarea id="a-motivo"
                        placeholder="Peso tomado con la bobina mal apoyada, pesaje duplicado…"></textarea>
            </div>
          </div>

          <div class="modal__pie">
            <button type="button" class="btn btn--linea" data-cerrar>Conservar</button>
            <button type="submit" class="btn btn--peligro">
              <i data-icono="ban"></i> Sí, anular
            </button>
          </div>
        </form>`,

      alMontar(caja, cerrarModal) {
        caja.querySelector('#forma-anular').addEventListener('submit', ev => {
          ev.preventDefault();
          respuesta = caja.querySelector('#a-motivo').value.trim();
          cerrarModal();
        });
        caja.querySelector('#a-motivo').focus();
      }
    });
  });
}
