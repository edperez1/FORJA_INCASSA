package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Column;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

/**
 * Lo común de los catálogos editables: nombre, observaciones y si está activo.
 * Un elemento desactivado deja de ofrecerse en los formularios, pero las
 * producciones antiguas lo siguen mostrando: por eso nunca se borra.
 */
@MappedSuperclass
public abstract class ElementoCatalogo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 80)
    private String nombre;

    @Column(length = 300)
    private String observaciones;

    @Column(nullable = false)
    private boolean activo = true;

    public Long getId()              { return id; }
    public String getNombre()        { return nombre; }
    public String getObservaciones() { return observaciones; }
    public boolean isActivo()        { return activo; }

    public void setNombre(String v)        { this.nombre = v; }
    public void setObservaciones(String v) { this.observaciones = v; }
    public void setActivo(boolean v)       { this.activo = v; }

    /** Sólo las unidades de medida tienen código (kg, pie, und). */
    public String getCodigo() { return null; }
}
