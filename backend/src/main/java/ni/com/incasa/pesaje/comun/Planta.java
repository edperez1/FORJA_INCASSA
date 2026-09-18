package ni.com.incasa.pesaje.comun;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

/** Constantes de planta que comparten varios módulos. */
public final class Planta {

    private Planta() { }

    /**
     * Hora de Nicaragua (UTC-6, sin horario de verano). Los "días" del
     * historial y de los reportes se cuentan en esta zona, no en UTC.
     */
    public static final ZoneId ZONA = ZoneId.of("America/Managua");

    /**
     * Cómo se obtuvo el peso (App.fuente en js/app.js):
     *   conectada → trama del indicador por WebSocket (lectura certificada)
     *   simulador → pesos inventados por js/bascula.js, sólo para formación
     *   manual    → contingencia: el operario teclea lo que marca el visor
     */
    public static final String ORIGEN_CONECTADA = "conectada";
    public static final String ORIGEN_SIMULADOR  = "simulador";
    public static final String ORIGEN_MANUAL     = "manual";
    public static final List<String> ORIGENES = List.of(ORIGEN_CONECTADA, ORIGEN_SIMULADOR, ORIGEN_MANUAL);

    /** Primer instante de un día de planta. */
    public static java.time.Instant inicioDelDia(LocalDate dia) {
        return dia.atStartOfDay(ZONA).toInstant();
    }

    /** Primer instante del día SIGUIENTE: el límite superior exclusivo. */
    public static java.time.Instant finDelDia(LocalDate dia) {
        return dia.plusDays(1).atStartOfDay(ZONA).toInstant();
    }
}
