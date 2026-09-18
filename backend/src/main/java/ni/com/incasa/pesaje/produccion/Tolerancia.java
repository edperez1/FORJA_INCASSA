package ni.com.incasa.pesaje.produccion;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Merma máxima admitida entre la entrada y la salida de una producción, en %.
 * Se configura con INCASA_MERMA_MAXIMA (por defecto 2). Una producción con
 * más merma no se termina sola ni la termina un operario: sólo alguien con
 * permiso de corrección, justificándolo.
 */
@Component
public class Tolerancia {

    private final double mermaMaximaPct;

    public Tolerancia(@Value("${incasa.produccion.merma-maxima-pct}") double mermaMaximaPct) {
        this.mermaMaximaPct = mermaMaximaPct;
    }

    public double mermaMaximaPct() { return mermaMaximaPct; }

    /** Merma en % con los kg dados; 0 si todavía no hay entrada. */
    public static double mermaPct(double kgEntrada, double kgSalida) {
        return kgEntrada > 0 ? (kgEntrada - kgSalida) / kgEntrada * 100 : 0;
    }

    public boolean dentro(double mermaPct) {
        // Una centésima de margen: 2.004 % se muestra como 2.0 % y no debe rechazarse.
        return mermaPct <= mermaMaximaPct + 0.005;
    }
}
