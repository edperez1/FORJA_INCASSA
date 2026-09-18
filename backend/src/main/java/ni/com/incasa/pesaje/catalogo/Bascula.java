package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * La báscula de planta. El sistema trabaja con la báscula ACTIVA (hoy una
 * sola): de ella salen la capacidad que se valida al pesar y los datos del
 * equipo que se imprimen en el certificado.
 */
@Entity
@Table(name = "bascula")
public class Bascula {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20, updatable = false)
    private String codigo;

    @Column(nullable = false, length = 60)
    private String marca;

    @Column(nullable = false, length = 60)
    private String modelo;

    @Column(name = "capacidad_kg", nullable = false, precision = 8, scale = 1)
    private BigDecimal capacidadKg;

    @Column(name = "division_kg", nullable = false, precision = 4, scale = 2)
    private BigDecimal divisionKg;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "area_id")
    private Area area;

    @Column(nullable = false)
    private boolean activa;

    protected Bascula() { }

    /** «Hiweight X10»: lo que se muestra en el visor y en el certificado. */
    public String modeloCompleto() {
        return (marca + " " + modelo).trim();
    }

    public Long getId()                { return id; }
    public String getCodigo()          { return codigo; }
    public String getMarca()           { return marca; }
    public String getModelo()          { return modelo; }
    public BigDecimal getCapacidadKg() { return capacidadKg; }
    public BigDecimal getDivisionKg()  { return divisionKg; }
    public Area getArea()              { return area; }
    public boolean isActiva()          { return activa; }

    public void setMarca(String v)            { this.marca = v; }
    public void setModelo(String v)           { this.modelo = v; }
    public void setCapacidadKg(BigDecimal v)  { this.capacidadKg = v; }
    public void setDivisionKg(BigDecimal v)   { this.divisionKg = v; }
    public void setArea(Area v)               { this.area = v; }
}
