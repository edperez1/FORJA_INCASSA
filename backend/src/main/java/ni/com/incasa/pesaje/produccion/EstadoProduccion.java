package ni.com.incasa.pesaje.produccion;

/** Estados de una producción. No es un catálogo: son reglas del proceso. */
public enum EstadoProduccion {
    /** Abierta: admite pesajes de entrada y de salida. */
    PROCESO,
    /** Cerrada con sus pesajes. Ya no admite más. */
    TERMINADO,
    /** Dada de baja sin pesajes vigentes. Desaparece de listados y reportes. */
    ANULADA
}
