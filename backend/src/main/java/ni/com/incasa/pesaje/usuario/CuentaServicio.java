package ni.com.incasa.pesaje.usuario;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.auth.SesionServicio;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import ni.com.incasa.pesaje.comun.Texto;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;

/**
 * Cuentas: el perfil propio y la gestión que hacen el propietario y los
 * administradores.
 *
 * Reglas de jerarquía:
 *   · El PROPIETARIO es único: no se crea, asigna, edita ni desactiva por
 *     aquí. Sólo él mismo cambia sus datos, desde «Mi perfil».
 *   · Crear o modificar un ADMINISTRADOR exige GESTIONAR_ADMINISTRADORES
 *     (sólo el propietario). Lo mismo para convertir a alguien en administrador.
 *   · Nadie se gestiona a sí mismo por aquí: ni su rol ni su estado.
 */
@Service
public class CuentaServicio {

    private final UsuarioRepositorio usuarios;
    private final SesionServicio sesiones;
    private final PasswordEncoder encoder;
    private final Auditor auditor;
    private final Permisos permisos;

    public CuentaServicio(UsuarioRepositorio usuarios, SesionServicio sesiones,
                          PasswordEncoder encoder, Auditor auditor, Permisos permisos) {
        this.usuarios = usuarios;
        this.sesiones = sesiones;
        this.encoder = encoder;
        this.auditor = auditor;
        this.permisos = permisos;
    }

    private UsuarioDto dto(Usuario u) {
        return UsuarioDto.de(u, permisos.de(u.getRol()));
    }

    /* ====================================================================
     *  Perfil propio
     * ==================================================================*/

    @Transactional
    public UsuarioDto actualizarPerfil(SesionActual s, Peticiones.Perfil p) {
        Usuario u = recargar(s.usuario().getId());
        u.setNombres(p.nombres().trim());
        u.setApellidos(p.apellidos().trim());
        u.setCorreo(Texto.opcional(p.correo()));
        return UsuarioDto.de(u, s.permisos(), s.sesion().getCreadaEn());
    }

    @Transactional
    public void cambiarClave(SesionActual s, Peticiones.CambioClave p) {
        Usuario u = recargar(s.usuario().getId());

        if (!encoder.matches(p.claveActual(), u.getClaveHash())) {
            throw new ApiExcepcion(HttpStatus.BAD_REQUEST,
                    "CLAVE_ACTUAL_INVALIDA", "La contraseña actual no es correcta");
        }

        u.setClaveHash(encoder.encode(p.claveNueva()));
        // Quien tuviera la clave vieja pierde las sesiones que abrió con ella.
        sesiones.cerrarOtras(s);
        auditor.anotar(u, "CAMBIO_CLAVE", "usuario", u.getId(), null);
    }

    /* ====================================================================
     *  Gestión de cuentas
     * ==================================================================*/

    @Transactional(readOnly = true)
    public List<UsuarioDto> listar(SesionActual s) {
        exigirGestion(s);
        return usuarios.findAllByOrderByNombresAscApellidosAsc().stream().map(this::dto).toList();
    }

    /** Roles que este usuario puede asignar: lo que ofrece el desplegable del panel. */
    public List<Rol> rolesAsignables(SesionActual s) {
        return Arrays.stream(Rol.values())
                .filter(r -> r != Rol.PROPIETARIO)
                .filter(r -> s.puede(r.permisoParaGestionar()))
                .toList();
    }

    @Transactional
    public UsuarioDto crear(SesionActual s, Peticiones.Alta p) {
        exigirGestion(s);
        Rol rol = rolAsignable(s, p.rol());

        if (usuarios.existsByUsuarioIgnoreCase(p.usuario().trim())) {
            throw ApiExcepcion.usuarioExistente(p.usuario());
        }

        Usuario u = new Usuario(
                p.usuario().trim(),
                p.nombres().trim(),
                p.apellidos().trim(),
                Texto.opcional(p.correo()),
                rol,
                encoder.encode(p.clave()),
                s.usuario().getUsuario());
        try {
            usuarios.saveAndFlush(u);
        } catch (DataIntegrityViolationException carrera) {
            throw ApiExcepcion.usuarioExistente(p.usuario());
        }

        auditor.anotar(s.usuario(), "ALTA_USUARIO", "usuario", u.getId(),
                u.getUsuario() + " · " + rol.nombre());
        return dto(u);
    }

    @Transactional
    public UsuarioDto editar(SesionActual s, Long id, Peticiones.Edicion p) {
        exigirGestion(s);
        Usuario u = gestionable(s, id);
        Rol nuevoRol = rolAsignable(s, p.rol());

        StringBuilder cambios = new StringBuilder();
        if (u.getRol() != nuevoRol) {
            cambios.append("rol ").append(u.getRol().name()).append(" → ").append(nuevoRol.name()).append("; ");
            u.setRol(nuevoRol);
        }
        u.setNombres(p.nombres().trim());
        u.setApellidos(p.apellidos().trim());
        u.setCorreo(Texto.opcional(p.correo()));

        if (p.activo() != null && p.activo() != u.isActivo()) {
            u.setActivo(p.activo());
            cambios.append(p.activo() ? "reactivado" : "desactivado");
            // Una cuenta desactivada sale en el acto de todas las terminales.
            if (!p.activo()) sesiones.cerrarTodas(u.getId());
        }

        auditor.anotar(s.usuario(), "EDICION_USUARIO", "usuario", u.getId(),
                u.getUsuario() + (cambios.isEmpty() ? "" : " · " + cambios));
        return dto(u);
    }

    @Transactional
    public void restablecerClave(SesionActual s, Long id, Peticiones.RestablecerClave p) {
        exigirGestion(s);
        Usuario u = gestionable(s, id);
        u.setClaveHash(encoder.encode(p.claveNueva()));
        sesiones.cerrarTodas(u.getId());
        auditor.anotar(s.usuario(), "RESTABLECER_CLAVE", "usuario", u.getId(), u.getUsuario());
    }

    /* ====================================================================
     *  Reglas
     * ==================================================================*/

    private static void exigirGestion(SesionActual s) {
        s.exigir(Permiso.GESTIONAR_USUARIOS);
    }

    /** La cuenta existe, no es la propia, no es el propietario y mi rol alcanza. */
    private Usuario gestionable(SesionActual s, Long id) {
        Usuario u = usuarios.findById(id).orElseThrow(() -> ApiExcepcion.noEncontrado("El usuario"));

        if (u.getId().equals(s.usuario().getId())) {
            throw ApiExcepcion.sinPermiso("Tu propia cuenta se gestiona desde «Mi perfil»");
        }
        if (u.getRol() == Rol.PROPIETARIO) {
            throw ApiExcepcion.sinPermiso("La cuenta del propietario sólo la gestiona el propietario");
        }
        if (!s.puede(u.getRol().permisoParaGestionar())) {
            throw ApiExcepcion.sinPermiso("Sólo el propietario gestiona a los administradores");
        }
        return u;
    }

    private Rol rolAsignable(SesionActual s, String codigo) {
        Rol rol = Rol.desde(codigo);
        if (rol == null) {
            throw ApiExcepcion.validacion("rol", "El rol «" + codigo + "» no existe");
        }
        if (rol == Rol.PROPIETARIO) {
            throw ApiExcepcion.validacion("rol", "Sólo puede haber un propietario del sistema");
        }
        if (!s.puede(rol.permisoParaGestionar())) {
            throw ApiExcepcion.sinPermiso("Sólo el propietario puede asignar el rol " + rol.nombre());
        }
        return rol;
    }

    private Usuario recargar(Long id) {
        return usuarios.findById(id).orElseThrow(ApiExcepcion::sesionInvalida);
    }
}
