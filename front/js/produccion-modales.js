/* ============================================================================
 *  INCASA · js/produccion-modales.js
 *  ---------------------------------------------------------------------------
 *  Los diálogos de una producción: abrir / corregir, ver detalle, terminar y
 *  anular. Los usan la vista de producciones y la de pesaje en vivo.
 *
 *  Cada uno llama a la API por sí mismo, muestra el aviso y, si todo salió
 *  bien, anuncia el cambio con `Estado.emitir('producciones')` y resuelve la
 *  promesa con el resultado. Si el usuario cancela, resuelve `null`.
 *  ==========================================================================*/

import { API } from './api.js';
import { Estado, ESTADO_PRODUCCION } from './estado.js';
import { icono } from './iconos.js';
import { nombreTipo, iconoTipo } from './reportes-columnas.js';
import { abrirModal, aviso, esc, kg, miles, fechaHora, relativo, marcarCampos, puede } from './ui.js';

/* ============================================================================
 *  PIEZAS COMPARTIDAS
 * ==========================================================================*/

/** Etiqueta de estado con su icono. */
export function etiquetaEstado(estado) {
  const e = ESTADO_PRODUCCION[estado] || { nombre: estado, clase: 'etiqueta--neutra', icono: 'info' };
  return `<span class="etiqueta ${e.clase}">${icono(e.icono)}${esc(e.nombre)}</span>`;
}

/** «Refinado → Clavos» */
export function ruta(p) {
  return `<span class="ruta">${esc(p.areaProceso)} ${icono('arrow-right')} ${esc(p.areaDestino)}</span>`;
}

/** «2,000 kg» con la unidad de la producción. */
export function cantidad(p) {
  const decimales = Number.isInteger(p.cantidad) ? 0 : 2;
  return `${miles(p.cantidad, decimales)} ${esc(p.unidad)}`;
}

/** «40,000 de 50,000 und» con el avance debajo. */
export function producido(p) {
  const dec = v => (Number.isInteger(v) ? 0 : 2);
  return `${miles(p.cantidadProducida, dec(p.cantidadProducida))} de ${miles(p.cantidad, dec(p.cantidad))} ${esc(p.unidad)}
          <span class="sub-dato">${miles(p.avance, 1)} %</span>
          ${p.exceso > 0 ? `<span class="etiqueta etiqueta--ambar" style="margin-top:4px">
            +${miles(p.exceso, dec(p.exceso))} ${esc(p.unidad)} de exceso</span>` : ''}`;
}

/** ¿La merma de la producción supera la tolerancia (2 % por defecto)? */
export const mermaFuera = (p) => p.mermaPct != null && p.mermaPct > (p.mermaMaximaPct ?? 2) + 0.005;

/** Merma en kg y su porcentaje; «—» si todavía no hay entrada. En rojo si supera la tolerancia. */
export function merma(p) {
  if (p.mermaKg == null) return '—';
  const pct = p.mermaPct ?? (p.kgEntrada ? (p.mermaKg / p.kgEntrada) * 100 : 0);
  const clase = mermaFuera(p) ? 'merma--alta' : 'merma--normal';
  return `<span class="${clase}">${kg(p.mermaKg)} kg</span>
          <span class="sub-dato">${miles(pct, 1)} %</span>`;
}

/** Opciones de un <select> desde un catálogo, con la actual aunque esté desactivada. */
function opciones(lista, actualId, actualNombre, texto = e => e.nombre) {
  const items = lista.map(e =>
    `<option value="${e.id}" ${e.id === actualId ? 'selected' : ''}>${esc(texto(e))}</option>`);
  if (actualId && !lista.some(e => e.id === actualId)) {
    items.unshift(`<option value="${actualId}" selected>${esc(actualNombre)} (desactivado)</option>`);
  }
  return `<option value="" ${actualId ? '' : 'selected'} disabled>Elige…</option>` + items.join('');
}

/* ============================================================================
 *  1 · ABRIR / CORREGIR
 * ==========================================================================*/

/**
 * Formulario de producción. Sin `produccion` abre una nueva; con ella la
 * corrige (sólo supervisores: el backend exige CORREGIR).
 * @returns {Promise<object|null>} la producción guardada, o null si se cancela
 */
export function formularioProduccion(produccion = null) {
  const c = Estado.catalogos;
  const p = produccion || {};
  const nueva = !produccion;

  return new Promise(resolver => {
    let resultado = null;

    abrirModal({
      alCerrar: () => resolver(resultado),
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello ${nueva ? 'modal__sello--ok' : 'modal__sello--ambar'}">
            <i data-icono="${nueva ? 'circle-play' : 'pencil'}"></i>
          </span>
          <div>
            <h3>${nueva ? 'Abrir producción' : 'Corregir ' + esc(p.codigo)}</h3>
            <p>${nueva
              ? 'La bobina entra a un área de proceso y el producto va a un área de destino.'
              : 'Los pesajes no cambian: sólo los datos de la producción.'}</p>
          </div>
          <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
            <i data-icono="x"></i>
          </button>
        </div>

        <form id="forma-produccion" novalidate>
          <div class="modal__cuerpo">
            <div class="rejilla rejilla--2">
              <div class="campo">
                <label for="pr-f-producto">Producto <span class="obligatorio">*</span></label>
                <select id="pr-f-producto" required>
                  ${opciones(c.productos, p.productoId, p.producto)}
                </select>
              </div>
              <div class="campo">
                <label for="pr-f-materia">Materia (tipo de bobina) <span class="obligatorio">*</span></label>
                <select id="pr-f-materia" required>
                  ${opciones(c.materias, p.materiaId ?? (c.materias.length === 1 ? c.materias[0].id : null), p.materia)}
                </select>
              </div>

              <div class="campo">
                <label for="pr-f-cantidad">Cantidad a producir <span class="obligatorio">*</span></label>
                <input id="pr-f-cantidad" type="number" min="0.01" step="0.01" inputmode="decimal"
                       value="${p.cantidad ?? ''}" required>
              </div>
              <div class="campo">
                <label for="pr-f-unidad">Unidad de medida <span class="obligatorio">*</span></label>
                <select id="pr-f-unidad" required>
                  ${opciones(c.unidades, p.unidadId, p.unidad, e => `${e.nombre} (${e.codigo})`)}
                </select>
              </div>

              <div class="campo">
                <label for="pr-f-proceso">Área de proceso <span class="obligatorio">*</span></label>
                <select id="pr-f-proceso" required>
                  ${opciones(c.areas, p.areaProcesoId, p.areaProceso)}
                </select>
                <small>Donde se trabaja la bobina.</small>
              </div>
              <div class="campo">
                <label for="pr-f-destino">Área de destino <span class="obligatorio">*</span></label>
                <select id="pr-f-destino" required>
                  ${opciones(c.areas, p.areaDestinoId, p.areaDestino)}
                </select>
                <small>Adonde va lo producido.</small>
              </div>

              <div class="campo campo--ancho">
                <label for="pr-f-orden">Orden de trabajo (opcional)</label>
                <input id="pr-f-orden" type="text" maxlength="40" placeholder="OT-2026-1248"
                       value="${esc(p.ordenTrabajo || '')}">
              </div>
              <div class="campo campo--ancho">
                <label for="pr-f-observaciones">Observaciones (opcional)</label>
                <textarea id="pr-f-observaciones" maxlength="500"
                          placeholder="Sólo si hay algo que anotar">${esc(p.observaciones || '')}</textarea>
              </div>
            </div>
          </div>

          <div class="modal__pie">
            <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btn--primario">
              <i data-icono="${nueva ? 'circle-play' : 'save'}"></i>
              ${nueva ? 'Abrir producción' : 'Guardar cambios'}
            </button>
          </div>
        </form>`,

      alMontar(caja, cerrar) {
        const forma = caja.querySelector('#forma-produccion');
        const valor = sel => caja.querySelector(sel).value;
        const numero = sel => (valor(sel) ? Number(valor(sel)) : null);

        forma.addEventListener('submit', async ev => {
          ev.preventDefault();

          const datos = {
            productoId: numero('#pr-f-producto'),
            materiaId: numero('#pr-f-materia'),
            cantidad: numero('#pr-f-cantidad'),
            unidadId: numero('#pr-f-unidad'),
            areaProcesoId: numero('#pr-f-proceso'),
            areaDestinoId: numero('#pr-f-destino'),
            ordenTrabajo: valor('#pr-f-orden').trim(),
            observaciones: valor('#pr-f-observaciones').trim()
          };

          if (!datos.productoId || !datos.materiaId || !datos.unidadId ||
              !datos.areaProcesoId || !datos.areaDestinoId) {
            return aviso('Faltan datos', 'Completa producto, materia, unidad y las dos áreas', 'error');
          }
          if (!(datos.cantidad > 0)) {
            return aviso('Cantidad inválida', 'La cantidad a producir debe ser mayor que cero', 'error');
          }

          const boton = forma.querySelector('button[type="submit"]');
          boton.dataset.cargando = 'si';
          boton.disabled = true;

          try {
            resultado = nueva
              ? await API.abrirProduccion(datos)
              : await API.corregirProduccion(p.id, datos);
            aviso(nueva ? 'Producción abierta' : 'Producción corregida',
              `${resultado.codigo} · ${resultado.producto}`, 'ok');
            Estado.emitir('producciones', resultado);
            cerrar();
          } catch (error) {
            aviso('No se guardó', error.message, 'error');
            marcarCampos(error, {
              productoId: 'pr-f-producto', materiaId: 'pr-f-materia', cantidad: 'pr-f-cantidad',
              unidadId: 'pr-f-unidad', areaProcesoId: 'pr-f-proceso', areaDestinoId: 'pr-f-destino',
              ordenTrabajo: 'pr-f-orden', observaciones: 'pr-f-observaciones'
            }, caja);
            delete boton.dataset.cargando;
            boton.disabled = false;
          }
        });
      }
    });
  });
}

/* ============================================================================
 *  2 · VER DETALLE
 * ==========================================================================*/

/**
 * @param {number}   id
 * @param {object}   acciones
 * @param {Function} [acciones.alVerPesaje]   (pesaje) => void
 * @param {Function} [acciones.alCertificar]  (pesaje) => void
 */
export async function verProduccion(id, { alVerPesaje, alCertificar } = {}) {
  let detalle;
  try {
    detalle = await API.obtenerProduccion(id);
  } catch (error) {
    aviso('No se pudo abrir', error.message, 'error');
    return;
  }
  const p = detalle.produccion;
  const pesajes = detalle.pesajes;

  const filas = pesajes.length
    ? pesajes.map(r => `
        <tr>
          <td class="num">${esc(r.folio)}</td>
          <td><span class="etiqueta ${r.tipo === 'ENTRADA' ? 'etiqueta--ambar' : 'etiqueta--ok'}">
                ${icono(iconoTipo(r.tipo))}${esc(nombreTipo(r.tipo))}</span></td>
          <td class="num">${esc(r.codigoBobina || '—')}</td>
          <td class="num"><b>${kg(r.pesoNeto)}</b></td>
          <td class="num">${r.cantidad != null ? miles(r.cantidad, Number.isInteger(r.cantidad) ? 0 : 2) + ' ' + esc(r.unidadProduccion) : '—'}</td>
          <td>${esc(fechaHora(r.capturadoEn))}</td>
          <td>${esc(r.operario)}</td>
          <td>
            <div class="acciones-fila">
              ${alVerPesaje ? `<button class="btn-icono" data-ver="${r.id}" title="Ver pesaje">${icono('search')}</button>` : ''}
              ${alCertificar ? `<button class="btn-icono" data-cert="${r.id}" title="Certificado">${icono('file-check')}</button>` : ''}
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="8"><div class="vacio">${icono('scale')}<b>Sin pesajes</b>
         <p>Pesa la bobina de entrada desde «Pesaje en vivo».</p></div></td></tr>`;

  abrirModal({
    ancho: 'ancho',
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--info"><i data-icono="factory"></i></span>
        <div>
          <h3>Producción ${esc(p.codigo)}</h3>
          <p>${esc(p.producto)} · abierta ${esc(relativo(p.inicioEn))} por ${esc(p.abiertaPor)}</p>
        </div>
        <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
          <i data-icono="x"></i>
        </button>
      </div>

      <div class="modal__cuerpo">
        <p class="rotulo" style="margin-bottom:10px">Balance de la báscula</p>
        <dl class="datos-lista" style="margin-bottom:20px">
          <div><dt>Entrada (bobinas)</dt><dd class="destacado">${kg(p.kgEntrada)} <span style="font-size:14px">kg</span></dd></div>
          <div><dt>Salida (producto)</dt><dd class="destacado" style="color:var(--ok-texto)">${kg(p.kgSalida)} <span style="font-size:14px">kg</span></dd></div>
          <div><dt>Merma</dt><dd>${merma(p)}</dd></div>
          <div><dt>Rendimiento</dt><dd>${p.rendimiento == null ? '—' : miles(p.rendimiento, 1) + ' %'}</dd></div>
          <div><dt>Producido</dt><dd>${producido(p)}</dd></div>
          <div><dt>Pesajes</dt><dd>${p.entradas} de entrada · ${p.salidas} de salida</dd></div>
          <div><dt>Estado</dt><dd>${etiquetaEstado(p.estado)}</dd></div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Datos de la producción</p>
        <dl class="datos-lista" style="margin-bottom:20px">
          <div><dt>Producto</dt><dd>${esc(p.producto)}</dd></div>
          <div><dt>Materia</dt><dd>${esc(p.materia)}</dd></div>
          <div><dt>Cantidad a producir</dt><dd>${cantidad(p)}</dd></div>
          <div><dt>Proceso → destino</dt><dd>${ruta(p)}</dd></div>
          <div><dt>Orden de trabajo</dt><dd>${esc(p.ordenTrabajo || '—')}</dd></div>
          <div><dt>Bobinas</dt><dd>${esc(p.bobinas.join(', ') || '—')}</dd></div>
          <div><dt>Inicio</dt><dd>${esc(fechaHora(p.inicioEn))}</dd></div>
          <div><dt>Fin</dt><dd>${p.finEn ? esc(fechaHora(p.finEn)) + '<br><span class="sub-dato">por ' + esc(p.terminadaPor || '—') + '</span>' : '—'}</dd></div>
          <div class="ancho"><dt>Observaciones</dt><dd>${esc(p.observaciones || '—')}</dd></div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Pesajes</p>
        <div class="tabla-scroll">
          <table>
            <thead><tr><th>Folio</th><th>Tipo</th><th>Bobina / lote</th><th class="num">Neto (kg)</th>
              <th class="num">Producido</th><th>Fecha</th><th>Operario</th><th></th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>

      <div class="modal__pie">
        <button type="button" class="btn btn--fantasma" data-cerrar>Cerrar</button>
      </div>`,

    alMontar(caja, cerrar) {
      caja.addEventListener('click', ev => {
        const ver = ev.target.closest('[data-ver]');
        const cert = ev.target.closest('[data-cert]');
        const r = pesajes.find(x => String(x.id) === (ver?.dataset.ver || cert?.dataset.cert));
        if (!r) return;
        cerrar();
        if (ver) alVerPesaje(r);
        else alCertificar(r);
      });
    }
  });
}

/* ============================================================================
 *  3 · TERMINAR
 * ==========================================================================*/

/**
 * Pide confirmación mostrando el balance y cierra la producción.
 * @returns {Promise<object|null>} la producción terminada, o null
 */
export async function terminarProduccion(p) {
  // El balance tiene que ser el de este momento, no el de la lista en pantalla.
  try {
    p = (await API.obtenerProduccion(p.id)).produccion;
  } catch (error) {
    aviso('No se pudo abrir', error.message, 'error');
    return null;
  }

  return new Promise(resolver => {
    let resultado = null;
    const falta = !p.entradas ? 'la bobina de entrada' : !p.salidas ? 'lo producido (salida)' : null;
    // Merma fuera de tolerancia: sólo quien puede corregir la cierra, y justificándolo.
    const fuera = !falta && mermaFuera(p);
    const forzable = fuera && puede('CORREGIR');
    const maxima = miles(p.mermaMaximaPct ?? 2, 1);

    abrirModal({
      alCerrar: () => resolver(resultado),
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello modal__sello--ok"><i data-icono="flag"></i></span>
          <div>
            <h3>Terminar ${esc(p.codigo)}</h3>
            <p>${esc(p.producto)} · ${ruta(p)}</p>
          </div>
          <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
            <i data-icono="x"></i>
          </button>
        </div>

        <div class="modal__cuerpo">
          <dl class="datos-lista" style="margin-bottom:18px">
            <div><dt>Entrada</dt><dd class="destacado">${kg(p.kgEntrada)} kg</dd></div>
            <div><dt>Salida</dt><dd class="destacado" style="color:var(--ok-texto)">${kg(p.kgSalida)} kg</dd></div>
            <div><dt>Merma</dt><dd>${merma(p)}</dd></div>
            <div><dt>Rendimiento</dt><dd>${p.rendimiento == null ? '—' : miles(p.rendimiento, 1) + ' %'}</dd></div>
            <div><dt>Producido</dt><dd>${producido(p)}</dd></div>
          </dl>

          ${falta ? `
            <p class="nota nota--ambar">
              <i data-icono="triangle-alert"></i>
              <span>Todavía falta pesar <b>${falta}</b>. Una producción sólo se termina
              con al menos una entrada y una salida.</span>
            </p>` : fuera && !forzable ? `
            <p class="nota nota--ambar">
              <i data-icono="triangle-alert"></i>
              <span>La merma es de <b>${miles(p.mermaPct, 1)} %</b> y la máxima admitida es
              <b>${maxima} %</b>. Revisa los pesajes o pide a un supervisor que cierre la
              producción justificándolo.</span>
            </p>` : fuera ? `
            <p class="nota nota--ambar" style="margin-bottom:18px">
              <i data-icono="triangle-alert"></i>
              <span>La merma es de <b>${miles(p.mermaPct, 1)} %</b>, por encima del
              <b>${maxima} %</b> admitido. Puedes cerrarla igual, pero queda registrado como
              <b>cierre fuera de tolerancia</b> con tu justificación.</span>
            </p>
            <div class="campo">
              <label for="t-nota">Justificación <span class="obligatorio">*</span></label>
              <textarea id="t-nota" maxlength="300" required
                        placeholder="Por qué se perdió más material del admitido"></textarea>
            </div>` : `
            <p class="nota" style="margin-bottom:18px">
              <i data-icono="info"></i>
              <span>Una producción terminada ya no admite pesajes. Los kg quedan cerrados
              tal como se ven aquí.</span>
            </p>
            <div class="campo">
              <label for="t-nota">Nota de cierre (opcional)</label>
              <textarea id="t-nota" maxlength="300" placeholder="Sin novedad"></textarea>
            </div>`}
        </div>

        <div class="modal__pie">
          <button type="button" class="btn btn--fantasma" data-cerrar>${falta || (fuera && !forzable) ? 'Entendido' : 'Cancelar'}</button>
          ${falta || (fuera && !forzable) ? '' : `<button type="button" class="btn ${fuera ? 'btn--peligro' : 'btn--primario'}" data-terminar>
            <i data-icono="flag"></i> ${fuera ? 'Terminar fuera de tolerancia' : 'Terminar producción'}</button>`}
        </div>`,

      alMontar(caja, cerrar) {
        caja.querySelector('[data-terminar]')?.addEventListener('click', async ev => {
          const boton = ev.currentTarget;
          const nota = caja.querySelector('#t-nota').value.trim();
          if (fuera && !nota) {
            caja.querySelector('#t-nota').focus();
            return aviso('Falta la justificación', 'Explica por qué se cierra con esa merma', 'error');
          }
          boton.dataset.cargando = 'si';
          boton.disabled = true;
          try {
            resultado = await API.terminarProduccion(p.id, nota, fuera);
            aviso('Producción terminada',
              `${resultado.codigo} · merma ${kg(resultado.mermaKg)} kg`, 'ok');
            Estado.emitir('producciones', resultado);
            cerrar();
          } catch (error) {
            aviso('No se pudo terminar', error.message, 'error');
            delete boton.dataset.cargando;
            boton.disabled = false;
          }
        });
      }
    });
  });
}

/* ============================================================================
 *  AVISO DE CIERRE AUTOMÁTICO
 *  --------------------------------------------------------------------------
 *  Una salida que alcanza la cantidad pedida cierra la producción sola. No
 *  basta un aviso que se desvanece: el operario tiene que ver que se cerró
 *  y, sobre todo, cuánto exceso se produjo. Resuelve al cerrar el diálogo.
 * ==========================================================================*/

/**
 * @param {object} cierre     `cierre` de la respuesta de POST /pesajes
 * @param {object} registro   el pesaje guardado
 * @returns {Promise<void>}
 */
export function avisoCierre(cierre, registro) {
  const dec = v => (Number.isInteger(v) ? 0 : 2);
  const tono = !cierre.terminada ? 'ambar' : cierre.exceso > 0 ? 'ambar' : 'ok';
  const titulo = !cierre.terminada
    ? 'Cantidad alcanzada · producción abierta'
    : cierre.exceso > 0 ? 'Producción terminada con exceso' : 'Producción terminada';

  return new Promise(resolver => {
    abrirModal({
      ancho: 'angosto',
      alCerrar: resolver,
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello modal__sello--${tono}">
            <i data-icono="${cierre.terminada ? 'package-check' : 'triangle-alert'}"></i>
          </span>
          <div>
            <h3>${esc(titulo)}</h3>
            <p>${esc(registro.produccion)} · ${esc(registro.producto || '')}</p>
          </div>
        </div>
        <div class="modal__cuerpo">
          <p style="font-size:15px; line-height:1.55; margin-bottom:16px">${esc(cierre.mensaje)}</p>
          <dl class="datos-lista">
            ${cierre.exceso > 0 ? `
            <div><dt>Exceso</dt>
              <dd class="destacado" style="color:var(--ambar-texto)">
                ${miles(cierre.exceso, dec(cierre.exceso))} ${esc(cierre.unidad)}</dd></div>` : ''}
            <div><dt>Merma</dt><dd>${miles(cierre.mermaPct, 1)} %</dd></div>
          </dl>
        </div>
        <div class="modal__pie">
          <button type="button" class="btn btn--primario" data-cerrar>
            <i data-icono="file-check"></i> Ver certificado
          </button>
        </div>`
    });
  });
}

/* ============================================================================
 *  4 · ANULAR
 * ==========================================================================*/

/** @returns {Promise<boolean>} true si se anuló */
export function anularProduccion(p) {
  return new Promise(resolver => {
    let anulada = false;

    abrirModal({
      ancho: 'angosto',
      alCerrar: () => resolver(anulada),
      html: `
        <div class="modal__cabeza">
          <span class="modal__sello"><i data-icono="ban"></i></span>
          <div>
            <h3>Anular ${esc(p.codigo)}</h3>
            <p>${esc(p.producto)} · abierta ${esc(relativo(p.inicioEn))}</p>
          </div>
        </div>
        <div class="modal__cuerpo">
          <p style="font-size:14px; color:var(--texto-2); line-height:1.5; margin-bottom:16px">
            La producción deja de aparecer en listados y reportes, pero se conserva
            con el motivo para la auditoría. Sólo se anula una producción sin pesajes
            vigentes.
          </p>
          <div class="campo">
            <label for="a-motivo">Motivo <span class="obligatorio">*</span></label>
            <textarea id="a-motivo" maxlength="300" required
                      placeholder="Abierta por error, producto equivocado…"></textarea>
          </div>
        </div>
        <div class="modal__pie">
          <button type="button" class="btn btn--linea" data-cerrar>Conservar</button>
          <button type="button" class="btn btn--peligro" data-anular>
            <i data-icono="ban"></i> Anular producción
          </button>
        </div>`,

      alMontar(caja, cerrar) {
        caja.querySelector('#a-motivo').focus();
        caja.querySelector('[data-anular]').addEventListener('click', async ev => {
          const motivo = caja.querySelector('#a-motivo').value.trim();
          if (!motivo) return aviso('Falta el motivo', 'Escribe por qué se anula', 'error');

          const boton = ev.currentTarget;
          boton.dataset.cargando = 'si';
          boton.disabled = true;
          try {
            await API.anularProduccion(p.id, motivo);
            anulada = true;
            aviso('Producción anulada', p.codigo, 'ok');
            Estado.emitir('producciones', p);
            cerrar();
          } catch (error) {
            aviso('No se pudo anular', error.message, 'error');
            delete boton.dataset.cargando;
            boton.disabled = false;
          }
        });
      }
    });
  });
}
