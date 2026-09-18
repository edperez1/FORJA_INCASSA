package ni.com.incasa.pesaje.pesaje;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Planta;
import ni.com.incasa.pesaje.comun.Texto;
import ni.com.incasa.pesaje.produccion.Produccion;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * El historial: filtros opcionales, orden, totales por tipo y paginación,
 * todo en SQL. Sólo pesajes vigentes.
 */
@Component
public class PesajeConsulta {

    public record Filtro(String buscar, String tipo, Long produccionId, Long productoId,
                         LocalDate desde, LocalDate hasta) { }

    public record Resultado(List<PesajeDto> datos, long total, BigDecimal kgEntrada, BigDecimal kgSalida) { }

    private final EntityManager em;

    public PesajeConsulta(EntityManager em) {
        this.em = em;
    }

    /**
     * @param desdeFila primera fila (0 = la primera)
     * @param filas     tamaño de la página; null = todas las que cumplan el filtro
     */
    @Transactional(readOnly = true)
    public Resultado buscar(Filtro f, int desdeFila, Integer filas) {
        CriteriaBuilder cb = em.getCriteriaBuilder();

        /* --- Totales por tipo, sobre el filtro completo --- */
        CriteriaQuery<Object[]> agg = cb.createQuery(Object[].class);
        Root<Pesaje> ra = agg.from(Pesaje.class);
        Join<Pesaje, Produccion> pa = ra.join("produccion");
        agg.select(cb.array(ra.get("tipo"), cb.count(ra), cb.sum(ra.<BigDecimal>get("pesoNeto"))))
                .where(predicados(cb, ra, pa, f))
                .groupBy(ra.get("tipo"));

        long total = 0;
        BigDecimal entrada = BigDecimal.ZERO, salida = BigDecimal.ZERO;
        for (Object[] fila : em.createQuery(agg).getResultList()) {
            total += ((Number) fila[1]).longValue();
            BigDecimal kg = fila[2] == null ? BigDecimal.ZERO : new BigDecimal(fila[2].toString());
            if (fila[0] == TipoPesaje.ENTRADA) entrada = kg; else salida = kg;
        }

        /* --- La página, del más reciente al más viejo --- */
        CriteriaQuery<Pesaje> q = cb.createQuery(Pesaje.class);
        Root<Pesaje> r = q.from(Pesaje.class);
        @SuppressWarnings("unchecked")
        Join<Pesaje, Produccion> pr = (Join<Pesaje, Produccion>) r.<Pesaje, Produccion>fetch("produccion");
        pr.fetch("producto");
        pr.fetch("materia");
        pr.fetch("unidad");
        pr.fetch("areaProceso");
        pr.fetch("areaDestino");
        r.fetch("bascula");

        q.select(r).where(predicados(cb, r, pr, f))
                .orderBy(cb.desc(r.get("capturadoEn")), cb.desc(r.get("id")));

        TypedQuery<Pesaje> consulta = em.createQuery(q).setFirstResult(desdeFila);
        if (filas != null) consulta.setMaxResults(filas);

        List<PesajeDto> datos = consulta.getResultList().stream().map(PesajeDto::de).toList();
        return new Resultado(datos, total, entrada, salida);
    }

    private static Predicate[] predicados(CriteriaBuilder cb, Root<Pesaje> r,
                                          Join<Pesaje, Produccion> pr, Filtro f) {
        List<Predicate> p = new ArrayList<>();
        p.add(cb.isNull(r.get("anuladoEn")));

        if (f.tipo() != null && !f.tipo().isBlank()) {
            try {
                p.add(cb.equal(r.get("tipo"), TipoPesaje.valueOf(f.tipo())));
            } catch (IllegalArgumentException e) {
                throw ApiExcepcion.validacion("tipo", "El tipo de pesaje es ENTRADA o SALIDA");
            }
        }
        if (f.produccionId() != null) p.add(cb.equal(pr.get("id"), f.produccionId()));
        if (f.productoId() != null)   p.add(cb.equal(pr.get("producto").get("id"), f.productoId()));

        // El rango se compara por DÍA en hora de Nicaragua, no por instante UTC.
        if (f.desde() != null) p.add(cb.greaterThanOrEqualTo(r.get("capturadoEn"), Planta.inicioDelDia(f.desde())));
        if (f.hasta() != null) p.add(cb.lessThan(r.get("capturadoEn"), Planta.finDelDia(f.hasta())));

        if (f.buscar() != null && !f.buscar().isBlank()) {
            String patron = Texto.patronLike(f.buscar());
            p.add(cb.or(
                    cb.like(cb.lower(r.get("folio")),          patron, '\\'),
                    cb.like(cb.lower(r.get("codigoBobina")),   patron, '\\'),
                    cb.like(cb.lower(r.get("operario")),       patron, '\\'),
                    cb.like(cb.lower(r.get("observaciones")),  patron, '\\'),
                    cb.like(cb.lower(pr.get("codigo")),        patron, '\\'),
                    cb.like(cb.lower(pr.get("ordenTrabajo")),  patron, '\\'),
                    cb.like(cb.lower(pr.get("producto").get("nombre")), patron, '\\')
            ));
        }
        return p.toArray(Predicate[]::new);
    }
}
