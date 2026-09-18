package ni.com.incasa.pesaje.produccion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import ni.com.incasa.pesaje.catalogo.Area;
import ni.com.incasa.pesaje.catalogo.Materia;
import ni.com.incasa.pesaje.catalogo.Producto;
import ni.com.incasa.pesaje.catalogo.UnidadMedida;
import ni.com.incasa.pesaje.usuario.Usuario;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Una producción: la bobina que entra a un área de proceso para convertirse
 * en un producto que va a un área de destino.
 *
 *    PROCESO → TERMINADO     (lo normal)
 *    PROCESO → ANULADA       (sólo sin pesajes vigentes)
 *
 * Los kg de entrada y de salida no se guardan aquí: se suman de los pesajes
 * vigentes (ver ProduccionConsulta), así la merma siempre cuadra con lo que
 * marcó la báscula.
 */
@Entity
@Table(name = "produccion")
public class Produccion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 12, updatable = false)
    private String codigo;                 // PR-000001

    @Column(name = "orden_trabajo", length = 40)
    private String ordenTrabajo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "producto_id")
    private Producto producto;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "materia_id")
    private Materia materia;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal cantidad;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "unidad_id")
    private UnidadMedida unidad;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_proceso_id")
    private Area areaProceso;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "area_destino_id")
    private Area areaDestino;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private EstadoProduccion estado;

    @Column(name = "inicio_en", nullable = false, updatable = false)
    private Instant inicioEn;

    @Column(name = "fin_en")
    private Instant finEn;

    @Column(name = "abierta_por_id", nullable = false, updatable = false)
    private Long abiertaPorId;

    @Column(name = "abierta_por", nullable = false, length = 170, updatable = false)
    private String abiertaPor;

    @Column(name = "terminada_por_id")
    private Long terminadaPorId;

    @Column(name = "terminada_por", length = 170)
    private String terminadaPor;

    @Column(length = 500)
    private String observaciones;

    @Column(name = "modificado_en")
    private Instant modificadoEn;

    @Column(name = "modificado_por", length = 40)
    private String modificadoPor;

    @Column(name = "anulado_en")
    private Instant anuladoEn;

    @Column(name = "anulado_por", length = 40)
    private String anuladoPor;

    @Column(name = "motivo_anulacion", length = 300)
    private String motivoAnulacion;

    protected Produccion() { }

    Produccion(String codigo, Usuario abrio) {
        this.codigo = codigo;
        this.estado = EstadoProduccion.PROCESO;
        this.inicioEn = Instant.now();
        this.abiertaPorId = abrio.getId();
        this.abiertaPor = abrio.nombreCompleto();
    }

    /* ---- Transiciones de estado: la única forma de cambiarlo ---- */

    void terminar(Usuario quien) {
        this.estado = EstadoProduccion.TERMINADO;
        this.finEn = Instant.now();
        this.terminadaPorId = quien.getId();
        this.terminadaPor = quien.nombreCompleto();
    }

    void anular(Usuario quien, String motivo) {
        this.estado = EstadoProduccion.ANULADA;
        if (this.finEn == null) this.finEn = Instant.now();
        this.anuladoEn = Instant.now();
        this.anuladoPor = quien.getUsuario();
        this.motivoAnulacion = motivo;
    }

    void marcarModificado(Usuario quien) {
        this.modificadoEn = Instant.now();
        this.modificadoPor = quien.getUsuario();
    }

    public boolean enProceso() { return estado == EstadoProduccion.PROCESO; }

    public Long getId()                   { return id; }
    public String getCodigo()             { return codigo; }
    public String getOrdenTrabajo()       { return ordenTrabajo; }
    public Producto getProducto()         { return producto; }
    public Materia getMateria()           { return materia; }
    public BigDecimal getCantidad()       { return cantidad; }
    public UnidadMedida getUnidad()       { return unidad; }
    public Area getAreaProceso()          { return areaProceso; }
    public Area getAreaDestino()          { return areaDestino; }
    public EstadoProduccion getEstado()   { return estado; }
    public Instant getInicioEn()          { return inicioEn; }
    public Instant getFinEn()             { return finEn; }
    public Long getAbiertaPorId()         { return abiertaPorId; }
    public String getAbiertaPor()         { return abiertaPor; }
    public Long getTerminadaPorId()       { return terminadaPorId; }
    public String getTerminadaPor()       { return terminadaPor; }
    public String getObservaciones()      { return observaciones; }
    public Instant getModificadoEn()      { return modificadoEn; }
    public String getModificadoPor()      { return modificadoPor; }
    public Instant getAnuladoEn()         { return anuladoEn; }
    public String getAnuladoPor()         { return anuladoPor; }
    public String getMotivoAnulacion()    { return motivoAnulacion; }

    void setOrdenTrabajo(String v)        { this.ordenTrabajo = v; }
    void setProducto(Producto v)          { this.producto = v; }
    void setMateria(Materia v)            { this.materia = v; }
    void setCantidad(BigDecimal v)        { this.cantidad = v; }
    void setUnidad(UnidadMedida v)        { this.unidad = v; }
    void setAreaProceso(Area v)           { this.areaProceso = v; }
    void setAreaDestino(Area v)           { this.areaDestino = v; }
    void setObservaciones(String v)       { this.observaciones = v; }
}
