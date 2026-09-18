package ni.com.incasa.pesaje.produccion;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Planta;
import ni.com.incasa.pesaje.comun.Texto;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Listado de producciones con filtros opcionales, en SQL. */
@Component
public class ProduccionConsulta {

    /**
     * @param estado  PROCESO | TERMINADO | ANULADA · vacío = PROCESO y TERMINADO
     * @param desde   primer día de INICIO, en hora de Nicaragua
     */
    public record Filtro(String estado, Long productoId, Long areaId,
                         LocalDate desde, LocalDate hasta, String buscar) { }

    private final EntityManager em;
    private final Totales totales;
    private final Tolerancia tolerancia;

    public ProduccionConsulta(EntityManager em, Totales totales, Tolerancia tolerancia) {
        this.em = em;
        this.totales = totales;
        this.tolerancia = tolerancia;
    }

    @Transactional(readOnly = true)
    public List<ProduccionDto> buscar(Filtro f) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Produccion> q = cb.createQuery(Produccion.class);
        Root<Produccion> r = q.from(Produccion.class);

        // join fetch de los cinco catálogos: una sola consulta para toda la lista.
        r.fetch("producto");
        r.fetch("materia");
        r.fetch("unidad");
        r.fetch("areaProceso");
        r.fetch("areaDestino");

        List<Predicate> p = new ArrayList<>();

        if (f.estado() == null || f.estado().isBlank()) {
            p.add(r.get("estado").in(EstadoProduccion.PROCESO, EstadoProduccion.TERMINADO));
        } else {
            p.add(cb.equal(r.get("estado"), estado(f.estado())));
        }
        if (f.productoId() != null) p.add(cb.equal(r.get("producto").get("id"), f.productoId()));
        if (f.areaId() != null) {
            p.add(cb.or(cb.equal(r.get("areaProceso").get("id"), f.areaId()),
                        cb.equal(r.get("areaDestino").get("id"), f.areaId())));
        }
        if (f.desde() != null) p.add(cb.greaterThanOrEqualTo(r.get("inicioEn"), Planta.inicioDelDia(f.desde())));
        if (f.hasta() != null) p.add(cb.lessThan(r.get("inicioEn"), Planta.finDelDia(f.hasta())));

        if (f.buscar() != null && !f.buscar().isBlank()) {
            String patron = Texto.patronLike(f.buscar());
            p.add(cb.or(
                    cb.like(cb.lower(r.get("codigo")), patron, '\\'),
                    cb.like(cb.lower(r.get("ordenTrabajo")), patron, '\\'),
                    cb.like(cb.lower(r.get("producto").get("nombre")), patron, '\\'),
                    cb.like(cb.lower(r.get("abiertaPor")), patron, '\\'),
                    cb.like(cb.lower(r.get("observaciones")), patron, '\\')
            ));
        }

        q.select(r).where(p.toArray(Predicate[]::new))
                .orderBy(cb.desc(r.get("inicioEn")), cb.desc(r.get("id")));

        List<Produccion> filas = em.createQuery(q).getResultList();
        Map<Long, Totales.DeProduccion> t = totales.de(filas.stream().map(Produccion::getId).toList());
        return filas.stream()
                .map(x -> ProduccionDto.de(x, t.getOrDefault(x.getId(), Totales.DeProduccion.VACIO), tolerancia))
                .toList();
    }

    static EstadoProduccion estado(String s) {
        try {
            return EstadoProduccion.valueOf(s);
        } catch (IllegalArgumentException e) {
            throw ApiExcepcion.validacion("estado", "Estado desconocido: «" + s + "»");
        }
    }
}
