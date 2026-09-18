package ni.com.incasa.pesaje.auth;

import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 1 · AUTENTICACIÓN — espejo del bloque «1 · AUTENTICACIÓN» de js/api.js.
 *
 *   GET  /api/auth/estado         → { requiereConfiguracion }   sin token
 *   POST /api/auth/configuracion  → 201 { token, expiraEn, usuario }  sólo la 1.ª vez
 *   POST /api/auth/login          → { token, expiraEn, usuario }
 *   POST /api/auth/logout         → 204
 *
 * No hay registro público: las cuentas las crean el propietario y los
 * administradores desde POST /api/usuarios.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthServicio auth;
    private final SesionServicio sesiones;

    public AuthController(AuthServicio auth, SesionServicio sesiones) {
        this.auth = auth;
        this.sesiones = sesiones;
    }

    @GetMapping("/estado")
    public Map<String, Object> estado() {
        return Map.of("requiereConfiguracion", auth.requiereConfiguracion());
    }

    @PostMapping("/configuracion")
    @ResponseStatus(HttpStatus.CREATED)
    public SesionRespuesta configuracion(@Valid @RequestBody ConfiguracionPeticion peticion) {
        return auth.configurar(peticion);
    }

    @PostMapping("/login")
    public SesionRespuesta login(@Valid @RequestBody LoginPeticion peticion) {
        return auth.autenticar(peticion);
    }

    /** Idempotente: cerrar una sesión que ya no existe también es 204. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String cabecera) {
        sesiones.cerrar(SesionServicio.tokenDe(cabecera));
        return ResponseEntity.noContent().build();
    }
}
