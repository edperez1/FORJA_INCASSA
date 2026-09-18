package ni.com.incasa.pesaje.usuario;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;

/**
 * 6 · ROLES Y PERMISOS — sólo el propietario (GESTIONAR_PERMISOS).
 *
 *   GET /api/permisos          → { permisos: [ … ], roles: [ … ] }
 *   PUT /api/permisos/{rol}    { permisos: ["PESAR", …] } → rol actualizado
 */
@RestController
@RequestMapping("/api/permisos")
public class PermisoController {

    public record PermisoDto(String codigo, String nombre, String descripcion, boolean fijo) { }

    /** `editable` = false para el propietario: tiene todo, siempre. */
    public record RolDto(String codigo, String nombre, boolean editable, List<String> permisos) { }

    public record Matriz(List<PermisoDto> permisos, List<RolDto> roles) { }

    public record Asignacion(@NotNull(message = "Indica los permisos") List<String> permisos) { }

    private final Permisos permisos;
    private final JdbcTemplate jdbc;

    public PermisoController(Permisos permisos, JdbcTemplate jdbc) {
        this.permisos = permisos;
        this.jdbc = jdbc;
    }

    @GetMapping
    public Matriz matriz(SesionActual sesion) {
        sesion.exigir(Permiso.GESTIONAR_PERMISOS);
        List<PermisoDto> catalogo = jdbc.query(
                "SELECT codigo, nombre, descripcion, fijo FROM permiso ORDER BY orden",
                (f, i) -> new PermisoDto(f.getString(1), f.getString(2), f.getString(3), f.getBoolean(4)));
        List<RolDto> roles = Arrays.stream(Rol.values()).map(this::rol).toList();
        return new Matriz(catalogo, roles);
    }

    @PutMapping("/{rol}")
    public RolDto asignar(SesionActual sesion, @PathVariable String rol, @Valid @RequestBody Asignacion a) {
        sesion.exigir(Permiso.GESTIONAR_PERMISOS);
        Rol r = Rol.desde(rol);
        if (r == null) throw ApiExcepcion.noEncontrado("El rol «" + rol + "»");
        permisos.asignar(sesion.usuario(), r, a.permisos());
        return new RolDto(r.name(), r.nombre(), true,
                a.permisos().stream().distinct().sorted().toList());
    }

    private RolDto rol(Rol r) {
        return new RolDto(r.name(), r.nombre(), r != Rol.PROPIETARIO,
                permisos.de(r).stream().map(Enum::name).sorted().toList());
    }
}
