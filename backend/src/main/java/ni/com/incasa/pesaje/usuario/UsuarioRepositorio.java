package ni.com.incasa.pesaje.usuario;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UsuarioRepositorio extends JpaRepository<Usuario, Long> {

    /** «JLopez» y «jlopez» son la misma persona. */
    Optional<Usuario> findByUsuarioIgnoreCase(String usuario);

    boolean existsByUsuarioIgnoreCase(String usuario);

    boolean existsByRol(Rol rol);

    List<Usuario> findAllByOrderByNombresAscApellidosAsc();
}
