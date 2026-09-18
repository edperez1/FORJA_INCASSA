package ni.com.incasa.pesaje.pesaje;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.catalogo.Bascula;
import ni.com.incasa.pesaje.catalogo.CatalogoServicio;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import ni.com.incasa.pesaje.comun.Planta;
import ni.com.incasa.pesaje.comun.Texto;
import ni.com.incasa.pesaje.produccion.Cierre;
import ni.com.incasa.pesaje.produccion.Produccion;
import ni.com.incasa.pesaje.produccion.ProduccionServicio;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Reglas del pesaje. Todo lo que el frontend valida se valida otra vez aquí:
 * el navegador lo hace para ahorrar viajes, el servidor para que nadie se lo
 * salte con una petición a mano.
 */
@Service
public class PesajeServicio {

    private final PesajeRepositorio pesajes;
    private final ProduccionServicio producciones;
    private final CatalogoServicio catalogos;
    private final Auditor auditor;
    private final boolean aceptarSimulador;

    public PesajeServicio(PesajeRepositorio pesajes, ProduccionServicio producciones,
                          CatalogoServicio catalogos, Auditor auditor,
                          @Value("${incasa.pesaje.aceptar-simulador}") boolean aceptarSimulador) {
        this.pesajes = pesajes;
        this.producciones = producciones;
        this.catalogos = catalogos;
        this.auditor = auditor;
        this.aceptarSimulador = aceptarSimulador;
    }

    /* ====================================================================
     *  Alta
     * ==================================================================*/
    @Transactional
    public PesajeDto crear(SesionActual s, PesajePeticiones.Alta p) {
        s.exigir(Permiso.PESAR);

        // Primero la producción, bloqueada: nadie la termina mientras pesamos.
        Produccion produccion = producciones.abiertaParaPesar(p.produccionId());

        TipoPesaje tipo = tipo(p.tipo());
        String bobina = Texto.opcional(p.codigoBobina());
        if (tipo == TipoPesaje.ENTRADA && bobina == null) {
            throw ApiExcepcion.validacion("codigoBobina", "Indica el código de la bobina que entra al proceso");
        }

        String origen = origenValido(p.origenLectura());
        boolean estable = Boolean.TRUE.equals(p.estable());
        if (p.unidad() != null && !"kg".equals(p.unidad())) {
            throw ApiExcepcion.validacion("unidad", "La unidad es siempre kg");
        }
        if (Planta.ORIGEN_CONECTADA.equals(origen) && !estable) {
            throw ApiExcepcion.validacion("estable",
                    "La lectura no estaba estable: espera a que el indicador deje de oscilar");
        }

        /* --- El peso, contra la capacidad de la báscula activa --- */
        Bascula bascula = catalogos.basculaActiva();
        BigDecimal bruto = unDecimal(p.pesoBruto());
        BigDecimal tara = unDecimal(p.tara());

        if (bruto.signum() <= 0) {
            throw ApiExcepcion.validacion("pesoBruto", "El peso bruto debe ser mayor que cero");
        }
        if (bruto.compareTo(bascula.getCapacidadKg()) > 0) {
            throw ApiExcepcion.validacion("pesoBruto", "El peso bruto supera la capacidad de la báscula ("
                    + bascula.getCapacidadKg().stripTrailingZeros().toPlainString() + " kg)");
        }
        if (tara.signum() < 0) {
            throw ApiExcepcion.validacion("tara", "La tara no puede ser negativa");
        }
        if (tara.compareTo(bruto) >= 0) {
            throw ApiExcepcion.validacion("tara", "La tara no puede igualar o superar el bruto");
        }

        // La salida acumulada no puede pesar más que la bobina que entró.
        if (tipo == TipoPesaje.SALIDA) producciones.validarSalida(produccion, bruto.subtract(tara));

        Pesaje r = new Pesaje(
                "CP-" + String.format("%06d", pesajes.siguienteFolio()),
                produccion, tipo, bascula, s.usuario(), bruto, tara, estable, origen);
        r.setCodigoBobina(bobina);
        r.setCantidad(tipo == TipoPesaje.SALIDA ? cantidadProducida(produccion, p.cantidad(), r.getPesoNeto()) : null);
        r.setObservaciones(Texto.opcional(p.observaciones()));
        pesajes.save(r);

        // Una salida puede completar lo pedido y cerrar la producción sola.
        Cierre cierre = tipo == TipoPesaje.SALIDA ? producciones.evaluarCierre(produccion, s.usuario()) : null;

        // Se recarga con join fetch: el DTO lleva los catálogos de la producción.
        return PesajeDto.de(pesajes.vigente(r.getId()).orElseThrow()).conCierre(cierre);
    }

    /* ====================================================================
     *  Consulta
     * ==================================================================*/
    @Transactional(readOnly = true)
    public PesajeDto obtener(Long id) {
        return PesajeDto.de(cargar(id));
    }

    /* ====================================================================
     *  Corrección · código de bobina, cantidad producida y observaciones
     * ==================================================================*/
    @Transactional
    public PesajeDto corregir(SesionActual s, Long id, PesajePeticiones.Correccion c) {
        s.exigir(Permiso.CORREGIR);
        Pesaje r = cargar(id);

        if (c.codigoBobina() != null) {
            String bobina = Texto.opcional(c.codigoBobina());
            if (bobina == null && r.getTipo() == TipoPesaje.ENTRADA) {
                throw ApiExcepcion.validacion("codigoBobina", "Un pesaje de entrada necesita el código de bobina");
            }
            r.setCodigoBobina(bobina);
        }
        if (c.cantidad() != null) {
            if (r.getTipo() != TipoPesaje.SALIDA) {
                throw ApiExcepcion.validacion("cantidad", "Sólo los pesajes de salida llevan cantidad producida");
            }
            r.setCantidad(c.cantidad().setScale(2, RoundingMode.HALF_UP));
        }
        if (c.observaciones() != null) r.setObservaciones(Texto.opcional(c.observaciones()));

        r.marcarModificado(s.usuario());
        auditor.anotar(s.usuario(), "EDICION_PESAJE", "pesaje", id, r.getFolio());
        return PesajeDto.de(r);
    }

    /* ====================================================================
     *  Anulación
     * ==================================================================*/
    @Transactional
    public void anular(SesionActual s, Long id, String motivo) {
        s.exigir(Permiso.CORREGIR);
        Pesaje r = cargar(id);
        String m = Texto.opcional(motivo);
        if (m == null) m = "Baja desde el historial";
        if (m.length() > 300) m = m.substring(0, 300);

        if (r.getTipo() == TipoPesaje.ENTRADA) {
            producciones.validarAnulacionEntrada(r.getProduccion().getId(), r.getPesoNeto());
        }
        r.anular(s.usuario(), m);
        auditor.anotar(s.usuario(), "ANULAR_PESAJE", "pesaje", id,
                r.getFolio() + " · " + r.getPesoNeto().toPlainString() + " kg · " + m);
    }

    /* ====================================================================
     *  Validaciones
     * ==================================================================*/

    private Pesaje cargar(Long id) {
        return pesajes.vigente(id).orElseThrow(() -> ApiExcepcion.noEncontrado("El pesaje"));
    }

    private static TipoPesaje tipo(String s) {
        try {
            return TipoPesaje.valueOf(s);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiExcepcion.validacion("tipo", "El tipo de pesaje es ENTRADA o SALIDA");
        }
    }

    /**
     * Sin origen declarado se asume «manual»: es el valor que menos promete.
     * Nunca se presume una lectura certificada que nadie ha afirmado.
     */
    private String origenValido(String origen) {
        if (origen == null || origen.isBlank()) return Planta.ORIGEN_MANUAL;
        if (!Planta.ORIGENES.contains(origen)) {
            throw ApiExcepcion.validacion("origenLectura", "Origen de lectura desconocido: «" + origen + "»");
        }
        if (Planta.ORIGEN_SIMULADOR.equals(origen) && !aceptarSimulador) {
            throw ApiExcepcion.validacion("origenLectura",
                    "Los pesos del simulador no se guardan en el sistema de planta. "
                    + "Usa la báscula conectada o el ingreso manual.");
        }
        return origen;
    }

    /**
     * Producto que deja una salida, en la unidad de la producción. Si la
     * unidad es kg, el neto ya lo dice y no hace falta escribirlo; en
     * cualquier otra (clavos, pies…) el operario tiene que contarlo.
     */
    private static BigDecimal cantidadProducida(Produccion produccion, BigDecimal cantidad, BigDecimal neto) {
        if (cantidad != null) return cantidad.setScale(2, RoundingMode.HALF_UP);
        if ("kg".equalsIgnoreCase(produccion.getUnidad().getCodigo())) return neto.setScale(2, RoundingMode.HALF_UP);
        throw ApiExcepcion.validacion("cantidad", "Indica cuánto producto dejó esta salida ("
                + produccion.getUnidad().getNombre().toLowerCase() + ", " + produccion.getUnidad().getCodigo() + ")");
    }

    /** La celda no resuelve centésimas: el peso se guarda con un decimal. */
    private static BigDecimal unDecimal(Double kg) {
        return BigDecimal.valueOf(kg).setScale(1, RoundingMode.HALF_UP);
    }
}
