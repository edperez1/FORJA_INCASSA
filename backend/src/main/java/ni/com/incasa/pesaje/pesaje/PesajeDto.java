package ni.com.incasa.pesaje.pesaje;

import ni.com.incasa.pesaje.catalogo.Bascula;
import ni.com.incasa.pesaje.produccion.Cierre;
import ni.com.incasa.pesaje.produccion.Produccion;

import java.time.Instant;

/**
 * Un pesaje tal como viaja al frontend. Lleva aplanados los datos de su
 * producción y de la báscula, porque el historial, el CSV, el certificado y
 * el ticket los necesitan en cada fila y así no hay que cruzar nada en el
 * navegador. Los nulos no se serializan (spring.jackson.default-property-inclusion).
 */
public record PesajeDto(
        Long id,
        String folio,
        String tipo,
        String codigoBobina,
        double pesoBruto,
        double tara,
        double pesoNeto,
        String unidad,
        boolean estable,
        String origenLectura,
        Double cantidad,
        String unidadProduccion,
        String observaciones,
        Instant capturadoEn,
        Instant creadoEn,
        String operario,
        Long operarioId,
        Instant modificadoEn,
        String modificadoPor,

        /* ---- Báscula ---- */
        String bascula,
        String modeloBascula,
        double capacidadKg,
        double divisionKg,

        /* ---- Producción ---- */
        Long produccionId,
        String produccion,
        String produccionEstado,
        String ordenTrabajo,
        String producto,
        String materia,
        String areaProceso,
        String areaDestino,

        /* ---- Sólo en la respuesta de POST /api/pesajes con una SALIDA ---- */
        Cierre cierre
) {
    public PesajeDto conCierre(Cierre c) {
        return new PesajeDto(id, folio, tipo, codigoBobina, pesoBruto, tara, pesoNeto, unidad, estable,
                origenLectura, cantidad, unidadProduccion, observaciones, capturadoEn, creadoEn, operario,
                operarioId, modificadoEn, modificadoPor, bascula, modeloBascula, capacidadKg, divisionKg,
                produccionId, produccion, produccionEstado, ordenTrabajo, producto, materia,
                areaProceso, areaDestino, c);
    }

    public static PesajeDto de(Pesaje p) {
        Produccion pr = p.getProduccion();
        Bascula b = p.getBascula();
        return new PesajeDto(
                p.getId(), p.getFolio(), p.getTipo().name(), p.getCodigoBobina(),
                p.getPesoBruto().doubleValue(), p.getTara().doubleValue(), p.getPesoNeto().doubleValue(),
                p.getUnidad(), p.isEstable(), p.getOrigenLectura(),
                p.getCantidad() == null ? null : p.getCantidad().doubleValue(), pr.getUnidad().getCodigo(),
                p.getObservaciones(),
                p.getCapturadoEn(), p.getCreadoEn(), p.getOperario(), p.getOperarioId(),
                p.getModificadoEn(), p.getModificadoPor(),
                b.getCodigo(), b.modeloCompleto(), b.getCapacidadKg().doubleValue(), b.getDivisionKg().doubleValue(),
                pr.getId(), pr.getCodigo(), pr.getEstado().name(), pr.getOrdenTrabajo(),
                pr.getProducto().getNombre(), pr.getMateria().getNombre(),
                pr.getAreaProceso().getNombre(), pr.getAreaDestino().getNombre(), null);
    }
}
