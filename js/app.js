/* ============================================================================
 *  INCASA · js/app.js
 *  ---------------------------------------------------------------------------
 *  Orquestador del panel: enrutado, pesaje en vivo, historial con CRUD,
 *  reportes gerenciales y perfil.
 *
 *  Ninguna llamada de red vive aquí: todo pasa por API.* (js/api.js).
 *  ==========================================================================*/

import '../css/tokens.css';
import '../css/base.css';
import '../css/components.css';
import '../css/panel.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/700.css';

import { API } from './api.js';
import { Bascula } from './bascula.js';
import { icono, montarIconos } from './iconos.js';
import { exportarCSV, exportarPDF, descargarCertificado, descargarTicket } from './reportes.js';
import { nombreMaterial } from './reportes-columnas.js';
import { verDetalle, editarPesaje, confirmarEliminar, iconoMaterial } from './pesajes-modales.js';
import { verCertificado } from './certificado-modal.js';
import {
  $, $$, aviso, kg, miles, fecha, fechaHora, hora, relativo, iniciales, hoyISO, esc,
  contarHasta, iniciarTema, montarInterruptorTema,
  sesion, actualizarSesion, cerrarSesion
} from './ui.js';

const TITULOS = {
  pesaje: 'Pesaje en vivo',
  historial: 'Historial de pesajes',
  reportes: 'Reportes gerenciales',
  perfil: 'Mi perfil'
};

const BOBINA = 'BOBINA_ALAMBRON';

const App = {
  usuario: null,
  enlace: null,        // conexión con la báscula (WebSocket o simulador)
  lectura: null,       // última trama recibida
  materiales: [],
  basculas: [],
  filtrados: [],
  ultimoRegistro: null,
  orden: { campo: 'capturadoEn', direccion: 'desc' },

  /* --- Fuente de la lectura de peso -----------------------------------
   *  'esperando'  → modo real, sin señal todavía (ESTADO INICIAL)
   *  'conectada'  → WebSocket del indicador entregando tramas
   *  'simulador'  → simulación activada a mano por el operario
   *  'manual'     → contingencia: el peso lo teclea el operario
   * ------------------------------------------------------------------*/
  fuente: 'esperando',

  eraEstable: false,
  animandoVisor: false,

  /* Ficha del equipo. La confirma la primera trama recibida. */
  equipo: { modelo: 'Hiweight X10', capacidad: 4600, division: 0.5 },

  /* ======================================================================
   *  ARRANQUE
   * ====================================================================*/
  async iniciar() {
    iniciarTema();
    montarIconos();
    montarInterruptorTema();

    this.usuario = sesion();
    if (!this.usuario) { location.replace('index.html'); return; }

    this.pintarUsuario();
    this.reloj();
    this.enrutar();
    this.acciones();

    [this.materiales, this.basculas] = await Promise.all([
      API.listarMateriales(),
      API.listarBasculas()
    ]);
    this.llenarCatalogos();

    this.conectarBascula();
    await this.cargarHistorial();
    this.pintarPerfil();
  },

  /* ======================================================================
   *  CABECERA Y ENRUTADO
   * ====================================================================*/

  pintarUsuario() {
    const u = this.usuario;
    $('#barra-nombre').textContent = u.nombre;
    $('#barra-rol').textContent = `${u.rol} · ${u.bascula}`;
    $('#ficha-usuario').textContent = iniciales(u.nombre);
    $('#bascula-activa').textContent = u.bascula;
    $('#cabezal-bascula').textContent = u.bascula;
    $('#fuente-bascula').textContent = u.bascula;
    $('#operario').value = u.nombre;
  },

  reloj() {
    const pintar = () => { $('#reloj').textContent = hora(new Date().toISOString()); };
    pintar();
    setInterval(pintar, 1000);
  },

  enrutar() {
    const ir = (vista) => {
      $$('.vista').forEach(v => { v.hidden = v.id !== 'vista-' + vista; });
      $$('.menu__item[data-vista]').forEach(b => {
        if (b.dataset.vista === vista) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
      $('#titulo-barra').textContent = TITULOS[vista];
      this.cerrarMenuMovil();
      window.scrollTo({ top: 0 });

      if (vista === 'reportes') this.pintarReportes();
    };
    this.ir = ir;

    $$('.menu__item[data-vista]').forEach(b =>
      b.addEventListener('click', () => ir(b.dataset.vista)));
    $$('[data-ir]').forEach(b =>
      b.addEventListener('click', () => ir(b.dataset.ir)));

    $('#btn-menu').addEventListener('click', () => {
      const lateral = $('#lateral');
      const abierto = lateral.dataset.abierto === 'si';
      lateral.dataset.abierto = abierto ? 'no' : 'si';
      $('#velo-menu').hidden = abierto;
      $('#btn-menu').setAttribute('aria-expanded', String(!abierto));
    });
    $('#velo-menu').addEventListener('click', () => this.cerrarMenuMovil());

    ir('pesaje');
  },

  cerrarMenuMovil() {
    $('#lateral').dataset.abierto = 'no';
    $('#velo-menu').hidden = true;
    $('#btn-menu').setAttribute('aria-expanded', 'false');
  },

  /* ======================================================================
   *  ESCUCHAS
   * ====================================================================*/

  acciones() {
    const salir = async () => {
      await API.logout();
      cerrarSesion();
      location.replace('index.html');
    };
    $('#btn-salir').addEventListener('click', salir);
    $('#btn-salir-2').addEventListener('click', salir);

    /* --- Fuente de lectura --- */
    $('#btn-simular').addEventListener('click', () => this.alternarSimulador());
    $('#btn-manual').addEventListener('click', () => this.fijarFuente('manual'));
    $('#btn-salir-manual').addEventListener('click', () => this.fijarFuente('esperando'));
    $('#btn-usar-manual').addEventListener('click', () => this.usarPesoManual());
    $('#peso-manual').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); this.usarPesoManual(); }
    });

    /* --- Teclas del cabezal --- */
    $('#tecla-cero').addEventListener('click', () => {
      this.enlace?.enviar('CERO');
      aviso('Cero ajustado', 'La plataforma quedó en 0.0 kg');
    });

    $('#tecla-tara').addEventListener('click', () => {
      const bruto = this.lectura ? this.lectura.bruto : 0;
      this.enlace?.enviar('TARA');
      $('#tara').value = kg(bruto);
      this.calcularNeto();
      aviso('Tara tomada', `${kg(bruto)} kg descontados`);
    });

    $('#tecla-bruto').addEventListener('click', () => {
      this.enlace?.enviar('BRUTO');
      aviso('Modo bruto', 'El visor muestra el peso sin descontar tara');
    });

    $('#tecla-capturar').addEventListener('click', () => this.capturar());

    /* --- Formulario de pesaje --- */
    $('#tara').addEventListener('input', () => this.calcularNeto());
    $('#forma-pesaje').addEventListener('submit', ev => this.guardar(ev));
    $('#btn-limpiar').addEventListener('click', () => this.limpiarFormulario());
    $('#btn-certificado').addEventListener('click', () => this.certificarUltimo());

    /* --- Filtros del historial --- */
    const filtros = ['#f-busqueda', '#f-material', '#f-bascula', '#f-desde', '#f-hasta'];
    filtros.forEach(sel => {
      $(sel).addEventListener('input', () => {
        if (sel === '#f-desde' || sel === '#f-hasta') this.marcarRango(null);
        this.cargarHistorial();
      });
    });

    $('#btn-limpiar-filtros').addEventListener('click', () => {
      filtros.forEach(s => { $(s).value = ''; });
      this.marcarRango('todo');
      this.cargarHistorial();
    });

    $$('#rangos button').forEach(b => {
      b.addEventListener('click', () => this.aplicarRango(b.dataset.rango));
    });

    $$('thead th[data-orden]').forEach(th => {
      th.addEventListener('click', () => this.ordenarPor(th.dataset.orden));
    });

    /* --- Acciones por fila (delegación: la tabla se repinta entera) --- */
    $('#tabla-historial').addEventListener('click', ev => {
      const boton = ev.target.closest('[data-accion]');
      if (!boton) return;

      const registro = this.filtrados.find(r => String(r.id) === boton.dataset.id);
      if (!registro) return;

      if (boton.dataset.accion === 'certificado') this.abrirCertificado(registro);
      if (boton.dataset.accion === 'ver')         this.verPesaje(registro);
      if (boton.dataset.accion === 'editar')      this.editarPesaje(registro);
      if (boton.dataset.accion === 'eliminar')    this.eliminarPesaje(registro);
    });

    /* --- Exportaciones --- */
    $('#btn-csv').addEventListener('click', () => this.exportarCSV());
    $('#btn-csv-pie').addEventListener('click', () => this.exportarCSV());
    $('#btn-csv-rep').addEventListener('click', () => this.exportarCSV());
    $('#btn-pdf').addEventListener('click', ev => this.exportarPDF(ev.currentTarget));
    $('#btn-pdf-rep').addEventListener('click', ev => this.exportarPDF(ev.currentTarget));

    /* --- Perfil --- */
    $('#forma-perfil').addEventListener('submit', ev => this.guardarPerfil(ev));
    $('#forma-clave').addEventListener('submit', ev => this.guardarClave(ev));
  },

  /* ======================================================================
   *  CATÁLOGOS
   * ====================================================================*/

  llenarCatalogos() {
    $('#opciones-material').innerHTML = this.materiales.map((m, i) => `
      <label class="opcion">
        <input type="radio" name="tipoMaterial" value="${esc(m.codigo)}" ${i === 0 ? 'checked' : ''}>
        ${icono(m.icono || iconoMaterial(m.codigo))}
        <span>
          <b>${esc(m.nombre)}</b>
          <small>${esc(m.descripcion || '')}</small>
        </span>
      </label>`).join('');

    $$('#opciones-material input').forEach(r =>
      r.addEventListener('change', () => this.pintarResumen()));

    $('#f-material').insertAdjacentHTML('beforeend', this.materiales
      .map(m => `<option value="${esc(m.codigo)}">${esc(m.nombre)}</option>`).join(''));

    const opcionesBascula = this.basculas
      .map(b => `<option value="${esc(b.codigo)}">${esc(b.nombre)}</option>`).join('');
    $('#f-bascula').insertAdjacentHTML('beforeend', opcionesBascula);
    $('#p-bascula').innerHTML = opcionesBascula;

    this.pintarResumen();
  },

  materialElegido() {
    return $('#opciones-material input:checked')?.value || '';
  },

  /* ======================================================================
   *  FUENTE DE LECTURA
   *  --------------------------------------------------------------------
   *  El sistema arranca SIEMPRE en modo real esperando al indicador. La
   *  simulación y el ingreso manual son decisiones explícitas del operario:
   *  nunca se activan solas, para que nadie confunda un peso inventado con
   *  una lectura certificada.
   * ====================================================================*/

  conectarBascula() {
    // Con backend real se abre el WebSocket y las tramas llegan solas.
    if (API.enProduccion) {
      this.enlace = API.conectarBascula(
        this.usuario.bascula,
        trama => this.recibirLectura(trama),
        estado => this.fijarFuente(estado === 'conectada' ? 'conectada' : 'esperando')
      );
      return;
    }

    // En modo demostración no hay indicador: se queda esperando a que el
    // operario elija simulador o contingencia.
    this.fijarFuente('esperando');
  },

  /** Cambia la fuente de lectura y repinta todo lo que depende de ella. */
  fijarFuente(modo) {
    // Al salir del simulador se detiene de verdad, no sólo visualmente.
    if (this.fuente === 'simulador' && modo !== 'simulador') {
      this.enlace?.cerrar();
      this.enlace = null;
      this.lectura = null;
      this.eraEstable = false;
    }

    this.fuente = modo;
    this.pintarFuente();
    this.pintarEstadoEnlace();

    if (modo === 'esperando' || modo === 'manual') this.limpiarVisor();
    if (modo === 'manual') setTimeout(() => $('#peso-manual').focus(), 60);
  },

  /** Estado visual del panel de fuente. */
  pintarFuente() {
    const caja = $('#fuente');
    const estado = $('#fuente-estado');
    const manual = $('#fuente-manual');
    const botones = $('#fuente-botones');
    const btnSimular = $('#btn-simular');
    const bascula = esc(this.usuario.bascula);

    caja.dataset.modo = this.fuente;
    manual.hidden = this.fuente !== 'manual';
    botones.hidden = this.fuente === 'manual';

    const textos = {
      esperando: `<span class="fuente__esperando" aria-hidden="true"></span>
                  Esperando conexión con indicador <b>Hiweight X10</b> / <b>${bascula}</b>`,
      conectada: `Indicador <b>Hiweight X10</b> conectado en <b>${bascula}</b>.
                  Lectura en tiempo real.`,
      simulador: `<b>Simulación activa.</b> Los pesos son generados por el sistema,
                  no provienen del indicador. No emitas certificados de producción real.`,
      manual:    `<b>Modo contingencia.</b> Teclea el peso bruto que muestra el
                  indicador; quedará marcado como ingreso manual.`
    };
    estado.innerHTML = textos[this.fuente];

    // El botón del simulador alterna entre activar y detener.
    if (this.fuente === 'simulador') {
      btnSimular.innerHTML = `${icono('circle-stop')} Detener simulación`;
      btnSimular.className = 'btn btn--linea btn--sm';
    } else {
      btnSimular.innerHTML = `${icono('play')} Activar Simulación de Báscula`;
      btnSimular.className = 'btn btn--ambar btn--sm';
    }

    // Las teclas del indicador sólo sirven si hay una fuente en vivo.
    const enVivo = this.fuente === 'simulador' || this.fuente === 'conectada';
    ['#tecla-cero', '#tecla-tara', '#tecla-bruto'].forEach(s => { $(s).disabled = !enVivo; });
  },

  alternarSimulador() {
    if (this.fuente === 'simulador') {
      this.fijarFuente('esperando');
      aviso('Simulación detenida', 'La báscula vuelve a esperar al indicador real');
      return;
    }

    this.fuente = 'simulador';
    this.enlace = Bascula.iniciar(
      this.usuario.bascula,
      trama => this.recibirLectura(trama),
      () => {}
    );
    this.pintarFuente();
    this.pintarEstadoEnlace();
    aviso('Simulación activada', 'Los pesos son generados por el sistema', 'alerta');
  },

  /** Toma el peso tecleado en modo contingencia y lo pasa al formulario. */
  usarPesoManual() {
    const valor = parseFloat($('#peso-manual').value);

    if (!Number.isFinite(valor) || valor <= 0) {
      return aviso('Peso inválido', 'Escribe el peso bruto que marca el indicador', 'error');
    }
    if (valor > this.equipo.capacidad) {
      return aviso('Fuera de capacidad',
        `La báscula admite hasta ${miles(this.equipo.capacidad)} kg`, 'error');
    }

    $('#peso-bruto').value = kg(valor);
    this.calcularNeto();
    $('#folio-previo').textContent = 'MANUAL ' + hora(new Date().toISOString());
    $('#peso-vivo').textContent = kg(valor);
    $('#visor').className = 'visor visor--listo';
    $('#estado-lectura').textContent = 'MANUAL';
    $('#estado-lectura').className = 'estado estado--estable';

    aviso('Peso manual registrado', `${kg(valor)} kg brutos · modo contingencia`, 'alerta');
    $('#codigo-rollo').focus();
  },

  limpiarVisor() {
    $('#peso-vivo').textContent = '----.-';
    $('#visor').className = 'visor';
    $('#estado-lectura').textContent = this.fuente === 'manual' ? 'MANUAL' : 'SIN LECTURA';
    $('#estado-lectura').className = 'estado estado--espera';
    $('#capacidad-nivel').style.width = '0%';
    $('#capacidad-texto').textContent = `0 % de ${miles(this.equipo.capacidad)} kg`;
    $('#capacidad').className = 'capacidad';
    $('#tecla-capturar').disabled = true;
  },

  pintarEstadoEnlace() {
    const textos = {
      esperando: 'esperando',
      conectada: 'conectada',
      simulador: 'simulación',
      manual: 'manual'
    };
    $('#enlace-bascula').dataset.estado = this.fuente;
    $('#enlace-texto').textContent = `${this.usuario.bascula} · ${textos[this.fuente]}`;
  },

  /* ======================================================================
   *  LECTURA EN VIVO
   * ====================================================================*/

  recibirLectura(t) {
    this.lectura = t;

    if (t.capacidad) {
      this.equipo = {
        modelo: t.modelo || this.equipo.modelo,
        capacidad: t.capacidad,
        division: t.division ?? this.equipo.division
      };
    }

    const listo = t.estable && t.bruto > 5 && !t.sobrecarga;

    /* Al pasar de «en movimiento» a «estable» el número hace un conteo corto
       hasta el valor definitivo: es el instante en que el operario debe mirar
       la cifra, y el movimiento se la señala. */
    if (listo && !this.eraEstable) {
      this.animarVisor(t.peso);
    } else if (!this.animandoVisor) {
      $('#peso-vivo').textContent = kg(t.peso);
    }
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

  /** Contador animado del visor al estabilizarse la lectura. */
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
    $('#codigo-rollo').focus();
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

    $('#resumen-neto').textContent = `${kg(neto)} kg`;
    $('#resumen-material').textContent = nombreMaterial(this.materialElegido());

    const pct = this.equipo.capacidad ? (bruto / this.equipo.capacidad) * 100 : 0;
    $('#resumen-capacidad').textContent = bruto ? `${miles(pct, 1)} %` : '—';
  },

  /* ======================================================================
   *  GUARDAR PESAJE
   * ====================================================================*/

  async guardar(ev) {
    ev.preventDefault();

    const bruto = parseFloat($('#peso-bruto').value) || 0;
    const tara = parseFloat($('#tara').value) || 0;
    const tipoMaterial = this.materialElegido();
    const codigoRollo = $('#codigo-rollo').value.trim();
    const ordenTrabajo = $('#orden-trabajo').value.trim();
    const observaciones = $('#observaciones').value.trim();

    if (!bruto)         return aviso('Falta el peso', 'Captura el peso o usa el ingreso manual', 'error');
    if (!tipoMaterial)  return aviso('Falta el material', 'Elige bobina de alambrón o producto semielaborado', 'error');
    if (!codigoRollo)   return aviso('Falta el código de rollo', 'Escribe el código de rollo o lote', 'error');
    if (!ordenTrabajo)  return aviso('Falta la orden de trabajo', 'Escribe el número de orden', 'error');
    if (!observaciones) return aviso('Faltan las observaciones', 'Describe el estado del material o escribe «Sin novedad»', 'error');
    if (tara >= bruto)  return aviso('Tara inválida', 'La tara no puede igualar o superar el bruto', 'error');

    const pesaje = {
      ordenTrabajo,
      codigoRollo,
      tipoMaterial,
      operario: $('#operario').value.trim(),
      operarioId: this.usuario.id,
      pesoBruto: +bruto.toFixed(1),
      tara: +tara.toFixed(1),
      pesoNeto: +(bruto - tara).toFixed(1),
      unidad: 'kg',                        // estricto e inamovible
      bascula: this.usuario.bascula,
      modeloBascula: this.equipo.modelo,
      estable: this.fuente !== 'manual',
      // Deja constancia de cómo se obtuvo el peso: una auditoría debe poder
      // distinguir una lectura certificada de una tecleada en contingencia.
      origenLectura: this.fuente,
      observaciones,
      capturadoEn: new Date().toISOString()
    };

    const boton = $('#forma-pesaje button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      const registro = await API.guardarPesaje(pesaje);
      this.ultimoRegistro = registro;

      aviso('Pesaje guardado', `Folio ${registro.folio} · ${kg(registro.pesoNeto)} kg netos`, 'ok');
      $('#folio-previo').textContent = registro.folio;

      this.limpiarFormulario(false);
      if (this.fuente === 'simulador') Bascula.retirarCarga();

      await this.cargarHistorial();
      this.pintarPerfil();

      // El certificado se abre en vista previa: el operario comprueba el
      // documento antes de imprimirlo o archivarlo.
      this.abrirCertificado(registro);

    } catch (error) {
      aviso('No se guardó', error.message || 'Intenta de nuevo', 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  },

  limpiarFormulario(avisar = true) {
    ['#peso-bruto', '#peso-neto', '#codigo-rollo', '#orden-trabajo', '#observaciones']
      .forEach(s => { $(s).value = ''; });
    $('#tara').value = '0.0';
    $('#peso-manual').value = '';
    const primero = $('#opciones-material input');
    if (primero) primero.checked = true;

    this.calcularNeto();
    if (avisar) aviso('Registro limpio', 'Listo para el siguiente rollo');
  },

  /* ======================================================================
   *  CERTIFICADO DE PESAJE
   * ====================================================================*/

  /** Abre la vista previa del certificado con sus dos descargas. */
  abrirCertificado(registro) {
    verCertificado(registro, {
      equipo: this.equipo,

      alDescargarPDF: async (r) => {
        try {
          const origen = await descargarCertificado(r, this.equipo);
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
      }
    });
  },

  certificarUltimo() {
    const registro = this.ultimoRegistro || this.filtrados[0];
    if (!registro) return aviso('Nada que certificar', 'Guarda primero un pesaje', 'error');
    this.abrirCertificado(registro);
  },

  /* ======================================================================
   *  HISTORIAL
   * ====================================================================*/

  filtrosActuales() {
    return {
      buscar: $('#f-busqueda').value,
      tipoMaterial: $('#f-material').value,
      bascula: $('#f-bascula').value,
      desde: $('#f-desde').value,
      hasta: $('#f-hasta').value
    };
  },

  async cargarHistorial() {
    const { datos } = await API.listarPesajes(this.filtrosActuales());
    this.filtrados = datos;

    this.aplicarOrden();
    this.pintarTabla();
    this.pintarIndicadores();
    this.pintarRecientes();
    $('#contador-menu').textContent = miles(this.filtrados.length);

    if (!$('#vista-reportes').hidden) this.pintarReportes();
  },

  aplicarRango(cual) {
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
    this.cargarHistorial();
  },

  marcarRango(cual) {
    $$('#rangos button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.rango === cual));
    });
  },

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
      let x = a[campo];
      let y = b[campo];
      if (campo === 'capturadoEn') { x = new Date(x).getTime(); y = new Date(y).getTime(); }
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo;
      return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo;
    });

    $$('thead th[data-orden]').forEach(th => {
      if (th.dataset.orden === campo) {
        th.setAttribute('aria-sort', direccion === 'asc' ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    });
  },

  filaHTML(r, i) {
    return `
      <tr class="entra-fila" style="--i:${i}">
        <td class="num">${esc(r.folio)}</td>
        <td>
          ${esc(fechaHora(r.capturadoEn))}
          <small style="display:block; color:var(--texto-3); font-size:12.5px">
            ${esc(relativo(r.capturadoEn))}${r.modificadoEn ? ' · editado' : ''}
          </small>
        </td>
        <td class="num">${esc(r.ordenTrabajo)}</td>
        <td class="num">${esc(r.codigoRollo)}</td>
        <td>
          <span class="etiqueta ${r.tipoMaterial === BOBINA ? 'etiqueta--ambar' : 'etiqueta--neutra'}">
            ${icono(iconoMaterial(r.tipoMaterial))}${esc(nombreMaterial(r.tipoMaterial))}
          </span>
        </td>
        <td>${esc(r.operario)}</td>
        <td class="num">${kg(r.pesoBruto)}</td>
        <td class="num">${kg(r.tara)}</td>
        <td class="num"><b>${kg(r.pesoNeto)}</b></td>
        <td>${esc(r.bascula)}</td>
        <td>
          <div class="acciones-fila">
            <button class="btn-icono" data-accion="ver" data-id="${esc(r.id)}"
                    title="Ver detalle" aria-label="Ver detalle de ${esc(r.folio)}">
              ${icono('search')}
            </button>
            <button class="btn-icono" data-accion="editar" data-id="${esc(r.id)}"
                    title="Editar" aria-label="Editar ${esc(r.folio)}">
              ${icono('pencil')}
            </button>
            <button class="btn-icono btn-icono--peligro" data-accion="eliminar" data-id="${esc(r.id)}"
                    title="Eliminar" aria-label="Eliminar ${esc(r.folio)}">
              ${icono('trash-2')}
            </button>
          </div>
        </td>
        <td class="col-fija">
          <button class="btn-certificado" data-accion="certificado" data-id="${esc(r.id)}"
                  title="Ver y descargar el certificado de ${esc(r.folio)}">
            ${icono('file-check')} Ver / Descargar
          </button>
        </td>
      </tr>`;
  },

  pintarTabla() {
    const cuerpo = $('#tabla-historial');
    const datos = this.filtrados;

    if (!datos.length) {
      cuerpo.innerHTML = `
        <tr><td colspan="12">
          <div class="vacio">
            ${icono('inbox')}
            <b>Sin registros</b>
            <p>Ningún pesaje coincide con los filtros. Ajusta el rango de fechas
               o limpia la búsqueda.</p>
          </div>
        </td></tr>`;
    } else {
      cuerpo.innerHTML = datos.map((r, i) => this.filaHTML(r, Math.min(i, 24))).join('');
    }

    $('#conteo-historial').textContent =
      `${miles(datos.length)} ${datos.length === 1 ? 'registro' : 'registros'}`;
  },

  pintarIndicadores() {
    const r = this.resumir(this.filtrados);

    contarHasta($('#kpi-registros'), r.total);
    contarHasta($('#kpi-kilos'), r.netoTotal, { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#kpi-bobinas'), r.bobinas);
    contarHasta($('#kpi-medio'), r.netoMedio, { decimales: 1, sufijo: ' <span>kg</span>' });

    const hoy = this.filtrados.filter(x => x.capturadoEn.slice(0, 10) === hoyISO()).length;
    this.pie('#kpi-registros-pie', 'clipboard-list', `${miles(hoy)} en la jornada de hoy`);

    this.pie('#kpi-kilos-pie', 'weight',
      r.total ? `Bruto de ${miles(r.brutoTotal, 1)} kg antes de tara` : 'Sin datos en el filtro');

    this.pie('#kpi-bobinas-pie', 'disc-3',
      r.total ? `${miles(r.semielaborado)} de producto semielaborado` : 'Sin datos en el filtro');

    this.pie('#kpi-medio-pie', 'ruler',
      r.total ? `Entre ${kg(r.netoMin)} y ${kg(r.netoMax)} kg` : 'Sin datos en el filtro');
  },

  pie(selector, nombreIcono, texto, clase = '') {
    const el = $(selector);
    el.className = 'indicador__pie ' + clase;
    el.innerHTML = `${icono(nombreIcono)}<span></span>`;
    el.querySelector('span').textContent = texto;
  },

  resumir(datos) {
    const total = datos.length;
    if (!total) {
      return {
        total: 0, netoTotal: 0, netoMedio: 0, brutoTotal: 0, taraTotal: 0,
        netoMin: 0, netoMax: 0, bobinas: 0, semielaborado: 0
      };
    }

    const netos = datos.map(r => r.pesoNeto);
    const netoTotal = netos.reduce((s, v) => s + v, 0);

    return {
      total,
      netoTotal,
      netoMedio: netoTotal / total,
      brutoTotal: datos.reduce((s, r) => s + r.pesoBruto, 0),
      taraTotal: datos.reduce((s, r) => s + r.tara, 0),
      netoMin: Math.min(...netos),
      netoMax: Math.max(...netos),
      bobinas: datos.filter(r => r.tipoMaterial === BOBINA).length,
      semielaborado: datos.filter(r => r.tipoMaterial !== BOBINA).length
    };
  },

  pintarRecientes() {
    const dia = hoyISO();
    const hoy = this.filtrados.filter(r => r.capturadoEn.slice(0, 10) === dia).slice(0, 5);
    const cuerpo = $('#tabla-recientes');

    if (!hoy.length) {
      cuerpo.innerHTML = `
        <tr><td colspan="6">
          <div class="vacio">
            ${icono('scale')}
            <b>Turno sin pesajes</b>
            <p>El primer registro de la jornada aparecerá aquí.</p>
          </div>
        </td></tr>`;
      return;
    }

    cuerpo.innerHTML = hoy.map((r, i) => `
      <tr class="entra-fila" style="--i:${i}">
        <td class="num">${esc(r.folio)}</td>
        <td class="num">${esc(r.ordenTrabajo)}</td>
        <td class="num">${esc(r.codigoRollo)}</td>
        <td>
          <span class="etiqueta ${r.tipoMaterial === BOBINA ? 'etiqueta--ambar' : 'etiqueta--neutra'}">
            ${icono(iconoMaterial(r.tipoMaterial))}${esc(nombreMaterial(r.tipoMaterial))}
          </span>
        </td>
        <td class="num"><b>${kg(r.pesoNeto)}</b></td>
        <td class="num">${hora(r.capturadoEn)}</td>
      </tr>`).join('');
  },

  /* ======================================================================
   *  CRUD DEL HISTORIAL
   * ====================================================================*/

  verPesaje(registro) {
    verDetalle(registro, {
      equipo: this.equipo,
      alEditar: r => this.editarPesaje(r),
      alCertificar: r => this.abrirCertificado(r)
    });
  },

  editarPesaje(registro) {
    editarPesaje(registro, {
      materiales: this.materiales,
      alGuardar: async (id, cambios) => {
        try {
          const actualizado = await API.actualizarPesaje(id, {
            ...cambios,
            modificadoPor: this.usuario.usuario
          });
          aviso('Pesaje actualizado', `Folio ${actualizado.folio} guardado`, 'ok');
          await this.cargarHistorial();
          return actualizado;
        } catch (error) {
          aviso('No se pudo actualizar', error.message || 'Intenta de nuevo', 'error');
          throw error;
        }
      }
    });
  },

  async eliminarPesaje(registro) {
    if (!await confirmarEliminar(registro)) return;

    try {
      await API.eliminarPesaje(registro.id);
      aviso('Pesaje eliminado', `Folio ${registro.folio} dado de baja`, 'ok');
      await this.cargarHistorial();
      this.pintarPerfil();
    } catch (error) {
      aviso('No se pudo eliminar', error.message || 'Intenta de nuevo', 'error');
    }
  },

  /* ======================================================================
   *  REPORTES GERENCIALES
   * ====================================================================*/

  pintarReportes() {
    const datos = this.filtrados;
    const r = this.resumir(datos);
    const porDia = this.agruparPorDia(datos);
    const porHora = this.agruparPorHora(datos);
    const porMaterial = this.agruparPor(datos, x => x.tipoMaterial);
    const porBascula = this.agruparPor(datos, x => x.bascula);

    /* --- Alcance --- */
    const f = this.filtrosActuales();
    const periodo = f.desde || f.hasta
      ? `${f.desde ? fecha(f.desde) : 'inicio'} — ${f.hasta ? fecha(f.hasta) : 'hoy'}`
      : 'todo el histórico';
    $('#reportes-alcance').textContent =
      `${miles(r.total)} pesajes · ${periodo}` +
      (f.tipoMaterial ? ` · ${nombreMaterial(f.tipoMaterial)}` : '') +
      (f.bascula ? ` · ${f.bascula}` : '');

    /* --- Kilogramos de hoy y del mes --- */
    const hoy = hoyISO();
    const mes = hoy.slice(0, 7);
    const deHoy = datos.filter(x => x.capturadoEn.slice(0, 10) === hoy);
    const delMes = datos.filter(x => x.capturadoEn.slice(0, 7) === mes);
    const sumaNeto = (arr) => arr.reduce((s, x) => s + x.pesoNeto, 0);

    contarHasta($('#rep-hoy'), sumaNeto(deHoy), { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#rep-mes'), sumaNeto(delMes), { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#rep-medio'), r.netoMedio, { decimales: 1, sufijo: ' <span>kg</span>' });
    contarHasta($('#rep-tara'), r.taraTotal, { decimales: 1, sufijo: ' <span>kg</span>' });

    this.pie('#rep-hoy-pie', 'clipboard-list',
      `${miles(deHoy.length)} ${deHoy.length === 1 ? 'operación' : 'operaciones'} hoy`);
    this.pie('#rep-mes-pie', 'sigma',
      `${miles(delMes.length)} operaciones · ${miles(sumaNeto(delMes) / 1000, 2)} toneladas`);
    this.pie('#rep-medio-pie', 'ruler',
      r.total ? `Entre ${kg(r.netoMin)} y ${kg(r.netoMax)} kg` : 'Sin datos en el filtro');
    this.pie('#rep-tara-pie', 'layers',
      r.brutoTotal ? `${miles(r.taraTotal / r.brutoTotal * 100, 1)} % del peso bruto`
                   : 'Sin datos en el filtro');

    /* --- Material de mayor volumen (por tonelaje) --- */
    const lider = porMaterial[0];
    $('#rep-lider').textContent = lider ? nombreMaterial(lider.clave) : '—';
    this.pie('#rep-lider-pie', 'trending-up',
      lider
        ? `${miles(lider.neto / 1000, 2)} t · ${miles(lider.neto / r.netoTotal * 100, 1)} % del total`
        : 'Sin datos en el filtro',
      'es-ambar');

    /* --- Hora pico --- */
    const pico = porHora.reduce((mx, h) => (h.cuenta > (mx?.cuenta ?? 0) ? h : mx), null);
    const franja = pico ? `${String(pico.hora).padStart(2, '0')}:00 – ${String(pico.hora + 1).padStart(2, '0')}:00` : '—';

    $('#rep-pico-hora').textContent = franja;
    this.pie('#rep-pico-hora-pie', 'clock',
      pico ? `${miles(pico.cuenta)} pesajes · ${miles(pico.neto, 1)} kg` : 'Sin datos en el filtro',
      'es-ambar');

    $('#hora-pico-valor').textContent = franja;
    $('#hora-pico-detalle').textContent = pico
      ? `Mayor flujo de báscula: ${miles(pico.cuenta)} ${pico.cuenta === 1 ? 'pesaje' : 'pesajes'} y ${miles(pico.neto, 1)} kg movidos`
      : 'Sin datos en el periodo';

    /* --- Gráficos y tablas --- */
    this.pintarReparto('#reparto-material', porMaterial, r.netoTotal, {
      nombre: (c) => nombreMaterial(c),
      color: (c) => (c === BOBINA ? 'ambar' : 'verde')
    });
    $('#tonelaje-rotulo').textContent = `${miles(r.netoTotal / 1000, 2)} t`;

    this.pintarReparto('#reparto-bascula', porBascula, r.netoTotal, { nombre: (c) => c });

    this.pintarGraficoHoras(porHora, pico);
    this.pintarGraficoDias(porDia);
    this.pintarOperarios(datos);
  },

  /** Agrupa por una clave y ordena por tonelaje descendente. */
  agruparPor(datos, clave) {
    const mapa = new Map();
    datos.forEach(r => {
      const k = clave(r);
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
      const dia = r.capturadoEn.slice(0, 10);
      const a = mapa.get(dia) || { dia, neto: 0, cuenta: 0 };
      a.neto += r.pesoNeto;
      a.cuenta += 1;
      mapa.set(dia, a);
    });
    return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  },

  /**
   * Distribución por hora del día. Se devuelven las 24 horas aunque estén
   * vacías: el gráfico de flujo necesita el eje completo para que se vea
   * dónde empieza y acaba la jornada.
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

  /** Barras horizontales de reparto porcentual. */
  pintarReparto(selector, filas, total, { nombre = (c) => c, color = () => '' } = {}) {
    const caja = $(selector);

    if (!filas.length) {
      caja.innerHTML = `<div class="vacio">${icono('layers')}
        <b>Sin datos</b><p>Ajusta los filtros del historial.</p></div>`;
      return;
    }

    caja.innerHTML = filas.map((f, i) => {
      const pct = total ? (f.neto / total) * 100 : 0;
      const clase = color(f.clave);
      return `
        <div class="reparto__fila" style="--i:${i}">
          <div class="reparto__cabeza">
            <b>${esc(nombre(f.clave))}</b>
            <span>${miles(f.cuenta)} pesajes · ${miles(f.neto, 1)} kg · ${miles(pct, 1)} %</span>
          </div>
          <div class="reparto__pista">
            <div class="reparto__nivel ${clase ? 'reparto__nivel--' + clase : ''}"
                 style="width:${pct.toFixed(2)}%"></div>
          </div>
        </div>`;
    }).join('');
  },

  /** Histograma de pesajes por hora, con la franja pico resaltada. */
  pintarGraficoHoras(porHora, pico) {
    const svg = $('#grafico-horas');
    const conDatos = porHora.some(h => h.cuenta > 0);

    if (!conDatos) {
      svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle"
        class="grafico__eje">Sin pesajes en el periodo filtrado</text>`;
      $('#grafico-horas-rotulo').textContent = 'sin datos';
      return;
    }

    // Sólo la franja laboral con actividad, más un margen a cada lado.
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
      return `<line class="grafico__guia" x1="${MARGEN.izq}" y1="${y}"
                    x2="${ANCHO - MARGEN.der}" y2="${y}"/>`;
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
        class="grafico__eje">Sin producción en el periodo filtrado</text>`;
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
      return `<line class="grafico__guia" x1="${MARGEN.izq}" y1="${y}"
                    x2="${ANCHO - MARGEN.der}" y2="${y}"/>`;
    }).join('');

    const barras = dias.map((d, i) => {
      const altura = maximo ? Math.max(2, (d.neto / maximo) * alturaUtil) : 2;
      const x = MARGEN.izq + i * paso + (paso - anchoBarra) / 2;
      const y = MARGEN.arriba + alturaUtil - altura;

      const etiqueta = i % salto === 0
        ? `<text class="grafico__eje" x="${x + anchoBarra / 2}" y="${ALTO - 10}"
                 text-anchor="middle">${fecha(d.dia).slice(0, 5)}</text>`
        : '';

      return `
        <g style="--i:${i}">
          <rect class="grafico__barra ${d.neto === maximo ? 'grafico__barra--pico' : ''}"
                x="${x}" y="${y}" width="${anchoBarra}" height="${altura}" rx="3">
            <title>${fecha(d.dia)} · ${miles(d.neto, 1)} kg · ${d.cuenta} pesajes</title>
          </rect>
          ${etiqueta}
        </g>`;
    }).join('');

    svg.setAttribute('viewBox', `0 0 ${ANCHO} ${ALTO}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = guias + barras;

    $('#grafico-rotulo').textContent = `máximo ${miles(maximo, 1)} kg · ${dias.length} jornadas`;
  },

  pintarOperarios(datos) {
    const cuerpo = $('#tabla-operarios');

    if (!datos.length) {
      cuerpo.innerHTML = `<tr><td colspan="6">
        <div class="vacio">${icono('user')}
          <b>Sin datos</b><p>Ajusta los filtros del historial.</p></div>
      </td></tr>`;
      $('#operarios-rotulo').textContent = '0 operarios';
      return;
    }

    const mapa = new Map();
    datos.forEach(r => {
      const o = mapa.get(r.operario) ||
        { nombre: r.operario, cuenta: 0, bobinas: 0, semi: 0, neto: 0 };
      o.cuenta += 1;
      o.neto += r.pesoNeto;
      if (r.tipoMaterial === BOBINA) o.bobinas += 1; else o.semi += 1;
      mapa.set(r.operario, o);
    });

    const filas = [...mapa.values()].sort((a, b) => b.neto - a.neto);
    $('#operarios-rotulo').textContent =
      `${filas.length} ${filas.length === 1 ? 'operario' : 'operarios'}`;

    cuerpo.innerHTML = filas.map((o, i) => `
      <tr class="entra-fila" style="--i:${i}">
        <td>
          <span style="display:inline-flex; align-items:center; gap:10px">
            <span class="ficha" style="width:32px; height:32px; font-size:13px">
              ${esc(iniciales(o.nombre))}
            </span>
            ${esc(o.nombre)}
          </span>
        </td>
        <td class="num">${miles(o.cuenta)}</td>
        <td class="num">${miles(o.bobinas)}</td>
        <td class="num">${miles(o.semi)}</td>
        <td class="num"><b>${miles(o.neto, 1)}</b></td>
        <td class="num">${kg(o.neto / o.cuenta)}</td>
      </tr>`).join('');
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
      const filtros = this.filtrosActuales();
      const { origen, filas } = await exportarPDF(this.filtrados, {
        filtros: { ...filtros, bascula: filtros.bascula || this.usuario.bascula },
        resumen: this.resumir(this.filtrados),
        usuario: this.usuario
      });
      aviso('Reporte descargado', `${miles(filas)} registros · generado por el ${origen}`, 'ok');
    } catch (error) {
      aviso('No se pudo generar', error.message || 'Intenta de nuevo', 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  },

  /* ======================================================================
   *  PERFIL
   * ====================================================================*/

  pintarPerfil() {
    const u = this.usuario;
    $('#perfil-iniciales').textContent = iniciales(u.nombre);
    $('#perfil-nombre').textContent = u.nombre;
    $('#perfil-rol').textContent = u.rol;
    $('#perfil-usuario').textContent = u.usuario;
    $('#perfil-bascula').textContent = u.bascula;
    $('#perfil-ingreso').textContent = fechaHora(u.ingreso || new Date().toISOString());

    const hoy = this.filtrados.filter(r => r.capturadoEn.slice(0, 10) === hoyISO());
    $('#perfil-pesajes').textContent = miles(hoy.length);
    $('#perfil-kilos').textContent = `${miles(hoy.reduce((s, r) => s + r.pesoNeto, 0), 1)} kg`;

    $('#p-nombre').value = u.nombre;
    $('#p-usuario').value = u.usuario;
    $('#p-correo').value = u.correo || '';
    $('#p-rol').value = u.rol;
    $('#p-bascula').value = u.bascula;
  },

  async guardarPerfil(ev) {
    ev.preventDefault();

    const datos = {
      ...this.usuario,
      nombre: $('#p-nombre').value.trim(),
      rol: $('#p-rol').value,
      correo: $('#p-correo').value.trim(),
      bascula: $('#p-bascula').value,
      unidad: 'kg'
    };

    if (!datos.nombre) return aviso('Falta el nombre', 'El nombre no puede quedar vacío', 'error');

    const boton = ev.target.querySelector('button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      await API.guardarPerfil(datos);

      const cambioBascula = datos.bascula !== this.usuario.bascula;
      this.usuario = datos;
      actualizarSesion(datos);
      this.pintarUsuario();
      this.pintarPerfil();

      if (cambioBascula) {
        // Al cambiar de báscula se vuelve a modo real: la fuente anterior ya
        // no corresponde a este equipo.
        this.fijarFuente('esperando');
        this.conectarBascula();
        aviso('Báscula cambiada', `Reconectando con ${datos.bascula}`, 'ok');
      } else {
        aviso('Perfil actualizado', 'Los cambios ya están aplicados', 'ok');
      }
    } catch (error) {
      aviso('No se pudo guardar', error.message || 'Intenta de nuevo', 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  },

  async guardarClave(ev) {
    ev.preventDefault();

    const actual = $('#c-actual').value;
    const nueva = $('#c-nueva').value;
    const repetir = $('#c-repetir').value;

    if (!actual || !nueva) return aviso('Campos incompletos', 'Escribe la contraseña actual y la nueva', 'error');
    if (nueva.length < 8)  return aviso('Contraseña corta', 'Usa al menos 8 caracteres', 'error');
    if (nueva !== repetir) return aviso('No coinciden', 'La nueva contraseña y su repetición son distintas', 'error');

    const boton = ev.target.querySelector('button[type="submit"]');
    boton.dataset.cargando = 'si';
    boton.disabled = true;

    try {
      await API.cambiarClave({ claveActual: actual, claveNueva: nueva });
      ev.target.reset();
      aviso('Contraseña actualizada', 'Úsala en tu próximo ingreso', 'ok');
    } catch (error) {
      aviso('No se actualizó', error.message, 'error');
    } finally {
      delete boton.dataset.cargando;
      boton.disabled = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.iniciar());

// Cómodo para depurar desde la consola del navegador.
window.App = App;
