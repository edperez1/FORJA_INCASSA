package ni.com.incasa.pesaje.comun;

/** Normalización de texto libre que llega de los formularios. */
public final class Texto {

    private Texto() { }

    /** Recorta espacios; una cadena vacía o sólo espacios se guarda como null. */
    public static String opcional(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** Recorta y exige contenido: si queda vacío, 422 sobre ese campo. */
    public static String obligatorio(String campo, String s, String mensaje) {
        String t = opcional(s);
        if (t == null) throw ApiExcepcion.validacion(campo, mensaje);
        return t;
    }

    /** Escapa los comodines de LIKE: «OT_2026» busca el guion bajo literal. */
    public static String patronLike(String buscar) {
        String s = buscar.trim().toLowerCase()
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("[", "\\[");
        return "%" + s + "%";
    }
}
