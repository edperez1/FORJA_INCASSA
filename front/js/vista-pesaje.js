/* ============================================================================
 *  INCASA · js/vista-pesaje.js
 *  ---------------------------------------------------------------------------
 *  Pesaje en vivo: la báscula (WebSocket, simulador o ingreso manual), la
 *  producción a la que pertenece la pesada y el formulario que la registra.
 *
 *  Flujo del operario:
 *    1. Elige la producción en proceso (o abre una nueva).
 *    2. Elige ENTRADA (la bobina) o SALIDA (lo producido).
 *    3. Captura el peso estable, escribe el código de bobina y guarda.
 *    4. Cuando ya pesó entrada y salida, termina la producción.
 *  ==========================================================================*/

import { API } from './api.js';
import { Bascula } from './bascula.js';
import { Estado } from './estado.js';
import { icono } from './iconos.js';
import { nombreTipo, iconoTipo } from './reportes-columnas.js';
import { descargarCertificado, descargarTicket, imprimirCertificado, imprimirTicket } from './reportes.js';
import { verCertificado } from './certificado-modal.js';
import { formularioProduccion, terminarProduccion, avisoCierre, ruta, cantidad, producido } from './produccion-modales.js';
import { $, $$, aviso, kg, miles, hora, hoyISO, esc, marcarCampos } from './ui.js';

const CLAVE_PRODUCCION = 'incasa_produccion_elegida';

export const VistaPesaje = {
  enlace: null,        // conexión con el indicador (WebSocket)
  enlaceSimulado: null,
  socketConectado: false,
  lectura: null,       // última trama recibida
  abiertas: [],        // producciones en PROCESO
  ultimoRegistro: null,

  /* --- Fuente de la lectura de peso -----------------------------------
   *  'esperando'  → modo real, sin señal todavía (ESTADO INICIAL)
   *  'conectada'  → WebSocket del indicador entregando tramas
   *  'simulador'  → simulación activada a mano por el operario
   *  'manual'     → contingencia: el peso lo teclea el operario
   * ------------------------------------------------------------------*/
  fuente: 'esperando',
  eraEstable: false,
  animandoVisor: false,

  /* ======================================================================
   *  ARRANQUE
   * ====================================================================*/

  async montar() {
    this.acciones();
    this.pintarEquipo();
    $('#operario').value = Estado.usuario.nombre;

    Estado.on('producciones', () => this.cargarProducciones());
    Estado.on('pesajes', () => { this.cargarProducciones(); this.pintarRecientes(); });

    this.conectarBascula();
    await Promise.all([this.cargarProducciones(), this.pintarRecientes()]);
    this.pintarResumen();
  },

  /** Al volver a la vista, los datos pueden haber cambiado en otra pantalla. */
  alMostrar() {
    this.cargarProducciones();
  },

  /** Elige una producción desde otra vista («Pesar» en Producciones). */
  elegirProduccion(id) {
    try { sessionStorage.setItem(CLAVE_PRODUCCION, String(id)); } catch { /* sin persistencia */ }
    if ($(`#produccion option[value="${id}"]`)) {
      $('#produccion').value = String(id);
      this.pintarFicha();
    } else {
      this.cargarProducciones();
    }
  },

  acciones() {
    /* --- Fuente de lectura --- */
    $('#btn-simular').addEventListener('click', () => this.alternarSimulador());
    $('#btn-manual').addEventListener('click', () => this.fijarFuente('manual'));
    $('#btn-salir-manual').addEventListener('click', () => this.fijarFuente(this.fuenteReal()));
    $('#btn-usar-manual').addEventListener('click', () => this.usarPesoManual());
    $('#peso-manual').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); this.usarPesoManual(); }
    });

    /* --- Teclas del cabezal --- */
    $('#tecla-cero').addEventListener('click', () => {
      this.teclado()?.enviar('CERO');
      aviso('Cero ajustado', 'La plataforma quedó en 0.0 kg');
    });
    $('#tecla-tara').addEventListener('click', () => {
      const bruto = this.lectura ? this.lectura.bruto : 0;
      this.teclado()?.enviar('TARA');
      $('#tara').value = kg(bruto);
      this.calcularNeto();
      aviso('Tara tomada', `${kg(bruto)} kg descontados`);
    });
    $('#tecla-bruto').addEventListener('click', () => {
      this.teclado()?.enviar('BRUTO');
      aviso('Modo bruto', 'El visor muestra el peso sin descontar tara');
    });
    $('#tecla-capturar').addEventListener('click', () => this.capturar());

    /* --- Formulario --- */
    $('#produccion').addEventListener('change', () => {
      try { sessionStorage.setItem(CLAVE_PRODUCCION, $('#produccion').value); } catch { /* */ }
      this.pintarFicha();
    });
    $$('input[name="tipo"]').forEach(r => r.addEventListener('change', () => this.pintarTipo()));
    $('#tara').addEventListener('input', () => this.calcularNeto());
    $('#forma-pesaje').addEventListener('submit', ev => this.guardar(ev));
    $('#btn-limpiar').addEventListener('click', () => this.limpiarFormulario());
    $('#btn-certificado').addEventListener('click', () => this.certificarUltimo());

    $('#btn-nueva-produccion').addEventListener('click', async () => {
      const nueva = await formularioProduccion();
      if (nueva) this.elegirProduccion(nueva.id);
    });
    $('#btn-terminar-actual').addEventListener('click', async () => {
      const p = this.produccionElegida();
      if (p && await terminarProduccion(p)) this.cargarProducciones();
    });

    this.pintarTipo();
  },

  /* ======================================================================
   *  PRODUCCIÓN ELEGIDA
   * ====================================================================*/

  async cargarProducciones() {
    try {
      this.abiertas = await API.listarProducciones({ estado: 'PROCESO' });
    } catch (error) {
      aviso('No se cargaron las producciones', error.message, 'error');
      return;
    }

    const select = $('#produccion');
    let elegida = select.value;
    try { elegida ||= sessionStorage.getItem(CLAVE_PRODUCCION) || ''; } catch { /* */ }

    select.innerHTML = this.abiertas.length
      ? '<option value="">Elige la producción…</option>' + this.abiertas.map(p => `
          <option value="${p.id}">${esc(p.codigo)} · ${esc(p.producto)}${p.ordenTrabajo ? ' · ' + esc(p.ordenTrabajo) : ''}</option>`).join('')
      : '<option value="">No hay producciones en proceso: abre una nueva</option>';

    // Si sólo hay una abierta, no hace falta que el operario la elija.
    if (this.abiertas.some(p => String(p.id) === elegida)) select.value = elegida;
    else if (this.abiertas.length === 1) select.value = String(this.abiertas[0].id);
    else select.value = '';

    this.pintarFicha();
  },

  produccionElegida() {
    return this.abiertas.find(p => String(p.id) === $('#produccion').value) || null;
  },

  pintarFicha() {
    const p = this.produccionElegida();
    const ficha = $('#ficha-produccion');
    $('#btn-terminar-actual').disabled = !p;
    this.pintarResumen();

    if (!p) { ficha.hidden = true; this.pintarTipo(); return; }

    ficha.hidden = false;
    ficha.innerHTML = `
      <div class="ficha-produccion__cabeza">
        <b>${esc(p.producto)} · ${esc(p.materia)}</b>
        ${ruta(p)}
      </div>
      <dl class="ficha-produccion__datos">
        <div><dt>A producir</dt><dd>${cantidad(p)}</dd></div>
        <div><dt>Orden de trabajo</dt><dd>${esc(p.ordenTrabajo || '—')}</dd></div>
        <div><dt>Entrada</dt><dd>${kg(p.kgEntrada)} kg · ${p.entradas} ${p.entradas === 1 ? 'bobina' : 'bobinas'}</dd></div>
        <div><dt>Salida</dt><dd>${kg(p.kgSalida)} kg · ${p.salidas} ${p.salidas === 1 ? 'pesaje' : 'pesajes'}</dd></div>
        <div><dt>Producido</dt><dd>${producido(p)}</dd></div>
        <div><dt>Disponible para salida</dt><dd>${p.entradas ? kg(Math.max(0, p.kgEntrada - p.kgSalida)) + ' kg' : 'Pesa la entrada'}</dd></div>
        <div><dt>Bobinas</dt><dd>${esc(p.bobinas.join(', ') || '—')}</dd></div>
      </dl>`;

    // Sugerencia: sin entrada todavía, lo normal es pesar la bobina; con ella, la salida.
    const tipo = p.entradas ? 'SALIDA' : 'ENTRADA';
    if (!$('#peso-bruto').value) {
      $(`input[name="tipo"][value="${tipo}"]`).checked = true;
    }
    this.pintarTipo();
  },

  tipoElegido() {
    return $('input[name="tipo"]:checked')?.value || 'ENTRADA';
  },

  /**
   * La bobina es obligatoria en la entrada; en la salida el código es de lote
   * y opcional, y aparece la cantidad producida en la unidad de la producción.
   * Si esa unidad es kg, la cantidad es el propio neto y no hace falta escribirla.
   */
  pintarTipo() {
    const entrada = this.tipoElegido() === 'ENTRADA';
    const p = this.produccionElegida();
    const enKg = !p || p.unidad === 'kg';
    $('#campo-cantidad').hidden = entrada;
    $('#etiqueta-cantidad').innerHTML = p
      ? `Cantidad producida (${esc(p.unidad)})${enKg ? '' : ' <span class="obligatorio" aria-hidden="true">*</span>'}`
      : 'Cantidad producida';
    $('#cantidad').required = !entrada && !enKg;
    $('#ayuda-cantidad').textContent = enKg
      ? 'Opcional: si la dejas vacía, vale el peso neto.'
      : `Producto que dejó esta salida, en ${p.unidadNombre.toLowerCase()} (${p.unidad}).`;
    $('#etiqueta-bobina').innerHTML = entrada
      ? 'Código de bobina <span class="obligatorio" aria-hidden="true">*</span>'
      : 'Código de lote (opcional)';
    $('#codigo-bobina').placeholder = entrada ? 'BOB-84532' : 'LOTE-001';
    $('#codigo-bobina').required = entrada;
  },

  /* ======================================================================
   *  FUENTE DE LECTURA
   *  --------------------------------------------------------------------
   *  El sistema arranca SIEMPRE en modo real esperando al indicador. La
   *  simulación y el ingreso manual son decisiones explícitas del operario:
   *  nunca se activan solas, para que nadie confunda un peso inventado con
   *  una lectura certificada.
   * ====================================================================*/

  /** A quién van las teclas del cabezal: al simulador mientras dure, si no al indicador. */
  teclado() {
    return this.fuente === 'simulador' ? this.enlaceSimulado : this.enlace;
  },

  conectarBascula() {
    this.enlace = API.conectarBascula(
      trama => this.recibirLectura(trama),
      estado => {
        this.socketConectado = estado === 'conectada';
        // Mientras el operario usa simulador o contingencia, el socket no manda.
        if (this.fuente === 'simulador' || this.fuente === 'manual') return;
        this.fijarFuente(this.fuenteReal());
      }
    );
  },

  /** A qué se vuelve al salir del simulador o de la contingencia. */
  fuenteReal() {
    return this.socketConectado ? 'conectada' : 'esperando';
  },

  fijarFuente(modo) {
    // Al salir del simulador se detiene de verdad y se vuelve al indicador real.
    if (this.fuente === 'simulador' && modo !== 'simulador') {
      Bascula.detener();
      this.lectura = null;
      this.eraEstable = false;
    }

    this.fuente = modo;
    this.pintarFuente();
    this.pintarEstadoEnlace();

    if (modo === 'esperando' || modo === 'manual') this.limpiarVisor();
    if (modo === 'manual') setTimeout(() => $('#peso-manual').focus(), 60);
  },

  pintarFuente() {
    const caja = $('#fuente');
    const btnSimular = $('#btn-simular');
    const e = Estado.equipo;

    caja.dataset.modo = this.fuente;
    $('#fuente-manual').hidden = this.fuente !== 'manual';
    $('#fuente-botones').hidden = this.fuente === 'manual';

    const textos = {
      esperando: `<span class="fuente__esperando" aria-hidden="true"></span>
                  Esperando conexión con el indicador <b>${esc(e.modelo)}</b> / <b>${esc(e.codigo)}</b>`,
      conectada: `Indicador <b>${esc(e.modelo)}</b> conectado en <b>${esc(e.codigo)}</b>.
                  Lectura en tiempo real.`,
      simulador: `<b>Simulación activa.</b> Los pesos son generados por el navegador,
                  no provienen del indicador. El sistema no los acepta como pesajes de planta.`,
      manual:    `<b>Modo contingencia.</b> Teclea el peso bruto que muestra el
                  indicador; quedará marcado como ingreso manual.`
    };
    $('#fuente-estado').innerHTML = textos[this.fuente];

    if (this.fuente === 'simulador') {
      btnSimular.innerHTML = `${icono('circle-stop')} Detener simulación`;
      btnSimular.className = 'btn btn--linea btn--sm';
    } else {
      btnSimular.innerHTML = `${icono('play')} Activar Simulación de Báscula`;
      btnSimular.className = 'btn btn--ambar btn--sm';
    }

    const enVivo = this.fuente === 'simulador' || this.fuente === 'conectada';
    ['#tecla-cero', '#tecla-tara', '#tecla-bruto'].forEach(s => { $(s).disabled = !enVivo; });
  },

  alternarSimulador() {
    if (this.fuente === 'simulador') {
      this.fijarFuente(this.fuenteReal());
      aviso('Simulación detenida', 'La báscula vuelve al indicador real');
      return;
    }

    this.fuente = 'simulador';
    // El simulador responde a las mismas teclas; el socket real sigue abierto
    // por debajo, pero sus tramas se ignoran mientras dure la simulación.
    const sim = Bascula.iniciar(Estado.equipo.codigo, t => this.recibirLectura(t, true), () => {});
    this.enlaceSimulado = sim;
    this.pintarFuente();
    this.pintarEstadoEnlace();
    aviso('Simulación activada', 'Los pesos son generados por el sistema', 'alerta');
  },

  usarPesoManual() {
    const valor = parseFloat($('#peso-manual').value);
    const capacidad = Estado.equipo.capacidad;

    if (!Number.isFinite(valor) || valor <= 0) {
      return aviso('Peso inválido', 'Escribe el peso bruto que marca el indicador', 'error');
    }
    if (capacidad && valor > capacidad) {
      return aviso('Fuera de capacidad', `La báscula admite hasta ${miles(capacidad)} kg`, 'error');
    }

    $('#peso-bruto').value = kg(valor);
    this.calcularNeto();
    $('#folio-previo').textContent = 'MANUAL ' + hora(new Date().toISOString());
    $('#peso-vivo').textContent = kg(valor);
    $('#visor').className = 'visor visor--listo';
    $('#estado-lectura').textContent = 'MANUAL';
    $('#estado-lectura').className = 'estado estado--estable';

    aviso('Peso manual registrado', `${kg(valor)} kg brutos · modo contingencia`, 'alerta');
    $('#codigo-bobina').focus();
  },

  limpiarVisor() {
    const capacidad = Estado.equipo.capacidad;
    $('#peso-vivo').textContent = '----.-';
    $('#visor').className = 'visor';
    $('#estado-lectura').textContent = this.fuente === 'manual' ? 'MANUAL' : 'SIN LECTURA';
    $('#estado-lectura').className = 'estado estado--espera';
    $('#capacidad-nivel').style.width = '0%';
    $('#capacidad-texto').textContent = capacidad ? `0 % de ${miles(capacidad)} kg` : '—';
    $('#capacidad').className = 'capacidad';
    $('#tecla-capturar').disabled = true;
  },

  pintarEstadoEnlace() {
    const textos = { esperando: 'esperando', conectada: 'conectada', simulador: 'simulación', manual: 'manual' };
    $('#enlace-bascula').dataset.estado = this.fuente;
    $('#enlace-texto').textContent = `${Estado.equipo.codigo} · ${textos[this.fuente]}`;
  },

  /** Datos del equipo en el cabezal: salen de la báscula activa del catálogo. */
  pintarEquipo() {
    const e = Estado.equipo;
    $('#bascula-activa').textContent = e.codigo;
    $('#cabezal-bascula').textContent = e.codigo;
    $('#cabezal-modelo').textContent = e.modelo;
    $('#visor-unidad').textContent = `kilogramos · división ${e.division} kg`;
    $('#peso-manual').max = String(e.capacidad || '');
    this.limpiarVisor();
    this.pintarFuente();
    this.pintarEstadoEnlace();
  },

  /* ======================================================================
   *  LECTURA EN VIVO
   * ====================================================================*/

  recibirLectura(t, simulada = false) {
    // Durante la simulación, las tramas reales se descartan (y al revés). En
    // contingencia manda lo que teclea el operario: ninguna trama pisa el visor.
    if (this.fuente === 'manual') return;
    if (simulada !== (this.fuente === 'simulador')) return;
    this.lectura = t;

    if (t.capacidad && !simulada) {
      Estado.equipo = { ...Estado.equipo, modelo: t.modelo || Estado.equipo.modelo,
        capacidad: t.capacidad, division: t.division ?? Estado.equipo.division };
    }

    const listo = t.estable && t.bruto > 5 && !t.sobrecarga;

    /* Al pasar de «en movimiento» a «estable» el número hace un conteo corto
       hasta el valor definitivo: es el instante en que el operario debe mirar
       la cifra, y el movimiento se la señala. */
    if (listo && !this.eraEstable) this.animarVisor(t.peso);
    else if (!this.animandoVisor) $('#peso-vivo').textContent = kg(t.peso);
    this.eraEstable = listo;

    const visor = $('#visor');
    visor.classList.toggle('visor--movimiento', !t.estable && !t.sobrecarga);
    visor.classList.toggle('visor--listo', listo);
    visor.classList.toggle('visor--sobrecarga', Boolean(t.sobrecarga));

    const bruto = t.modo === 'BRUTO';
    $('#led-neto').dataset.encendido = bruto ? 'no' : 'si';
    $('#led-bruto').dataset.encendido = bruto ? 'si' : 'no';
    $('#led-tara').dataset.encendido = t.tara > 0 ? 'si' : 'no';

    const estado = $('#estado-lectura');
    if (t.sobrecarga) {
      estado.textContent = 'SOBRECARGA';
      estado.className = 'estado estado--sobrecarga';
    } else {
      estado.textContent = t.estable ? 'ESTABLE' : 'EN MOVIMIENTO';
      estado.className = 'estado ' + (t.estable ? 'estado--estable' : 'estado--movimiento');
    }

    const pct = Math.min(100, (t.bruto / t.capacidad) * 100);
    $('#capacidad-nivel').style.width = pct + '%';
    $('#capacidad-texto').textContent = `${Math.round(pct)} % de ${miles(t.capacidad)} kg`;
    $('#capacidad').classList.toggle('capacidad--aviso', pct > 75 && pct <= 92);
    $('#capacidad').classList.toggle('capacidad--limite', pct > 92);

    $('#tecla-capturar').disabled = !listo;
  },

  animarVisor(destino) {
    const el = $('#peso-vivo');
    const desde = parseFloat(el.textContent) || 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = kg(destino);
      return;
    }

    this.animandoVisor = true;
    const inicio = performance.now();
    const MS = 460;

    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / MS);
      const e = 1 - Math.pow(1 - t, 3);   // easeOutCubic
      el.textContent = kg(desde + (destino - desde) * e);
      if (t < 1) requestAnimationFrame(paso);
      else { el.textContent = kg(destino); this.animandoVisor = false; }
    };
    requestAnimationFrame(paso);
  },

  capturar() {
    const t = this.lectura;
    if (!t) return;

    $('#peso-bruto').value = kg(t.bruto);
    if (!parseFloat($('#tara').value)) $('#tara').value = kg(t.tara);
    this.calcularNeto();

    $('#folio-previo').textContent = 'CAPTURADO ' + hora(t.ts);
    aviso('Peso capturado', `${kg(t.bruto)} kg brutos`, 'ok');
    $('#codigo-bobina').focus();
  },

  calcularNeto() {
    const bruto = parseFloat($('#peso-bruto').value) || 0;
    const tara = parseFloat($('#tara').value) || 0;
    $('#peso-neto').value = bruto ? kg(Math.max(0, bruto - tara)) : '';
    this.pintarResumen();
  },

  pintarResumen() {
    const bruto = parseFloat($('#peso-bruto').value) || 0;
    const neto = Math.max(0, bruto - (parseFloat($('#tara').value) || 0));
    const p = this.produccionElegida();

    $('#resumen-neto').textContent = `${kg(neto)} kg`;
    $('#resumen-produccion').textContent = p ? `${p.codigo} · ${nombreTipo(this.tipoElegido())}` : '—';

    const capacidad = Estado.equipo.capacidad;
    const pct = capacidad ? (bruto / capacidad) * 100 : 0;
    $('#resumen-capacidad').textContent = bruto ? `${miles(pct, 1)} %` : '—';
  },

  /* ======================================================================
   *  GUARDAR PESAJE
   * ====================================================================*/

  async guardar(ev) {
    ev.preventDefault();

    const produccion = this.produccionElegida();
    const tipo = this.tipoElegido();
    const bruto = parseFloat($('#peso-bruto').value) || 0;
    const tara = parseFloat($('#tara').value) || 0;
    const codigoBobina = $('#codigo-bobina').value.trim();

    if (!produccion)    return aviso('Falta la producción', 'Elige la producción en proceso o abre una nueva', 'error');
    if (!bruto)         return aviso('Falta el peso', 'Captura el peso o usa el ingreso manual', 'error');
    if (tara >= bruto)  return aviso('Tara inválida', 'La tara no puede igualar o superar el bruto', 'error');
    if (tipo === 'ENTRADA' && !codigoBobina) {
      $('#codigo-bobina').focus();
      return aviso('Falta el código de bobina', 'Escribe el código de la bobina que entra al proceso', 'error');
    }
    // La salida acumulada nunca pesa más que la bobina que entró (el servidor lo repite).
    if (tipo === 'SALIDA') {
      if (!produccion.entradas) {
        return aviso('Falta la entrada', `Pesa primero la bobina de entrada de ${produccion.codigo}`, 'error');
      }
      const disponible = produccion.kgEntrada - produccion.kgSalida;
      if (bruto - tara > disponible + 0.001) {
        return aviso('La salida supera la entrada',
          `Este pesaje deja ${kg(bruto - tara)} kg y sólo quedan ${kg(Math.max(0, disponible))} kg de la bobina`, 'error');
      }
    }
    const cantidad = tipo === 'SALIDA' && $('#cantidad').value !== '' ? Number($('#cantidad').value) : null;
    if (tipo === 'SALIDA' && produccion.unidad !== 'kg' && !(cantidad > 0)) {
      $('#cantidad').focus();
      return aviso('Falta la cantidad producida',
        `Indica cuánto producto dejó esta salida, en ${produccion.unidadNombre.toLowerCase()} (${produccion.unidad})`, 'error');
    }

    const pesaje = {
      produccionId: produccion.id,
      tipo,
      codigoBobina,
      cantidad,
      pesoBruto: +bruto.toFixed(1),
      tara: +tara.toFixed(1),
      unidad: 'kg',
      // Deja constancia de cómo se obtuvo el peso: una auditoría debe poder
      // distinguir una lectura certificada de una tecleada en contingencia.
      estable: this.fuente !== 'manual',
      origenLectura: this.fuente === 'esperando' ? 'manual' : this.fuente,
      observaciones: $('#observaciones').value.trim()
    };

    const boton = $('#forma-pesaje button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      const registro = await API.guardarPesaje(pesaje);
      this.ultimoRegistro = registro;

      aviso('Pesaje guardado',
        `Folio ${registro.folio} · ${nombreTipo(registro.tipo)} · ${kg(registro.pesoNeto)} kg netos`, 'ok');
      $('#folio-previo').textContent = registro.folio;

      this.limpiarFormulario(false);
      if (this.fuente === 'simulador') Bascula.retirarCarga();

      Estado.emitir('pesajes', registro);

      // Si la salida completó lo pedido, primero el aviso de cierre (con el
      // exceso, si lo hubo) y después el certificado.
      if (registro.cierre) {
        if (registro.cierre.terminada) Estado.emitir('producciones', registro);
        await avisoCierre(registro.cierre, registro);
      }
      this.abrirCertificado(registro);
    } catch (error) {
      aviso('No se guardó', error.message || 'Intenta de nuevo', 'error');
      marcarCampos(error, {
        codigoBobina: 'codigo-bobina', cantidad: 'cantidad', pesoBruto: 'peso-bruto', tara: 'tara',
        observaciones: 'observaciones', produccionId: 'produccion'
      }, $('#forma-pesaje'));
      // La producción pudo cerrarse en otra terminal mientras tanto.
      if (error.codigo === 'PRODUCCION_CERRADA') this.cargarProducciones();
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  },

  limpiarFormulario(avisar = true) {
    ['#peso-bruto', '#peso-neto', '#codigo-bobina', '#cantidad', '#observaciones'].forEach(s => { $(s).value = ''; });
    $('#tara').value = '0.0';
    $('#peso-manual').value = '';
    marcarCampos(null, {}, $('#forma-pesaje'));
    this.calcularNeto();
    if (avisar) aviso('Registro limpio', 'Listo para la siguiente pesada');
  },

  /* ======================================================================
   *  CERTIFICADO Y RECIENTES
   * ====================================================================*/

  abrirCertificado(registro) {
    abrirCertificado(registro);
  },

  certificarUltimo() {
    if (!this.ultimoRegistro) return aviso('Nada que certificar', 'Guarda primero un pesaje', 'error');
    this.abrirCertificado(this.ultimoRegistro);
  },

  async pintarRecientes() {
    const cuerpo = $('#tabla-recientes');
    let datos = [];
    try {
      ({ datos } = await API.listarPesajes({ desde: hoyISO(), hasta: hoyISO(), porPagina: 6 }));
    } catch { /* la tabla queda vacía; el aviso ya lo dio otra llamada */ }

    if (!this.ultimoRegistro && datos.length) this.ultimoRegistro = datos[0];

    if (!datos.length) {
      cuerpo.innerHTML = `
        <tr><td colspan="7">
          <div class="vacio">${icono('scale')}<b>Sin pesajes hoy</b>
            <p>El primer registro de la jornada aparecerá aquí.</p></div>
        </td></tr>`;
      return;
    }

    cuerpo.innerHTML = datos.map((r, i) => `
      <tr class="entra-fila" style="--i:${i}">
        <td class="num">${esc(r.folio)}</td>
        <td class="num">${esc(r.produccion)}</td>
        <td><span class="etiqueta ${r.tipo === 'ENTRADA' ? 'etiqueta--ambar' : 'etiqueta--ok'}">
              ${icono(iconoTipo(r.tipo))}${esc(nombreTipo(r.tipo))}</span></td>
        <td class="num">${esc(r.codigoBobina || '—')}</td>
        <td>${esc(r.producto)}</td>
        <td class="num"><b>${kg(r.pesoNeto)}</b></td>
        <td class="num">${hora(r.capturadoEn)}</td>
      </tr>`).join('');
  }
};

/** Vista previa del certificado con sus dos descargas. La comparten varias vistas. */
export function abrirCertificado(registro) {
  verCertificado(registro, {
    alDescargarPDF: async (r) => {
      try {
        const origen = await descargarCertificado(r);
        aviso('Certificado descargado',
          `${r.folio} · ${origen === 'servidor' ? 'generado por el servidor' : 'PDF generado'}`, 'ok');
      } catch (error) {
        aviso('No se pudo generar', error.message, 'error');
      }
    },
    alDescargarTicket: async (r) => {
      try {
        await descargarTicket(r);
        aviso('Ticket descargado', `${r.folio} · formato 80 mm`, 'ok');
      } catch (error) {
        aviso('No se pudo generar', error.message, 'error');
      }
    },
    alImprimir: r => imprimir(() => imprimirCertificado(r), `Certificado ${r.folio}`),
    alImprimirTicket: r => imprimir(() => imprimirTicket(r), `Ticket ${r.folio}`)
  });
}

/** Lanza una impresión y avisa si el navegador bloqueó la pestaña. */
async function imprimir(accion, que) {
  try {
    const resultado = await accion();
    if (resultado === 'descargado') {
      aviso('Ventana bloqueada', `${que}: se descargó el PDF. Permite ventanas emergentes para imprimir directo.`, 'alerta');
    }
  } catch (error) {
    aviso('No se pudo imprimir', error.message, 'error');
  }
}
