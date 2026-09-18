package ni.com.incasa.pesaje.comun;

import ni.com.incasa.pesaje.usuario.Usuario;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Escribe en la auditoría. Se une a la transacción del llamador: si la
 * operación falla y se deshace, su línea de auditoría también desaparece.
 */
@Service
public class Auditor {

    private final AuditoriaRepositorio registro;

    public Auditor(AuditoriaRepositorio registro) {
        this.registro = registro;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void anotar(Usuario quien, String accion, String entidad, Long entidadId, String detalle) {
        registro.save(new Auditoria(quien.getId(), quien.getUsuario(), accion, entidad, entidadId, detalle));
    }
}
