package ni.com.incasa.pesaje.produccion;

/**
 * Lo que pasó con la producción tras guardar una SALIDA. Viaja en la
 * respuesta de POST /api/pesajes (campo `cierre`) para que la terminal avise
 * al operario en el acto.
 *
 * @param alcanzada  lo producido ya llegó a la cantidad pedida
 * @param terminada  y por eso se cerró sola (si la merma estaba en tolerancia)
 * @param exceso     producto por encima de lo pedido, en la unidad de la producción
 * @param mermaPct   (entrada − salida) / entrada × 100 en ese momento
 * @param mensaje    texto listo para mostrar al operario
 */
public record Cierre(
        boolean alcanzada,
        boolean terminada,
        double exceso,
        String unidad,
        double mermaPct,
        String mensaje
) { }
