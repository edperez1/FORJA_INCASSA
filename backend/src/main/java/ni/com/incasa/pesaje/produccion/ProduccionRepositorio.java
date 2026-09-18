package ni.com.incasa.pesaje.produccion;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ProduccionRepositorio extends JpaRepository<Produccion, Long> {

    /** Una producción con sus catálogos cargados (el DTO los necesita). */
    @Query("""
           select p from Produccion p
             join fetch p.producto join fetch p.materia join fetch p.unidad
             join fetch p.areaProceso join fetch p.areaDestino
            where p.id = :id
           """)
    Optional<Produccion> conCatalogos(@Param("id") Long id);

    /**
     * Bloquea la fila hasta el final de la transacción. Lo usan el alta de
     * pesajes, terminar y anular: sin el bloqueo, un pesaje podría colarse en
     * una producción que otra terminal está cerrando en ese mismo instante.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Produccion p where p.id = :id")
    Optional<Produccion> bloquear(@Param("id") Long id);

    @Query(value = "SELECT NEXT VALUE FOR seq_produccion", nativeQuery = true)
    Long siguienteCodigo();
}
