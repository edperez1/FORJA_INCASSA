package ni.com.incasa.pesaje.auth;

import jakarta.validation.constraints.NotBlank;

/** Cuerpo de POST /api/auth/login */
public record LoginPeticion(
        @NotBlank(message = "Indica tu usuario")     String usuario,
        @NotBlank(message = "Indica tu contraseña")  String clave
) { }
