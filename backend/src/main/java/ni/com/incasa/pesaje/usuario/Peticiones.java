package ni.com.incasa.pesaje.usuario;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Cuerpos de las peticiones de cuentas. */
public final class Peticiones {

    private Peticiones() { }

    static final String PATRON_USUARIO = "^[\\w.-]{3,40}$";
    static final String MSJ_USUARIO = "Usuario inválido: de 3 a 40 letras, números, punto o guion";

    /** PUT /api/usuarios/me · el propio usuario. Ni rol ni usuario: eso lo decide otro. */
    public record Perfil(
            @NotBlank(message = "Indica los nombres")
            @Size(max = 80, message = "Los nombres admiten 80 caracteres")     String nombres,
            @NotBlank(message = "Indica los apellidos")
            @Size(max = 80, message = "Los apellidos admiten 80 caracteres")   String apellidos,
            @Email(message = "Correo no válido")
            @Size(max = 160, message = "El correo admite 160 caracteres")      String correo
    ) { }

    /** PUT /api/usuarios/me/clave */
    public record CambioClave(
            @NotBlank(message = "Indica la contraseña actual")   String claveActual,
            @NotBlank(message = "Indica la contraseña nueva")
            @Size(min = 8, max = 72, message = "La contraseña debe tener entre 8 y 72 caracteres") String claveNueva
    ) { }

    /** POST /api/usuarios · alta por un administrador o el propietario. */
    public record Alta(
            @NotBlank(message = "Indica el usuario")
            @Pattern(regexp = PATRON_USUARIO, message = MSJ_USUARIO)              String usuario,
            @NotBlank(message = "Indica los nombres")
            @Size(max = 80, message = "Los nombres admiten 80 caracteres")     String nombres,
            @NotBlank(message = "Indica los apellidos")
            @Size(max = 80, message = "Los apellidos admiten 80 caracteres")   String apellidos,
            @Email(message = "Correo no válido")
            @Size(max = 160, message = "El correo admite 160 caracteres")      String correo,
            @NotBlank(message = "Elige el rol")                                String rol,
            @NotBlank(message = "Indica la contraseña inicial")
            @Size(min = 8, max = 72, message = "La contraseña debe tener entre 8 y 72 caracteres") String clave
    ) { }

    /** PUT /api/usuarios/{id} · el usuario (login) no se cambia nunca. */
    public record Edicion(
            @NotBlank(message = "Indica los nombres")
            @Size(max = 80, message = "Los nombres admiten 80 caracteres")     String nombres,
            @NotBlank(message = "Indica los apellidos")
            @Size(max = 80, message = "Los apellidos admiten 80 caracteres")   String apellidos,
            @Email(message = "Correo no válido")
            @Size(max = 160, message = "El correo admite 160 caracteres")      String correo,
            @NotBlank(message = "Elige el rol")                                String rol,
            Boolean activo
    ) { }

    /** PUT /api/usuarios/{id}/clave · restablecer la clave de otra persona. */
    public record RestablecerClave(
            @NotBlank(message = "Indica la contraseña nueva")
            @Size(min = 8, max = 72, message = "La contraseña debe tener entre 8 y 72 caracteres") String claveNueva
    ) { }
}
