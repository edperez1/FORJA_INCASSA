package ni.com.incasa.pesaje.bascula;

import java.time.Instant;

/**
 * Una trama del indicador, tal como viaja por el WebSocket. El frontend espera
 * exactamente estos nombres (ver bloque «2 · LECTURA DE BÁSCULA» de js/api.js).
 *
 * @param peso       lo que muestra el visor: neto o bruto según el campo modo
 * @param estable    el indicador dejó de oscilar. El frontend sólo permite
 *                   guardar un pesaje con estable = true.
 * @param modo       "NETO" | "BRUTO"
 * @param sobrecarga bruto por encima de la capacidad: hay que despejar la plataforma
 */
public record LecturaBascula(
        String bascula,
        String modelo,
        double peso,
        double bruto,
        double tara,
        String unidad,
        boolean estable,
        String modo,
        boolean sobrecarga,
        double capacidad,
        double division,
        Instant ts
) { }
