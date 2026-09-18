/* ============================================================================
 *  INCASA · js/estado.js
 *  ---------------------------------------------------------------------------
 *  Estado compartido del panel y un aviso mínimo de cambios entre vistas.
 *
 *  Cada vista vive en su propio módulo (vista-*.js). Cuando una cambia algo
 *  que otra muestra —guardar un pesaje altera los kg de su producción y el
 *  historial— lo anuncia con `Estado.emitir('pesajes')`, y las demás se
 *  refrescan si les toca. Así ninguna vista importa a otra.
 *
 *  Eventos:
 *    'producciones'  se abrió, corrigió, terminó o anuló una producción
 *    'pesajes'       se guardó, corrigió o anuló un pesaje
 *    'catalogos'     se recargaron los catálogos
 *  ==========================================================================*/

export const Estado = {
  /** El usuario de la sesión (objeto `usuario` de js/api.js). */
  usuario: null,

  /** Catálogos activos: { areas, productos, materias, unidades, bascula }. */
  catalogos: { areas: [], productos: [], materias: [], unidades: [], bascula: null },

  /**
   * Ficha de la báscula activa. La lee de los catálogos al arrancar y la
   * confirma cada trama del indicador.
   */
  equipo: { codigo: '—', modelo: '—', capacidad: 0, division: 0.5 },

  _oyentes: {},

  on(evento, fn) {
    (this._oyentes[evento] ||= []).push(fn);
  },

  emitir(evento, dato) {
    (this._oyentes[evento] || []).forEach(fn => {
      try { fn(dato); } catch (e) { console.error(`[estado] oyente de «${evento}»`, e); }
    });
  },

  /** Aplica los catálogos recibidos del backend y la ficha de la báscula. */
  fijarCatalogos(c) {
    this.catalogos = c;
    const b = c.bascula;
    if (b) {
      this.equipo = {
        codigo: b.codigo,
        modelo: b.modeloCompleto,
        capacidad: b.capacidadKg,
        division: b.divisionKg
      };
    }
    this.emitir('catalogos', c);
  }
};

/** Estado de una producción → texto y clase de etiqueta. */
export const ESTADO_PRODUCCION = {
  PROCESO:   { nombre: 'En proceso', clase: 'etiqueta--ambar', icono: 'circle-play' },
  TERMINADO: { nombre: 'Terminada',  clase: 'etiqueta--ok',    icono: 'package-check' },
  ANULADA:   { nombre: 'Anulada',    clase: 'etiqueta--neutra', icono: 'ban' }
};
