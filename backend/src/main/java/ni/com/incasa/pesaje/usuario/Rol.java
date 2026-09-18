package ni.com.incasa.pesaje.usuario;

/**
 * Los cinco roles del sistema. Los códigos coinciden con la tabla `rol`.
 *
 * Los permisos de cada rol NO viven aquí: los decide el propietario y se
 * guardan en la tabla `rol_permiso` (ver {@link Permisos}). La única regla
 * fija es que el PROPIETARIO los tiene todos, siempre.
 */
public enum Rol {

    PROPIETARIO("Propietario del sistema"),
    ADMINISTRADOR("Administrador"),
    SUPERVISOR("Supervisor de planta"),
    OPERARIO("Operario de báscula"),
    CALIDAD("Control de calidad");

    private final String nombre;

    Rol(String nombre) {
        this.nombre = nombre;
    }

    public String nombre() { return nombre; }

    /** Permiso que hace falta para crear o modificar una cuenta con este rol. */
    public Permiso permisoParaGestionar() {
        return this == ADMINISTRADOR ? Permiso.GESTIONAR_ADMINISTRADORES : Permiso.GESTIONAR_USUARIOS;
    }

    public static Rol desde(String codigo) {
        for (Rol r : values()) if (r.name().equals(codigo)) return r;
        return null;
    }
}
