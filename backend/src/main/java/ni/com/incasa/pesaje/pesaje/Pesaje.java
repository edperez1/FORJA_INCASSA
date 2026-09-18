package ni.com.incasa.pesaje.pesaje;

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
import ni.com.incasa.pesaje.catalogo.Bascula;
import ni.com.incasa.pesaje.produccion.Produccion;
import ni.com.incasa.pesaje.usuario.Usuario;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Una pesada certificada dentro de una producción, y el respaldo de su
 * Certificado de Pesaje.
 *
 * REGLA DE ORO — el peso no se edita nunca. Bruto, tara y neto se fijan al
 * crearlo y no tienen setter. Si un peso está mal, se anula y se vuelve a pesar.
 * Lo único corregible es el código de bobina, la cantidad producida y las
 * observaciones.
 */
@Entity
@Table(name = "pesaje")
public class Pesaje {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 12, updatable = false)
    private String folio;                  // CP-000001

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "produccion_id", updatable = false)
    private Produccion produccion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8, updatable = false)
    private TipoPesaje tipo;

    @Column(name = "codigo_bobina", length = 40)
    private String codigoBobina;

    @Column(name = "peso_bruto", nullable = false, precision = 7, scale = 1, updatable = false)
    private BigDecimal pesoBruto;

    @Column(nullable = false, precision = 7, scale = 1, updatable = false)
    private BigDecimal tara;

    @Column(name = "peso_neto", nullable = false, precision = 7, scale = 1, updatable = false)
    private BigDecimal pesoNeto;

    @Column(nullable = false, length = 4, updatable = false)
    private String unidad = "kg";

    @Column(nullable = false, updatable = false)
    private boolean estable;

    @Column(name = "origen_lectura", nullable = false, length = 20, updatable = false)
    private String origenLectura;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "bascula_id", updatable = false)
    private Bascula bascula;

    @Column(name = "operario_id", nullable = false, updatable = false)
    private Long operarioId;

    @Column(nullable = false, length = 170, updatable = false)
    private String operario;

    @Column(name = "capturado_en", nullable = false, updatable = false)
    private Instant capturadoEn;

    @Column(name = "creado_en", nullable = false, updatable = false)
    private Instant creadoEn;

    /** Sólo en SALIDA: producto obtenido, en la unidad de medida de la producción. */
    @Column(precision = 12, scale = 2)
    private BigDecimal cantidad;

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

    protected Pesaje() { }

    Pesaje(String folio, Produccion produccion, TipoPesaje tipo, Bascula bascula, Usuario operario,
           BigDecimal bruto, BigDecimal tara, boolean estable, String origenLectura) {
        Instant ahora = Instant.now();
        this.folio = folio;
        this.produccion = produccion;
        this.tipo = tipo;
        this.bascula = bascula;
        this.operarioId = operario.getId();
        this.operario = operario.nombreCompleto();
        this.pesoBruto = bruto;
        this.tara = tara;
        this.pesoNeto = bruto.subtract(tara);   // nunca se copia del cliente
        this.estable = estable;
        this.origenLectura = origenLectura;
        this.capturadoEn = ahora;
        this.creadoEn = ahora;
    }

    void anular(Usuario quien, String motivo) {
        this.anuladoEn = Instant.now();
        this.anuladoPor = quien.getUsuario();
        this.motivoAnulacion = motivo;
    }

    void marcarModificado(Usuario quien) {
        this.modificadoEn = Instant.now();
        this.modificadoPor = quien.getUsuario();
    }

    public Long getId()                { return id; }
    public String getFolio()           { return folio; }
    public Produccion getProduccion()  { return produccion; }
    public TipoPesaje getTipo()        { return tipo; }
    public String getCodigoBobina()    { return codigoBobina; }
    public BigDecimal getPesoBruto()   { return pesoBruto; }
    public BigDecimal getTara()        { return tara; }
    public BigDecimal getPesoNeto()    { return pesoNeto; }
    public String getUnidad()          { return unidad; }
    public boolean isEstable()         { return estable; }
    public String getOrigenLectura()   { return origenLectura; }
    public Bascula getBascula()        { return bascula; }
    public Long getOperarioId()        { return operarioId; }
    public String getOperario()        { return operario; }
    public Instant getCapturadoEn()    { return capturadoEn; }
    public Instant getCreadoEn()       { return creadoEn; }
    public BigDecimal getCantidad()    { return cantidad; }
    public String getObservaciones()   { return observaciones; }
    public Instant getModificadoEn()   { return modificadoEn; }
    public String getModificadoPor()   { return modificadoPor; }
    public Instant getAnuladoEn()      { return anuladoEn; }
    public String getAnuladoPor()      { return anuladoPor; }
    public String getMotivoAnulacion() { return motivoAnulacion; }

    void setCodigoBobina(String v)     { this.codigoBobina = v; }
    void setCantidad(BigDecimal v)     { this.cantidad = v; }
    void setObservaciones(String v)    { this.observaciones = v; }
}
