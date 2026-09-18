package ni.com.incasa.pesaje.comun;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditoriaRepositorio extends JpaRepository<Auditoria, Long> {

    List<Auditoria> findAllByOrderByEnDescIdDesc(Pageable pagina);
}
