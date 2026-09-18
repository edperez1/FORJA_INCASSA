package ni.com.incasa.pesaje.usuario;

import jakarta.validation.Valid;
import ni.com.incasa.pesaje.auth.SesionActual;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 6 · CUENTAS — espejo del bloque «6 · CUENTAS» de js/api.js.
 *
 *   Perfil propio (cualquier sesión)
 *     GET /api/usuarios/me            → { usuario }
 *     PUT /api/usuarios/me            → { usuario }   nombres, apellidos, correo
 *     PUT /api/usuarios/me/clave      → 204
 *
 *   Gestión (propietario y administradores)
 *     GET  /api/usuarios              → [ usuario ]
 *     GET  /api/usuarios/roles        → [ { codigo, nombre } ]  los que puedo asignar
 *     POST /api/usuarios              → 201 usuario
 *     PUT  /api/usuarios/{id}         → usuario        nombres, apellidos, correo, rol, activo
 *     PUT  /api/usuarios/{id}/clave   → 204            restablecer
 */
@RestController
@RequestMapping("/api/usuarios")
public class UsuarioController {

    public record RolDto(String codigo, String nombre) { }

    private final CuentaServicio cuentas;

    public UsuarioController(CuentaServicio cuentas) {
        this.cuentas = cuentas;
    }

    /* ---- Perfil propio ---- */

    @GetMapping("/me")
    public Map<String, UsuarioDto> miPerfil(SesionActual sesion) {
        return Map.of("usuario", sesion.dto());
    }

    @PutMapping("/me")
    public Map<String, UsuarioDto> guardarPerfil(SesionActual sesion,
                                                 @Valid @RequestBody Peticiones.Perfil p) {
        return Map.of("usuario", cuentas.actualizarPerfil(sesion, p));
    }

    @PutMapping("/me/clave")
    public ResponseEntity<Void> cambiarClave(SesionActual sesion,
                                             @Valid @RequestBody Peticiones.CambioClave p) {
        cuentas.cambiarClave(sesion, p);
        return ResponseEntity.noContent().build();
    }

    /* ---- Gestión ---- */

    @GetMapping
    public List<UsuarioDto> listar(SesionActual sesion) {
        return cuentas.listar(sesion);
    }

    @GetMapping("/roles")
    public List<RolDto> roles(SesionActual sesion) {
        sesion.exigir(Permiso.GESTIONAR_USUARIOS);
        return cuentas.rolesAsignables(sesion).stream()
                .map(r -> new RolDto(r.name(), r.nombre())).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UsuarioDto crear(SesionActual sesion, @Valid @RequestBody Peticiones.Alta p) {
        return cuentas.crear(sesion, p);
    }

    @PutMapping("/{id}")
    public UsuarioDto editar(SesionActual sesion, @PathVariable Long id,
                             @Valid @RequestBody Peticiones.Edicion p) {
        return cuentas.editar(sesion, id, p);
    }

    @PutMapping("/{id}/clave")
    public ResponseEntity<Void> restablecerClave(SesionActual sesion, @PathVariable Long id,
                                                 @Valid @RequestBody Peticiones.RestablecerClave p) {
        cuentas.restablecerClave(sesion, id, p);
        return ResponseEntity.noContent().build();
    }
}
