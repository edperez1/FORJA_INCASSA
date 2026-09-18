package ni.com.incasa.pesaje.catalogo;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BasculaRepositorio extends JpaRepository<Bascula, Long> {

    /** La báscula con la que trabaja el sistema. Si hubiera varias activas, la primera. */
    Optional<Bascula> findFirstByActivaTrueOrderByIdAsc();
}
