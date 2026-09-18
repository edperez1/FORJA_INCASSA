package ni.com.incasa.pesaje.usuario;

import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Collection;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Qué puede hacer cada rol (tabla `rol_permiso`).
 *
 * Se consulta en cada petición, así que se guarda en memoria y se recarga
 * cuando el propietario cambia algo. Un cambio aplica en el acto a todas las
 * sesiones abiertas de ese rol: el backend no confía en los permisos que el
 * navegador recibió al iniciar sesión.
 */
@Service
public class Permisos {

    private final JdbcTemplate jdbc;
    private final Auditor auditor;

    /** Rol → permisos. null = hay que (re)leer la tabla. */
    private volatile Map<Rol, Set<Permiso>> cache;

    public Permisos(JdbcTemplate jdbc, Auditor auditor) {
        this.jdbc = jdbc;
        this.auditor = auditor;
    }

    /** Los permisos de un rol. El propietario los tiene todos, siempre. */
    public Set<Permiso> de(Rol rol) {
        if (rol == Rol.PROPIETARIO) return EnumSet.allOf(Permiso.class);
        return tabla().getOrDefault(rol, EnumSet.noneOf(Permiso.class));
    }

    private Map<Rol, Set<Permiso>> tabla() {
        Map<Rol, Set<Permiso>> c = cache;
        if (c == null) {
            Map<Rol, Set<Permiso>> leida = new EnumMap<>(Rol.class);
            for (Rol r : Rol.values()) leida.put(r, EnumSet.noneOf(Permiso.class));
            jdbc.query("SELECT rol, permiso FROM rol_permiso", fila -> {
                Rol r = Rol.desde(fila.getString(1));
                Permiso p = Permiso.desde(fila.getString(2));
                // Un código que el código Java ya no conoce se ignora en lugar de romper el login.
                if (r != null && p != null && !p.fijo()) leida.get(r).add(p);
            });
            leida.replaceAll((r, ps) -> Set.copyOf(ps));
            cache = c = leida;
        }
        return c;
    }

    /**
     * Sustituye los permisos de un rol. Sólo quien tiene GESTIONAR_PERMISOS
     * (el propietario) llega aquí; la comprobación la hace el controlador.
     */
    @Transactional
    public Set<Permiso> asignar(Usuario quien, Rol rol, Collection<String> codigos) {
        if (rol == Rol.PROPIETARIO) {
            throw ApiExcepcion.validacion("rol", "Los permisos del propietario no se pueden cambiar");
        }

        Set<Permiso> nuevos = EnumSet.noneOf(Permiso.class);
        for (String codigo : codigos) {
            Permiso p = Permiso.desde(codigo);
            if (p == null) throw ApiExcepcion.validacion("permisos", "El permiso «" + codigo + "» no existe");
            if (p.fijo()) {
                throw ApiExcepcion.validacion("permisos", "«" + codigo + "» es exclusivo del propietario");
            }
            nuevos.add(p);
        }

        Set<Permiso> antes = de(rol);
        jdbc.update("DELETE FROM rol_permiso WHERE rol = ?", rol.name());
        for (Permiso p : nuevos) {
            jdbc.update("INSERT INTO rol_permiso (rol, permiso) VALUES (?, ?)", rol.name(), p.name());
        }

        String agregados = diferencia(nuevos, antes);
        String quitados = diferencia(antes, nuevos);
        auditor.anotar(quien, "EDICION_PERMISOS", "rol", null, rol.name()
                + (agregados.isEmpty() ? "" : " · +" + agregados)
                + (quitados.isEmpty() ? "" : " · −" + quitados));

        // La caché se vacía al confirmar: si la transacción se deshace, sigue valiendo la vieja.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { cache = null; }
        });
        return nuevos;
    }

    private static String diferencia(Set<Permiso> a, Set<Permiso> b) {
        return a.stream().filter(p -> !b.contains(p)).map(Enum::name).sorted().collect(Collectors.joining(", "));
    }
}
