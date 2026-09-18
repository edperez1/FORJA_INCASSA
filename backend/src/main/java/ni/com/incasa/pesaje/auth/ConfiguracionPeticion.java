package ni.com.incasa.pesaje.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Cuerpo de POST /api/auth/configuracion: la cuenta del PROPIETARIO, la
 * primera del sistema. Sólo se acepta mientras no exista ninguna y exige el
 * código de instalación (variable INCASA_CODIGO_INSTALACION), para que quien
 * llegue primero a la red no pueda quedarse con el sistema.
 */
public record ConfiguracionPeticion(
        @NotBlank(message = "Indica el usuario")
        @Pattern(regexp = "^[\\w.-]{3,40}$",
                 message = "Usuario inválido: de 3 a 40 letras, números, punto o guion") String usuario,
        @NotBlank(message = "Indica los nombres")
        @Size(max = 80, message = "Los nombres admiten 80 caracteres")     String nombres,
        @NotBlank(message = "Indica los apellidos")
        @Size(max = 80, message = "Los apellidos admiten 80 caracteres")   String apellidos,
        @Email(message = "Correo no válido")
        @Size(max = 160, message = "El correo admite 160 caracteres")      String correo,
        @NotBlank(message = "Indica la contraseña")
        @Size(min = 8, max = 72, message = "La contraseña debe tener entre 8 y 72 caracteres") String clave,
        @NotBlank(message = "Indica el código de instalación")             String codigoInstalacion
) { }
