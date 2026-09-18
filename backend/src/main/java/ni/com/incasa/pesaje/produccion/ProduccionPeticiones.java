package ni.com.incasa.pesaje.produccion;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Cuerpos de las peticiones de producción. */
public final class ProduccionPeticiones {

    private ProduccionPeticiones() { }

    /**
     * POST /api/producciones (abrir) y PUT /api/producciones/{id} (corregir).
     * Las observaciones son opcionales: se escriben si hay algo que contar.
     */
    public record Datos(
            @Size(max = 40, message = "La orden de trabajo admite 40 caracteres")   String ordenTrabajo,
            @NotNull(message = "Elige el producto")                                 Long productoId,
            @NotNull(message = "Elige la materia")                                  Long materiaId,
            @NotNull(message = "Indica la cantidad a producir")
            @DecimalMin(value = "0.01", message = "La cantidad debe ser mayor que cero")
            @DecimalMax(value = "9999999999", message = "Cantidad fuera de rango")  BigDecimal cantidad,
            @NotNull(message = "Elige la unidad de medida")                         Long unidadId,
            @NotNull(message = "Elige el área de proceso")                          Long areaProcesoId,
            @NotNull(message = "Elige el área de destino")                          Long areaDestinoId,
            @Size(max = 500, message = "Las observaciones admiten 500 caracteres")  String observaciones
    ) { }

    /**
     * POST /api/producciones/{id}/terminar · la nota de cierre es opcional.
     *
     * `forzar` = true cierra aunque la merma supere la tolerancia. Exige el
     * permiso CORREGIR y que `observaciones` explique por qué.
     */
    public record Terminar(
            @Size(max = 300, message = "La nota de cierre admite 300 caracteres") String observaciones,
            Boolean forzar
    ) { }

    /** POST /api/producciones/{id}/anular · el motivo es obligatorio para auditoría. */
    public record Anular(
            @Size(max = 300, message = "El motivo admite 300 caracteres") String motivo
    ) { }
}
