package ni.com.incasa.pesaje.usuario;

/**
 * Lo que un rol puede hacer. Los códigos coinciden con la tabla `permiso`.
 *
 * Qué permisos tiene cada rol lo decide el propietario (tabla `rol_permiso`,
 * pantalla Administración → Roles y permisos). El frontend recibe la lista
 * en `usuario.permisos` y oculta lo que no toca; el backend la vuelve a
 * comprobar en cada petición.
 */
public enum Permiso {
    /** Abrir una producción nueva. */
    ABRIR_PRODUCCION(false),
    /** Registrar pesajes de entrada y de salida. */
    PESAR(false),
    /** Cerrar una producción con su entrada y su salida. */
    TERMINAR_PRODUCCION(false),
    /** Corregir y anular pesajes y producciones. */
    CORREGIR(false),
    /** Producciones, historial y reportes. */
    CONSULTAR(false),
    /** Crear, editar, desactivar y restablecer la clave de cuentas que no son administradores. */
    GESTIONAR_USUARIOS(false),
    /** Áreas, productos, materias, unidades y báscula. */
    GESTIONAR_CATALOGOS(false),
    /** Registro de auditoría. */
    VER_AUDITORIA(false),
    /** Crear y editar administradores. Sólo el propietario. */
    GESTIONAR_ADMINISTRADORES(true),
    /** Decidir qué puede hacer cada rol. Sólo el propietario. */
    GESTIONAR_PERMISOS(true);

    /**
     * Fijo = exclusivo del propietario. No se puede asignar a otro rol: quien
     * lo tuviera podría quitarle el control del sistema al propietario.
     */
    private final boolean fijo;

    Permiso(boolean fijo) {
        this.fijo = fijo;
    }

    public boolean fijo() { return fijo; }

    public static Permiso desde(String codigo) {
        for (Permiso p : values()) if (p.name().equals(codigo)) return p;
        return null;
    }
}
