package ni.com.incasa.pesaje.auth;

import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import ni.com.incasa.pesaje.comun.Texto;
import ni.com.incasa.pesaje.usuario.Rol;
import ni.com.incasa.pesaje.usuario.Usuario;
import ni.com.incasa.pesaje.usuario.UsuarioRepositorio;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/**
 * Configuración inicial (la cuenta del propietario) e inicio de sesión.
 * Las demás cuentas las crean el propietario o los administradores
 * (ver usuario/CuentaServicio).
 */
@Service
public class AuthServicio {

    private final UsuarioRepositorio usuarios;
    private final SesionServicio sesiones;
    private final PasswordEncoder encoder;
    private final Auditor auditor;
    private final String codigoInstalacion;

    /**
     * Hash con el que se compara cuando el usuario no existe, para que
     * «usuario inexistente» y «clave incorrecta» tarden lo mismo y no se pueda
     * averiguar qué usuarios hay midiendo el tiempo de respuesta.
     */
    private final String hashSenuelo;

    public AuthServicio(UsuarioRepositorio usuarios,
                        SesionServicio sesiones,
                        PasswordEncoder encoder,
                        Auditor auditor,
                        @Value("${incasa.codigo-instalacion}") String codigoInstalacion) {
        this.usuarios = usuarios;
        this.sesiones = sesiones;
        this.encoder = encoder;
        this.auditor = auditor;
        this.codigoInstalacion = codigoInstalacion;
        this.hashSenuelo = encoder.encode("senuelo-no-es-una-clave");
    }

    /** ¿Falta crear al propietario? La pantalla de acceso lo pregunta al cargar. */
    @Transactional(readOnly = true)
    public boolean requiereConfiguracion() {
        return !usuarios.existsByRol(Rol.PROPIETARIO);
    }

    /* ====================================================================
     *  Configuración inicial · la cuenta del propietario
     * ==================================================================*/
    @Transactional
    public SesionRespuesta configurar(ConfiguracionPeticion p) {
        if (!requiereConfiguracion()) {
            throw new ApiExcepcion(HttpStatus.CONFLICT, "YA_CONFIGURADO",
                    "El sistema ya tiene propietario. Inicia sesión con tu cuenta.");
        }
        if (!iguales(codigoInstalacion, p.codigoInstalacion())) {
            throw new ApiExcepcion(HttpStatus.FORBIDDEN, "CODIGO_INSTALACION_INVALIDO",
                    "El código de instalación no es válido");
        }
        if (usuarios.existsByUsuarioIgnoreCase(p.usuario().trim())) {
            throw ApiExcepcion.usuarioExistente(p.usuario());
        }

        Usuario u = usuarios.saveAndFlush(new Usuario(
                p.usuario().trim(),
                p.nombres().trim(),
                p.apellidos().trim(),
                Texto.opcional(p.correo()),
                Rol.PROPIETARIO,
                encoder.encode(p.clave()),
                null));
        u.setUltimoIngreso(Instant.now());

        auditor.anotar(u, "CONFIGURACION_INICIAL", "usuario", u.getId(), "Alta del propietario del sistema");
        return sesiones.abrir(u);
    }

    /* ====================================================================
     *  Login
     * ==================================================================*/
    @Transactional
    public SesionRespuesta autenticar(LoginPeticion p) {
        Usuario u = usuarios.findByUsuarioIgnoreCase(p.usuario().trim()).orElse(null);

        if (u == null) {
            encoder.matches(p.clave(), hashSenuelo);
            throw ApiExcepcion.credencialesInvalidas();
        }
        if (!encoder.matches(p.clave(), u.getClaveHash())) {
            throw ApiExcepcion.credencialesInvalidas();
        }
        if (!u.isActivo()) {
            // Sólo se revela tras acertar la clave: no filtra qué cuentas existen.
            throw new ApiExcepcion(HttpStatus.FORBIDDEN, "CUENTA_INACTIVA",
                    "Tu cuenta está desactivada. Consulta con el administrador.");
        }

        u.setUltimoIngreso(Instant.now());
        return sesiones.abrir(u);
    }

    /** Comparación en tiempo constante del código de instalación. */
    private static boolean iguales(String esperado, String recibido) {
        if (recibido == null) return false;
        return MessageDigest.isEqual(esperado.getBytes(StandardCharsets.UTF_8),
                recibido.trim().getBytes(StandardCharsets.UTF_8));
    }
}
