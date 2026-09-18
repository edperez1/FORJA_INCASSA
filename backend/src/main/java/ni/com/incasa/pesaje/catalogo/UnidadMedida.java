package ni.com.incasa.pesaje.catalogo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

/**
 * Unidad en que se mide la CANTIDAD a producir (kg, pie, und…). No es la
 * unidad del peso: el peso es siempre kg.
 */
@Entity
@Table(name = "unidad_medida")
public class UnidadMedida extends ElementoCatalogo {

    @Column(nullable = false, length = 10)
    private String codigo;

    @Override
    public String getCodigo()     { return codigo; }
    public void setCodigo(String v) { this.codigo = v; }
}
