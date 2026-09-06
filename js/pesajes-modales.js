/* ============================================================================
 *  INCASA · js/pesajes-modales.js
 *  ---------------------------------------------------------------------------
 *  Los diálogos del historial: Ver detalle, Editar y Eliminar.
 *
 *  Ninguno habla con la red directamente: reciben del llamador las funciones
 *  `alGuardar` / `alCertificar`, que en app.js son las que invocan
 *  API.actualizarPesaje() y descargarCertificado(). Así los modales son puro
 *  interfaz y siguen valiendo cuando el backend sea Java.
 *  ==========================================================================*/

import { abrirModal, confirmar, esc, kg, miles, fechaHora, relativo } from './ui.js';
import { nombreMaterial } from './reportes-columnas.js';
import { icono } from './iconos.js';

/** Icono representativo de cada tipo de material. */
const ICONO_MATERIAL = {
  BOBINA_ALAMBRON: 'disc-3',
  PRODUCTO_SEMIELABORADO: 'package'
};

export const iconoMaterial = (codigo) => ICONO_MATERIAL[codigo] || 'boxes';

/** Píldora con el tipo de material y su icono. */
function pildoraMaterial(codigo) {
  return `<span class="etiqueta">${icono(iconoMaterial(codigo))}${esc(nombreMaterial(codigo))}</span>`;
}

/* ============================================================================
 *  1 · VER DETALLE
 * ==========================================================================*/

/**
 * @param {object}   registro
 * @param {object}   opciones
 * @param {object}   [opciones.equipo]        { modelo, capacidad, division }
 * @param {Function} [opciones.alEditar]      abre el modal de edición
 * @param {Function} [opciones.alCertificar]  descarga el certificado en PDF
 */
export function verDetalle(registro, { equipo = {}, alEditar, alCertificar } = {}) {
  const porcentajeTara = registro.pesoBruto
    ? (registro.tara / registro.pesoBruto) * 100
    : 0;
  const usoCapacidad = equipo.capacidad
    ? (registro.pesoBruto / equipo.capacidad) * 100
    : 0;

  abrirModal({
    ancho: 'ancho',
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--info">
          <i data-icono="${iconoMaterial(registro.tipoMaterial)}"></i>
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
            <dd>${miles(usoCapacidad, 1)} % de ${miles(equipo.capacidad || 0)} kg</dd>
          </div>
          <div>
            <dt>Lectura</dt>
            <dd>${registro.estable ? 'Estable' : 'En movimiento'}</dd>
          </div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Identificación del material</p>
        <dl class="datos-lista" style="margin-bottom:20px">
          <div class="ancho">
            <dt>Tipo de material</dt>
            <dd style="margin-top:6px">${pildoraMaterial(registro.tipoMaterial)}</dd>
          </div>
          <div><dt>Código de rollo / lote</dt><dd>${esc(registro.codigoRollo)}</dd></div>
          <div><dt>Orden de trabajo</dt><dd>${esc(registro.ordenTrabajo)}</dd></div>
          <div><dt>Operario</dt><dd>${esc(registro.operario)}</dd></div>
          <div class="ancho">
            <dt>Observaciones</dt>
            <dd>${registro.observaciones ? esc(registro.observaciones) : '—'}</dd>
          </div>
        </dl>

        <p class="rotulo" style="margin-bottom:10px">Equipo y trazabilidad</p>
        <dl class="datos-lista">
          <div><dt>Báscula</dt><dd>${esc(registro.bascula)}</dd></div>
          <div><dt>Modelo</dt><dd>${esc(registro.modeloBascula || equipo.modelo || '—')}</dd></div>
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
 *  Sólo se editan los datos de identificación del material. Los pesos se
 *  muestran pero NO se pueden tocar: son la lectura certificada de la celda de
 *  carga y cambiarlos invalidaría el certificado ya emitido.
 * ==========================================================================*/

/**
 * @param {object}   registro
 * @param {object}   opciones
 * @param {object[]} opciones.materiales  catálogo completo
 * @param {Function} opciones.alGuardar   async (id, cambios) => registroActualizado
 */
export function editarPesaje(registro, { materiales = [], alGuardar }) {

  const tarjetasMaterial = materiales.map(m => `
    <label class="opcion">
      <input type="radio" name="e-material" value="${esc(m.codigo)}"
             ${m.codigo === registro.tipoMaterial ? 'checked' : ''}>
      <i data-icono="${esc(m.icono || iconoMaterial(m.codigo))}"></i>
      <span>
        <b>${esc(m.nombre)}</b>
        <small>${esc(m.descripcion || '')}</small>
      </span>
    </label>`).join('');

  abrirModal({
    html: `
      <div class="modal__cabeza">
        <span class="modal__sello modal__sello--ambar"><i data-icono="pencil"></i></span>
        <div>
          <h3>Editar ${esc(registro.folio)}</h3>
          <p>Rollo ${esc(registro.codigoRollo)} · ${esc(registro.operario)}</p>
        </div>
        <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
          <i data-icono="x"></i>
        </button>
      </div>

      <form id="forma-editar">
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
              incorrecto, elimina el registro y vuelve a pesar el material.
            </span>
          </p>

          <div class="campo campo--ancho" style="margin-bottom:20px">
            <label>Tipo de material</label>
            <div class="opciones">${tarjetasMaterial}</div>
          </div>

          <div class="rejilla rejilla--2">
            <div class="campo">
              <label for="e-rollo">Código de rollo / lote</label>
              <input id="e-rollo" type="text" value="${esc(registro.codigoRollo)}" required>
            </div>

            <div class="campo">
              <label for="e-orden">Orden de trabajo</label>
              <input id="e-orden" type="text" value="${esc(registro.ordenTrabajo)}" required>
            </div>

            <div class="campo campo--ancho">
              <label for="e-observaciones">Observaciones</label>
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
      caja.querySelector('#forma-editar').addEventListener('submit', async ev => {
        ev.preventDefault();

        const rollo = caja.querySelector('#e-rollo').value.trim();
        const orden = caja.querySelector('#e-orden').value.trim();
        const material = caja.querySelector('input[name="e-material"]:checked')?.value;

        if (!rollo || !orden || !material) {
          caja.querySelector('#e-rollo').reportValidity();
          return;
        }

        const boton = caja.querySelector('button[type="submit"]');
        boton.dataset.cargando = 'si';
        boton.disabled = true;

        try {
          await alGuardar(registro.id, {
            tipoMaterial: material,
            codigoRollo: rollo,
            ordenTrabajo: orden,
            observaciones: caja.querySelector('#e-observaciones').value.trim()
          });
          cerrar();
        } catch {
          // El aviso de error lo emite el llamador; aquí sólo devolvemos el
          // botón a su estado para que se pueda reintentar.
          delete boton.dataset.cargando;
          boton.disabled = false;
        }
      });
    }
  });
}

/* ============================================================================
 *  3 · ELIMINAR
 * ==========================================================================*/

/**
 * Confirmación de baja. Muestra qué se va a perder antes de preguntar.
 * @returns {Promise<boolean>}
 */
export function confirmarEliminar(registro) {
  return confirmar({
    titulo: 'Eliminar pesaje',
    mensaje: 'Esta acción no se puede deshacer.',
    textoAceptar: 'Sí, eliminar',
    textoCancelar: 'Conservar',
    peligro: true,
    detalleHTML: `
      <dl class="datos-lista">
        <div><dt>Folio</dt><dd>${esc(registro.folio)}</dd></div>
        <div><dt>Código de rollo</dt><dd>${esc(registro.codigoRollo)}</dd></div>
        <div><dt>Orden de trabajo</dt><dd>${esc(registro.ordenTrabajo)}</dd></div>
        <div><dt>Neto</dt><dd class="destacado">${kg(registro.pesoNeto)} kg</dd></div>
      </dl>
      <p style="margin-top:16px; font-size:14px; color:var(--texto-2); line-height:1.5">
        El registro dejará de aparecer en el historial y en los reportes de
        producción, y su <b>certificado de pesaje</b> quedará sin respaldo en el
        sistema. Si sólo hay que corregir un dato de identificación, usa
        <b>Editar</b> en lugar de eliminar.
      </p>`
  });
}
