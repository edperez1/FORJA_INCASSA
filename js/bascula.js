/* ============================================================================
 *  INCASA · js/bascula.js
 *  ---------------------------------------------------------------------------
 *  SIMULADOR DEL INDICADOR DE PESO · Hiweight X10.
 *  Imita el comportamiento de una celda de carga real: ruido de fondo, rampa
 *  al depositar la bobina, rebote elástico de la plataforma y estabilización.
 *
 *  ⚠️  TODO: ELIMINAR ESTE ARCHIVO al conectar el WebSocket real.
 *      Expone exactamente la misma interfaz que usará el socket:
 *
 *          const enlace = Bascula.iniciar(bascula, alRecibir, alCambiarEstado);
 *          enlace.enviar('TARA');
 *          enlace.cerrar();
 *
 *      y emite la misma trama JSON documentada en api.js → conectarBascula().
 *  ==========================================================================*/

export const Bascula = {

  /* --- Ficha técnica del equipo instalado --------------------------------
   *  Estos tres valores son los del modelo homologado en planta. La unidad
   *  es SIEMPRE kilogramos: el indicador no tiene conmutador de unidades y
   *  la interfaz tampoco debe ofrecerlo.
   * --------------------------------------------------------------------*/
  MODELO: 'Hiweight X10',
  CAPACIDAD: 4600.0,   // kg
  DIVISION: 0.5,       // kg (e = d) → 9.200 divisiones
  UNIDAD: 'kg',

  FRECUENCIA: 100,     // ms entre lecturas (10 Hz, como un indicador real)

  _t: null,
  _autoT: null,
  _s: null,

  iniciar(bascula, alRecibir, alCambiarEstado) {
    this.detener();   // por si se reconecta al cambiar de báscula

    const s = {
      bascula,
      real: 0,        // peso «físico» sobre la plataforma
      objetivo: 0,    // hacia dónde va
      cero: 0,        // corrección de la tecla CERO
      tara: 0,        // tara del indicador
      modoBruto: false,
      quieto: 0,      // ms que lleva sin cambios apreciables
      cargada: false
    };
    this._s = s;

    alCambiarEstado?.('conectando');
    setTimeout(() => alCambiarEstado?.('conectada'), 320);

    /* --- Bucle de lectura ------------------------------------------------ */
    this._t = setInterval(() => {
      const dif = s.objetivo - s.real;

      if (Math.abs(dif) > 1) {
        // Rampa con desaceleración + rebote elástico de la plataforma. Con
        // cargas de una tonelada la oscilación es mayor que con piezas pequeñas.
        s.real += dif * 0.24 + (Math.random() - 0.5) * Math.min(28, Math.abs(dif) * 0.14);
        s.quieto = 0;
      } else {
        // Ruido de fondo de la celda: mayor con carga encima.
        s.real = s.objetivo + (Math.random() - 0.5) * (s.cargada ? 0.8 : 0.3);
        s.quieto += this.FRECUENCIA;
      }

      const estable = s.quieto > 900;
      const bruto = Math.max(0, s.real - s.cero);
      const mostrado = s.modoBruto ? bruto : Math.max(0, bruto - s.tara);

      alRecibir({
        bascula: s.bascula,
        modelo: this.MODELO,
        peso: this._redondear(mostrado),
        bruto: this._redondear(bruto),
        tara: this._redondear(s.tara),
        unidad: this.UNIDAD,
        estable,
        modo: s.modoBruto ? 'BRUTO' : 'NETO',
        sobrecarga: bruto > this.CAPACIDAD,
        capacidad: this.CAPACIDAD,
        division: this.DIVISION,
        ts: new Date().toISOString()
      });
    }, this.FRECUENCIA);

    /* --- Ciclo automático de planta --------------------------------------
     *  Cada ~15 s entra una bobina nueva si la plataforma está vacía, para
     *  que el visor tenga vida sin que nadie toque nada.
     * -------------------------------------------------------------------*/
    this._autoT = setInterval(() => {
      if (!s.cargada) this.colocarCarga();
    }, 15000);

    setTimeout(() => { if (!s.cargada) this.colocarCarga(); }, 1400);

    return {
      /** Teclado del indicador: CERO | TARA | BRUTO | NETO */
      enviar: comando => this.comando(comando),
      cerrar: () => this.detener()
    };
  },

  /** Todo valor emitido cae en un múltiplo exacto de la división. */
  _redondear(v) {
    return Math.round(v / this.DIVISION) * this.DIVISION;
  },

  comando(cmd) {
    const s = this._s;
    if (!s) return;

    switch (cmd) {
      case 'CERO':  s.cero = s.real; s.tara = 0; s.modoBruto = false; break;
      case 'TARA':  s.tara = Math.max(0, s.real - s.cero); s.modoBruto = false; break;
      case 'BRUTO': s.modoBruto = true; break;
      case 'NETO':  s.modoBruto = false; break;
    }
    s.quieto = 0;   // cualquier comando reinicia la ventana de estabilidad
  },

  /**
   * Simula que la grúa deposita una bobina en la plataforma.
   * Rango realista: 1.100–2.400 kg de alambrón más el portabobinas.
   */
  colocarCarga(peso) {
    const s = this._s;
    if (!s) return;
    s.objetivo = peso != null ? peso : +(1100 + Math.random() * 1300).toFixed(1);
    s.cargada = true;
    s.quieto = 0;
  },

  /** Simula que la retiran. */
  retirarCarga() {
    const s = this._s;
    if (!s) return;
    s.objetivo = 0;
    s.cargada = false;
    s.quieto = 0;
  },

  detener() {
    clearInterval(this._t);
    clearInterval(this._autoT);
    this._t = this._autoT = null;
  }
};
