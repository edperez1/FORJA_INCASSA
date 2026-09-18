package ni.com.incasa.pesaje.produccion;

import java.time.Instant;
import java.util.List;

/**
 * Una producción tal como viaja al frontend, con sus catálogos aplanados
 * (id + nombre) y los totales de sus pesajes vigentes:
 *
 *   kgEntrada   suma de los netos de ENTRADA (las bobinas)
 *   kgSalida    suma de los netos de SALIDA  (lo producido)
 *   mermaKg     kgEntrada − kgSalida  (sólo si hay entrada)
 *   rendimiento kgSalida / kgEntrada × 100 (sólo si hay entrada)
 *   cantidadProducida  suma de la cantidad de las salidas, en la unidad de la producción
 *   avance      cantidadProducida / cantidad × 100
 *   exceso      producto por encima de lo pedido (0 si no lo hay)
 *   mermaPct    mermaKg / kgEntrada × 100 · mermaMaximaPct: la tolerancia
 *   bobinas     códigos de bobina de las entradas, en orden de pesaje
 */
public record ProduccionDto(
        Long id,
        String codigo,
        String ordenTrabajo,
        Long productoId, String producto,
        Long materiaId, String materia,
        double cantidad,
        Long unidadId, String unidad, String unidadNombre,
        Long areaProcesoId, String areaProceso,
        Long areaDestinoId, String areaDestino,
        String estado,
        Instant inicioEn,
        Instant finEn,
        String abiertaPor,
        String terminadaPor,
        String observaciones,
        Instant modificadoEn,
        String modificadoPor,
        double kgEntrada,
        double kgSalida,
        Double mermaKg,
        Double rendimiento,
        long entradas,
        long salidas,
        double cantidadProducida,
        double avance,
        double exceso,
        Double mermaPct,
        double mermaMaximaPct,
        List<String> bobinas
) {
    static ProduccionDto de(Produccion p, Totales.DeProduccion t, Tolerancia tolerancia) {
        Double merma = t.entradas() > 0 ? redondear(t.kgEntrada() - t.kgSalida()) : null;
        Double rendimiento = t.kgEntrada() > 0 ? redondear(t.kgSalida() / t.kgEntrada() * 100) : null;
        return new ProduccionDto(
                p.getId(), p.getCodigo(), p.getOrdenTrabajo(),
                p.getProducto().getId(), p.getProducto().getNombre(),
                p.getMateria().getId(), p.getMateria().getNombre(),
                p.getCantidad().doubleValue(),
                p.getUnidad().getId(), p.getUnidad().getCodigo(), p.getUnidad().getNombre(),
                p.getAreaProceso().getId(), p.getAreaProceso().getNombre(),
                p.getAreaDestino().getId(), p.getAreaDestino().getNombre(),
                p.getEstado().name(), p.getInicioEn(), p.getFinEn(),
                p.getAbiertaPor(), p.getTerminadaPor(), p.getObservaciones(),
                p.getModificadoEn(), p.getModificadoPor(),
                redondear(t.kgEntrada()), redondear(t.kgSalida()), merma, rendimiento,
                t.entradas(), t.salidas(),
                Math.round(t.cantidadProducida() * 100.0) / 100.0,
                redondear(p.getCantidad().signum() > 0 ? t.cantidadProducida() / p.getCantidad().doubleValue() * 100 : 0),
                Math.round(Math.max(0, t.cantidadProducida() - p.getCantidad().doubleValue()) * 100.0) / 100.0,
                t.kgEntrada() > 0 ? Math.round(Tolerancia.mermaPct(t.kgEntrada(), t.kgSalida()) * 100.0) / 100.0 : null,
                tolerancia.mermaMaximaPct(),
                t.bobinas());
    }

    private static double redondear(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
