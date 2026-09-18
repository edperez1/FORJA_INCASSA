package ni.com.incasa.pesaje.auth;

import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.usuario.Permiso;
import ni.com.incasa.pesaje.usuario.Usuario;
import ni.com.incasa.pesaje.usuario.UsuarioDto;

import java.util.Set;

/**
 * Quién hace la petición. Basta con declararlo como parámetro de un método
 * de controlador para que la ruta exija sesión: lo resuelve
 * {@link SesionActualResolver} y, si no hay sesión válida, responde 401.
 *
 * Para exigir además un permiso: {@code sesion.exigir(Permiso.PESAR)} → 403.
 * Los permisos se leen de la tabla en cada petición (con caché), así que un
 * cambio del propietario aplica en el acto a las sesiones abiertas.
 */
public record SesionActual(Usuario usuario, Sesion sesion, Set<Permiso> permisos) {

    public UsuarioDto dto() {
        return UsuarioDto.de(usuario, permisos, sesion.getCreadaEn());
    }

    public boolean puede(Permiso p) {
        return permisos.contains(p);
    }

    public SesionActual exigir(Permiso p) {
        if (!puede(p)) {
            throw ApiExcepcion.sinPermiso("Tu rol (" + usuario.getRol().nombre() + ") no permite esta acción");
        }
        return this;
    }
}
