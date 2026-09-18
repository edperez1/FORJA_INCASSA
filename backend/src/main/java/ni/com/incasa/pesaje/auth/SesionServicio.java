package ni.com.incasa.pesaje.auth;

import ni.com.incasa.pesaje.usuario.Permisos;
import ni.com.incasa.pesaje.usuario.Usuario;
import ni.com.incasa.pesaje.usuario.UsuarioRepositorio;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

/**
 * Emisión, resolución y cierre de sesiones.
 *
 * El token es un valor opaco de 256 bits. Se entrega una vez al navegador y
 * en la tabla sólo queda su SHA-256. Las sesiones viven en la base, así que
 * reiniciar el backend no expulsa a los operarios en mitad del turno.
 */
@Service
public class SesionServicio {

    private static final Logger log = LoggerFactory.getLogger(SesionServicio.class);

    private final SesionRepositorio sesiones;
    private final UsuarioRepositorio usuarios;
    private final Permisos permisos;
    private final long duracionSegundos;
    private final SecureRandom azar = new SecureRandom();

    public SesionServicio(SesionRepositorio sesiones,
                          UsuarioRepositorio usuarios,
                          Permisos permisos,
                          @Value("${incasa.sesion-segundos}") long duracionSegundos) {
        this.sesiones = sesiones;
        this.usuarios = usuarios;
        this.permisos = permisos;
        this.duracionSegundos = duracionSegundos;
    }

    /** Abre una sesión y devuelve la respuesta común de login y registro. */
    @Transactional
    public SesionRespuesta abrir(Usuario u) {
        byte[] bytes = new byte[32];
        azar.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        Instant ahora = Instant.now();
        Sesion s = sesiones.save(new Sesion(hash(token), u.getId(), ahora,
                ahora.plusSeconds(duracionSegundos)));

        return new SesionRespuesta(token, duracionSegundos, new SesionActual(u, s, permisos.de(u.getRol())).dto());
    }

    /** Sesión vigente de un token, o vacío si no existe, caducó o el usuario está dado de baja. */
    @Transactional(readOnly = true)
    public Optional<SesionActual> resolver(String token) {
        if (token == null || token.isBlank()) return Optional.empty();

        return sesiones.findById(hash(token))
                .filter(s -> s.getCaducaEn().isAfter(Instant.now()))
                .flatMap(s -> usuarios.findById(s.getUsuarioId())
                        .filter(Usuario::isActivo)
                        .map(u -> new SesionActual(u, s, permisos.de(u.getRol()))));
    }

    @Transactional
    public void cerrar(String token) {
        if (token == null || token.isBlank()) return;
        sesiones.deleteById(hash(token));
    }

    @Transactional
    public void cerrarOtras(SesionActual actual) {
        sesiones.borrarOtras(actual.usuario().getId(), actual.sesion().getTokenHash());
    }

    @Transactional
    public void cerrarTodas(Long usuarioId) {
        sesiones.borrarDeUsuario(usuarioId);
    }

    /** Limpieza horaria: las caducadas ya no sirven y sólo engordan la tabla. */
    @Scheduled(fixedRate = 3_600_000, initialDelay = 60_000)
    @Transactional
    public void purgarCaducadas() {
        int n = sesiones.borrarCaducadas(Instant.now());
        if (n > 0) log.debug("Sesiones caducadas eliminadas: {}", n);
    }

    /** Token de la cabecera `Authorization: Bearer …`, o null. */
    public static String tokenDe(String cabecera) {
        if (cabecera == null || !cabecera.startsWith("Bearer ")) return null;
        String t = cabecera.substring(7).trim();
        return t.isEmpty() ? null : t;
    }

    static String hash(String token) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
