package ni.com.incasa.pesaje.catalogo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.NoRepositoryBean;

import java.util.List;

/** Consultas comunes a los cuatro catálogos editables. */
@NoRepositoryBean
public interface CatalogoRepositorio<T extends ElementoCatalogo> extends JpaRepository<T, Long> {

    List<T> findAllByOrderByNombreAsc();

    List<T> findByActivoTrueOrderByNombreAsc();

    boolean existsByNombreIgnoreCase(String nombre);

    boolean existsByNombreIgnoreCaseAndIdNot(String nombre, Long id);
}
