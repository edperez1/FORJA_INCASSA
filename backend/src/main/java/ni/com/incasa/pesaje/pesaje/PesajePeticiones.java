package ni.com.incasa.pesaje.pesaje;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/** Cuerpos de las peticiones de pesaje. */
public final class PesajePeticiones {

    private PesajePeticiones() { }

    /**
     * POST /api/pesajes.
     *
     * `cantidad` es el producto obtenido en una SALIDA, en la unidad de medida
     * de la producción. Si esa unidad es kg y no se envía, vale el neto.
     *
     * No lleva operario, neto, báscula ni hora: el servidor es la fuente de
     * verdad de los cuatro (sesión, bruto − tara, báscula activa y su reloj).
     * Si el frontend los envía, Jackson los descarta porque no están aquí.
     */
    public record Alta(
            @NotNull(message = "Elige la producción")               Long produccionId,
            @NotBlank(message = "Indica si es entrada o salida")    String tipo,
            @Size(max = 40, message = "El código de bobina admite 40 caracteres") String codigoBobina,
            @NotNull(message = "Falta el peso bruto")               Double pesoBruto,
            @NotNull(message = "Falta la tara")                     Double tara,
            @DecimalMin(value = "0.01", message = "La cantidad producida debe ser mayor que cero")
            @DecimalMax(value = "9999999999", message = "Cantidad fuera de rango")  BigDecimal cantidad,
            String unidad,
            Boolean estable,
            String origenLectura,
            @Size(max = 500, message = "Las observaciones admiten 500 caracteres") String observaciones
    ) { }

    /**
     * PUT /api/pesajes/{id}. Deliberadamente sin pesos ni tipo: la lectura
     * certificada no se toca. Los campos ausentes (null) no cambian.
     * `cantidad` sólo vale en pesajes de SALIDA.
     */
    public record Correccion(
            @Size(max = 40, message = "El código de bobina admite 40 caracteres") String codigoBobina,
            @DecimalMin(value = "0.01", message = "La cantidad producida debe ser mayor que cero")
            @DecimalMax(value = "9999999999", message = "Cantidad fuera de rango")  BigDecimal cantidad,
            @Size(max = 500, message = "Las observaciones admiten 500 caracteres") String observaciones
    ) { }
}
