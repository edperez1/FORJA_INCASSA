package ni.com.incasa.pesaje.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

public interface SesionRepositorio extends JpaRepository<Sesion, String> {

    @Modifying
    @Query("delete from Sesion s where s.caducaEn < :ahora")
    int borrarCaducadas(@Param("ahora") Instant ahora);

    /** Al desactivar una cuenta o restablecer su clave se cierran todas sus sesiones. */
    @Modifying
    @Query("delete from Sesion s where s.usuarioId = :usuarioId")
    int borrarDeUsuario(@Param("usuarioId") Long usuarioId);

    /** Al cambiar la clave se cierran las demás sesiones del usuario. */
    @Modifying
    @Query("delete from Sesion s where s.usuarioId = :usuarioId and s.tokenHash <> :conservar")
    int borrarOtras(@Param("usuarioId") Long usuarioId, @Param("conservar") String conservar);
}
