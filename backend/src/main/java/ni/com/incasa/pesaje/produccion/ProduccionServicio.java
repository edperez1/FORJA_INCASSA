package ni.com.incasa.pesaje.produccion;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.catalogo.CatalogoServicio;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import ni.com.incasa.pesaje.comun.Texto;
import ni.com.incasa.pesaje.pesaje.PesajeRepositorio;
import ni.com.incasa.pesaje.pesaje.TipoPesaje;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import ni.com.incasa.pesaje.usuario.Usuario;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Reglas del ciclo de vida de una producción.
 *
 *   abrir      ABRIR_PRODUCCION     → PROCESO
 *   terminar   TERMINAR_PRODUCCION  PROCESO → TERMINADO, con al menos una entrada y una
 *                                   salida y la merma dentro de la tolerancia (o forzado
 *                                   por alguien con CORREGIR, justificándolo)
 *   automático al guardar una SALIDA que alcanza la cantidad pedida (ver evaluarCierre)
 *   corregir   CORREGIR             datos de identificación, en PROCESO o TERMINADO
 *   anular     CORREGIR             → ANULADA, sólo sin pesajes vigentes
 */
@Service
public class ProduccionServicio {

    private final ProduccionRepositorio producciones;
    private final PesajeRepositorio pesajes;
    private final CatalogoServicio catalogos;
    private final Totales totales;
    private final Tolerancia tolerancia;
    private final Auditor auditor;

    public ProduccionServicio(ProduccionRepositorio producciones, PesajeRepositorio pesajes,
                              CatalogoServicio catalogos, Totales totales, Tolerancia tolerancia,
                              Auditor auditor) {
        this.producciones = producciones;
        this.pesajes = pesajes;
        this.catalogos = catalogos;
        this.totales = totales;
        this.tolerancia = tolerancia;
        this.auditor = auditor;
    }

    private ProduccionDto dto(Produccion p) {
        return ProduccionDto.de(p, totales.de(p.getId()), tolerancia);
    }

    /* ====================================================================
     *  Consulta
     * ==================================================================*/

    @Transactional(readOnly = true)
    public ProduccionDto obtener(Long id) {
        Produccion p = cargar(id);
        return dto(p);
    }

    /**
     * La producción, bloqueada hasta el final de la transacción del llamador.
     * La usa el alta de pesajes: exige que exista y que siga en proceso.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Produccion abiertaParaPesar(Long id) {
        if (id == null) throw ApiExcepcion.validacion("produccionId", "Elige la producción");
        Produccion p = producciones.bloquear(id)
                .orElseThrow(() -> ApiExcepcion.validacion("produccionId", "La producción no existe"));
        if (!p.enProceso()) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "PRODUCCION_CERRADA",
                    "La producción " + p.getCodigo() + " está " + nombre(p.getEstado()) + ": ya no admite pesajes");
        }
        return p;
    }

    /* ====================================================================
     *  Abrir
     * ==================================================================*/

    @Transactional
    public ProduccionDto abrir(SesionActual s, ProduccionPeticiones.Datos d) {
        s.exigir(Permiso.ABRIR_PRODUCCION);

        Produccion p = new Produccion(
                "PR-" + String.format("%06d", producciones.siguienteCodigo()), s.usuario());
        aplicar(p, d);
        producciones.save(p);

        return ProduccionDto.de(p, Totales.DeProduccion.VACIO, tolerancia);
    }

    /* ====================================================================
     *  Corregir
     * ==================================================================*/

    @Transactional
    public ProduccionDto corregir(SesionActual s, Long id, ProduccionPeticiones.Datos d) {
        s.exigir(Permiso.CORREGIR);
        Produccion p = cargar(id);

        aplicar(p, d);
        p.marcarModificado(s.usuario());
        auditor.anotar(s.usuario(), "EDICION_PRODUCCION", "produccion", id, p.getCodigo());
        return dto(p);
    }

    /* ====================================================================
     *  Terminar
     * ==================================================================*/

    @Transactional
    public ProduccionDto terminar(SesionActual s, Long id, ProduccionPeticiones.Terminar t) {
        s.exigir(Permiso.TERMINAR_PRODUCCION);
        producciones.bloquear(id);
        Produccion p = cargar(id);

        if (!p.enProceso()) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "PRODUCCION_CERRADA",
                    "La producción " + p.getCodigo() + " ya está " + nombre(p.getEstado()));
        }
        if (pesajes.countByProduccionIdAndTipoAndAnuladoEnIsNull(id, TipoPesaje.ENTRADA) == 0) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "FALTA_ENTRADA",
                    "Antes de terminar, pesa la bobina de entrada");
        }
        if (pesajes.countByProduccionIdAndTipoAndAnuladoEnIsNull(id, TipoPesaje.SALIDA) == 0) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "FALTA_SALIDA",
                    "Antes de terminar, pesa lo producido (pesaje de salida)");
        }

        String nota = Texto.opcional(t == null ? null : t.observaciones());

        /* --- Merma: dentro de la tolerancia, o forzada con justificación --- */
        Totales.DeProduccion tot = totales.de(id);
        double merma = Tolerancia.mermaPct(tot.kgEntrada(), tot.kgSalida());
        boolean forzada = false;
        if (!tolerancia.dentro(merma)) {
            if (t == null || !Boolean.TRUE.equals(t.forzar())) {
                throw new ApiExcepcion(HttpStatus.CONFLICT, "MERMA_FUERA_DE_TOLERANCIA",
                        "La merma es de " + pct(merma) + " % y la máxima admitida es " + pct(tolerancia.mermaMaximaPct())
                        + " %. Revisa los pesajes o pide a un supervisor que cierre la producción justificándolo.");
            }
            s.exigir(Permiso.CORREGIR);
            if (nota == null) {
                throw ApiExcepcion.validacion("observaciones",
                        "Explica por qué se cierra con " + pct(merma) + " % de merma");
            }
            forzada = true;
        }

        if (nota != null) {
            p.setObservaciones(unir(p.getObservaciones(),
                    (forzada ? "Cierre fuera de tolerancia (" + pct(merma) + " % de merma): " : "Cierre: ") + nota));
        }

        p.terminar(s.usuario());
        auditor.anotar(s.usuario(), forzada ? "TERMINAR_FUERA_TOLERANCIA" : "TERMINAR_PRODUCCION",
                "produccion", id, p.getCodigo() + (forzada ? " · merma " + pct(merma) + " % · " + nota : ""));
        return dto(p);
    }

    /* ====================================================================
     *  Reglas de peso de una producción
     * ==================================================================*/

    /**
     * Antes de guardar una SALIDA: tiene que haber entrada, y la salida
     * acumulada no puede pesar más que la bobina que entró.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void validarSalida(Produccion p, BigDecimal neto) {
        Totales.DeProduccion t = totales.de(p.getId());
        if (t.entradas() == 0) {
            throw ApiExcepcion.validacion("tipo", "Pesa primero la bobina de entrada de " + p.getCodigo());
        }
        double tras = t.kgSalida() + neto.doubleValue();
        if (tras > t.kgEntrada() + 0.001) {
            throw ApiExcepcion.validacion("pesoBruto", "La salida no puede pesar más que la entrada: con este pesaje "
                    + "saldrían " + kg(tras) + " kg de " + kg(t.kgEntrada()) + " kg que entraron (quedan "
                    + kg(Math.max(0, t.kgEntrada() - t.kgSalida())) + " kg).");
        }
    }

    /**
     * Antes de anular una ENTRADA: sin ella, la salida ya registrada no puede
     * quedar pesando más que lo que entró.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void validarAnulacionEntrada(Long produccionId, BigDecimal neto) {
        Totales.DeProduccion t = totales.de(produccionId);
        if (t.kgEntrada() - neto.doubleValue() < t.kgSalida() - 0.001) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "SALIDA_SUPERA_ENTRADA",
                    "No se puede anular esta entrada: la salida registrada (" + kg(t.kgSalida())
                    + " kg) quedaría pesando más que lo que entró. Anula primero las salidas.");
        }
    }

    /**
     * Tras guardar una SALIDA: si lo producido ya alcanzó lo pedido, la
     * producción se cierra sola, siempre que la merma esté en tolerancia. Si
     * se pasó de lo pedido, el exceso queda anotado en la producción y en la
     * auditoría, y vuelve en la respuesta para avisar al operario.
     *
     * @return null si todavía no se alcanzó la cantidad
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Cierre evaluarCierre(Produccion p, Usuario quien) {
        Totales.DeProduccion t = totales.de(p.getId());
        double pedida = p.getCantidad().doubleValue();
        if (t.cantidadProducida() + 0.001 < pedida) return null;

        String unidad = p.getUnidad().getCodigo();
        double exceso = Math.round((t.cantidadProducida() - pedida) * 100.0) / 100.0;
        double merma = Tolerancia.mermaPct(t.kgEntrada(), t.kgSalida());

        if (!tolerancia.dentro(merma)) {
            return new Cierre(true, false, exceso, unidad, redondear2(merma),
                    "Se alcanzó la cantidad pedida, pero la merma (" + pct(merma) + " %) supera el "
                    + pct(tolerancia.mermaMaximaPct()) + " % admitido: la producción sigue abierta. "
                    + "Revisa los pesajes o pide a un supervisor que la cierre.");
        }

        String nota = "Terminada automáticamente al alcanzar " + cant(pedida) + " " + unidad
                + (exceso > 0 ? " · exceso de " + cant(exceso) + " " + unidad : "");
        p.setObservaciones(unir(p.getObservaciones(), nota));
        p.terminar(quien);
        auditor.anotar(quien, "TERMINAR_AUTOMATICA", "produccion", p.getId(), p.getCodigo() + " · " + nota);

        return new Cierre(true, true, exceso, unidad, redondear2(merma),
                "La producción " + p.getCodigo() + " se terminó al alcanzar " + cant(pedida) + " " + unidad
                + (exceso > 0 ? ", con " + cant(exceso) + " " + unidad + " de exceso." : "."));
    }

    private static String kg(double v)   { return String.format(java.util.Locale.ROOT, "%.1f", v); }
    private static String pct(double v)  { return String.format(java.util.Locale.ROOT, "%.1f", v); }
    private static double redondear2(double v) { return Math.round(v * 100.0) / 100.0; }
    private static String cant(double v) {
        return v == Math.rint(v) ? String.format(java.util.Locale.ROOT, "%,.0f", v)
                                 : String.format(java.util.Locale.ROOT, "%,.2f", v);
    }

    /* ====================================================================
     *  Anular
     * ==================================================================*/

    @Transactional
    public void anular(SesionActual s, Long id, ProduccionPeticiones.Anular a) {
        s.exigir(Permiso.CORREGIR);
        producciones.bloquear(id);
        Produccion p = cargar(id);

        long vigentes = pesajes.countByProduccionIdAndAnuladoEnIsNull(id);
        if (vigentes > 0) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "PRODUCCION_CON_PESAJES",
                    "La producción tiene " + vigentes + (vigentes == 1 ? " pesaje vigente" : " pesajes vigentes")
                    + ". Anúlalos primero desde el historial.");
        }
        String motivo = Texto.obligatorio("motivo", a == null ? null : a.motivo(),
                "Indica el motivo de la anulación");

        p.anular(s.usuario(), motivo);
        auditor.anotar(s.usuario(), "ANULAR_PRODUCCION", "produccion", id, p.getCodigo() + " · " + motivo);
    }

    /* ====================================================================
     *  Apoyo
     * ==================================================================*/

    /** Una producción que no esté anulada, con sus catálogos. */
    private Produccion cargar(Long id) {
        Produccion p = producciones.conCatalogos(id)
                .orElseThrow(() -> ApiExcepcion.noEncontrado("La producción"));
        if (p.getEstado() == EstadoProduccion.ANULADA) throw ApiExcepcion.noEncontrado("La producción");
        return p;
    }

    /**
     * Copia los datos a la producción. Un elemento de catálogo que no cambia
     * se conserva aunque lo hayan desactivado después: corregir una
     * observación no debe obligar a cambiar de producto.
     */
    private void aplicar(Produccion p, ProduccionPeticiones.Datos d) {
        p.setOrdenTrabajo(Texto.opcional(d.ordenTrabajo()));
        if (!mismo(p.getProducto(), d.productoId()))
            p.setProducto(catalogos.productoActivo("productoId", d.productoId()));
        if (!mismo(p.getMateria(), d.materiaId()))
            p.setMateria(catalogos.materiaActiva("materiaId", d.materiaId()));
        if (!mismo(p.getUnidad(), d.unidadId()))
            p.setUnidad(catalogos.unidadActiva("unidadId", d.unidadId()));
        if (!mismo(p.getAreaProceso(), d.areaProcesoId()))
            p.setAreaProceso(catalogos.areaActiva("areaProcesoId", d.areaProcesoId()));
        if (!mismo(p.getAreaDestino(), d.areaDestinoId()))
            p.setAreaDestino(catalogos.areaActiva("areaDestinoId", d.areaDestinoId()));
        p.setCantidad(d.cantidad().setScale(2, RoundingMode.HALF_UP));
        p.setObservaciones(Texto.opcional(d.observaciones()));
    }

    private static boolean mismo(ni.com.incasa.pesaje.catalogo.ElementoCatalogo actual, Long id) {
        return actual != null && actual.getId().equals(id);
    }

    private static String unir(String previo, String nuevo) {
        String r = previo == null ? nuevo : previo + " · " + nuevo;
        return r.length() <= 500 ? r : r.substring(0, 500);
    }

    private static String nombre(EstadoProduccion e) {
        return switch (e) {
            case PROCESO -> "en proceso";
            case TERMINADO -> "terminada";
            case ANULADA -> "anulada";
        };
    }
}
