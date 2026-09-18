package ni.com.incasa.pesaje.comun;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

/**
 * 7 · AUDITORÍA — GET /api/auditoria?limite=200 → las últimas entradas.
 * Propietario y administradores.
 */
@RestController
@RequestMapping("/api/auditoria")
public class AuditoriaController {

    public record Entrada(Long id, Instant en, String usuario, String accion,
                          String entidad, Long entidadId, String detalle) { }

    private final AuditoriaRepositorio registro;

    public AuditoriaController(AuditoriaRepositorio registro) {
        this.registro = registro;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<Entrada> ultimas(SesionActual sesion, @RequestParam(defaultValue = "200") int limite) {
        sesion.exigir(Permiso.VER_AUDITORIA);
        return registro.findAllByOrderByEnDescIdDesc(PageRequest.of(0, Math.clamp(limite, 1, 1000))).stream()
                .map(a -> new Entrada(a.getId(), a.getEn(), a.getUsuario(), a.getAccion(),
                        a.getEntidad(), a.getEntidadId(), a.getDetalle()))
                .toList();
    }
}
