package ni.com.incasa.pesaje.catalogo;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** Lo que viaja entre el frontend y los catálogos. */
public final class CatalogoDtos {

    private CatalogoDtos() { }

    /** Un área, producto, materia o unidad. `codigo` sólo en las unidades. */
    public record Elemento(Long id, String nombre, String codigo, String observaciones, boolean activo) {
        static Elemento de(ElementoCatalogo e) {
            return new Elemento(e.getId(), e.getNombre(), e.getCodigo(), e.getObservaciones(), e.isActivo());
        }
    }

    public record BasculaDto(Long id, String codigo, String marca, String modelo, String modeloCompleto,
                             double capacidadKg, double divisionKg, Long areaId, String area) {
        static BasculaDto de(Bascula b) {
            return new BasculaDto(b.getId(), b.getCodigo(), b.getMarca(), b.getModelo(), b.modeloCompleto(),
                    b.getCapacidadKg().doubleValue(), b.getDivisionKg().doubleValue(),
                    b.getArea() == null ? null : b.getArea().getId(),
                    b.getArea() == null ? null : b.getArea().getNombre());
        }
    }

    /** GET /api/catalogos: todo lo que necesitan los formularios, en una llamada. */
    public record Todos(List<Elemento> areas, List<Elemento> productos, List<Elemento> materias,
                        List<Elemento> unidades, BasculaDto bascula) { }

    /** POST /api/catalogos/{tipo} y PUT /api/catalogos/{tipo}/{id} */
    public record ElementoPeticion(
            @NotBlank(message = "Indica el nombre")
            @Size(max = 80, message = "El nombre admite 80 caracteres")          String nombre,
            @Size(max = 10, message = "El código admite 10 caracteres")          String codigo,
            @Size(max = 300, message = "Las observaciones admiten 300 caracteres") String observaciones,
            Boolean activo
    ) { }

    /** PUT /api/catalogos/bascula · el código no cambia: identifica al equipo. */
    public record BasculaPeticion(
            @NotBlank(message = "Indica la marca")
            @Size(max = 60, message = "La marca admite 60 caracteres")   String marca,
            @NotBlank(message = "Indica el modelo")
            @Size(max = 60, message = "El modelo admite 60 caracteres")  String modelo,
            @NotNull(message = "Indica la capacidad")
            @DecimalMin(value = "1", message = "La capacidad debe ser mayor que cero")
            @DecimalMax(value = "999999", message = "Capacidad fuera de rango")  BigDecimal capacidadKg,
            @NotNull(message = "Indica la división de escala")
            @DecimalMin(value = "0.01", message = "La división debe ser mayor que cero")
            @DecimalMax(value = "99", message = "División fuera de rango")        BigDecimal divisionKg,
            Long areaId
    ) { }
}
