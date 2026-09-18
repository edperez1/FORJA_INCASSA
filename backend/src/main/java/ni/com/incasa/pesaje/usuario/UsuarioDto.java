package ni.com.incasa.pesaje.usuario;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * El usuario tal como viaja al frontend. Nunca lleva la clave.
 *
 * `nombre` es el nombre completo (nombres + apellidos), el que pintan la
 * cabecera y los certificados. `rolNombre` es el texto legible del rol.
 * `permisos` decide qué menús y botones ve: el backend los vuelve a exigir.
 * `ingreso` es el inicio de la sesión actual (sólo en /me y en el login).
 */
public record UsuarioDto(
        Long id,
        String usuario,
        String nombres,
        String apellidos,
        String nombre,
        String correo,
        String rol,
        String rolNombre,
        List<String> permisos,
        boolean activo,
        Instant creadoEn,
        Instant ultimoIngreso,
        String unidad,
        Instant ingreso
) {
    public static UsuarioDto de(Usuario u, Set<Permiso> permisos, Instant ingreso) {
        return new UsuarioDto(
                u.getId(), u.getUsuario(), u.getNombres(), u.getApellidos(), u.nombreCompleto(),
                u.getCorreo(), u.getRol().name(), u.getRol().nombre(),
                permisos.stream().map(Enum::name).sorted().toList(),
                u.isActivo(), u.getCreadoEn(), u.getUltimoIngreso(), "kg", ingreso);
    }

    public static UsuarioDto de(Usuario u, Set<Permiso> permisos) {
        return de(u, permisos, null);
    }
}
