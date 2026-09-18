package ni.com.incasa.pesaje.produccion;

import ni.com.incasa.pesaje.pesaje.PesajeRepositorio;
import ni.com.incasa.pesaje.pesaje.TipoPesaje;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Suma los pesajes vigentes de un lote de producciones en dos consultas
 * (totales y bobinas), en lugar de dos por producción.
 */
@Component
class Totales {

    record DeProduccion(double kgEntrada, double kgSalida, long entradas, long salidas,
                        double cantidadProducida, List<String> bobinas) {
        static final DeProduccion VACIO = new DeProduccion(0, 0, 0, 0, 0, List.of());
    }

    private final PesajeRepositorio pesajes;

    Totales(PesajeRepositorio pesajes) {
        this.pesajes = pesajes;
    }

    Map<Long, DeProduccion> de(Collection<Long> ids) {
        Map<Long, DeProduccion> r = new HashMap<>();
        if (ids.isEmpty()) return r;

        // Consultas por tandas: SQL Server admite ~2.100 parámetros por sentencia.
        List<Long> todos = new ArrayList<>(ids);
        for (int i = 0; i < todos.size(); i += 1000) {
            List<Long> tanda = todos.subList(i, Math.min(i + 1000, todos.size()));

            Map<Long, double[]> suma = new HashMap<>();     // [kgE, kgS, nE, nS, cantidad]
            for (Object[] f : pesajes.totalesPorProduccion(tanda)) {
                double[] a = suma.computeIfAbsent((Long) f[0], k -> new double[5]);
                double kg = ((Number) f[2]).doubleValue();
                long n = ((Number) f[3]).longValue();
                if (f[1] == TipoPesaje.ENTRADA) { a[0] += kg; a[2] += n; }
                else { a[1] += kg; a[3] += n; a[4] += ((Number) f[4]).doubleValue(); }
            }

            Map<Long, List<String>> bobinas = new HashMap<>();
            for (Object[] f : pesajes.bobinasPorProduccion(tanda)) {
                if (f[1] != null) bobinas.computeIfAbsent((Long) f[0], k -> new ArrayList<>()).add((String) f[1]);
            }

            for (Long id : tanda) {
                double[] a = suma.get(id);
                if (a == null) { r.put(id, DeProduccion.VACIO); continue; }
                r.put(id, new DeProduccion(a[0], a[1], (long) a[2], (long) a[3], a[4],
                        List.copyOf(bobinas.getOrDefault(id, List.of()))));
            }
        }
        return r;
    }

    DeProduccion de(Long id) {
        return de(List.of(id)).getOrDefault(id, DeProduccion.VACIO);
    }
}
