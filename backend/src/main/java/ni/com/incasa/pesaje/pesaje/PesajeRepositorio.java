package ni.com.incasa.pesaje.pesaje;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PesajeRepositorio extends JpaRepository<Pesaje, Long> {

    /** Un pesaje vigente con su producción, catálogos y báscula ya cargados. */
    @Query("""
           select p from Pesaje p
             join fetch p.produccion pr
             join fetch pr.producto join fetch pr.materia join fetch pr.unidad
             join fetch pr.areaProceso join fetch pr.areaDestino
             join fetch p.bascula
            where p.id = :id and p.anuladoEn is null
           """)
    Optional<Pesaje> vigente(@Param("id") Long id);

    /** Los pesajes vigentes de una producción, en orden de captura. */
    @Query("""
           select p from Pesaje p
             join fetch p.produccion pr
             join fetch pr.producto join fetch pr.materia join fetch pr.unidad
             join fetch pr.areaProceso join fetch pr.areaDestino
             join fetch p.bascula
            where pr.id = :produccionId and p.anuladoEn is null
            order by p.capturadoEn, p.id
           """)
    List<Pesaje> deProduccion(@Param("produccionId") Long produccionId);

    /**
     * Totales por producción y tipo, sólo de pesajes vigentes:
     * [produccionId, tipo, sumaNeto, cuenta, sumaCantidad]
     */
    @Query("""
           select p.produccion.id, p.tipo, coalesce(sum(p.pesoNeto), 0), count(p), coalesce(sum(p.cantidad), 0)
             from Pesaje p
            where p.anuladoEn is null and p.produccion.id in :ids
            group by p.produccion.id, p.tipo
           """)
    List<Object[]> totalesPorProduccion(@Param("ids") Collection<Long> ids);

    /** Códigos de bobina de las entradas vigentes: [produccionId, codigo] */
    @Query("""
           select p.produccion.id, p.codigoBobina from Pesaje p
            where p.anuladoEn is null and p.tipo = ni.com.incasa.pesaje.pesaje.TipoPesaje.ENTRADA
              and p.produccion.id in :ids
            order by p.capturadoEn
           """)
    List<Object[]> bobinasPorProduccion(@Param("ids") Collection<Long> ids);

    long countByProduccionIdAndAnuladoEnIsNull(Long produccionId);

    long countByProduccionIdAndTipoAndAnuladoEnIsNull(Long produccionId, TipoPesaje tipo);

    /** Siguiente número de folio. La secuencia no se reinicia ni se reutiliza. */
    @Query(value = "SELECT NEXT VALUE FOR seq_folio", nativeQuery = true)
    Long siguienteFolio();
}
