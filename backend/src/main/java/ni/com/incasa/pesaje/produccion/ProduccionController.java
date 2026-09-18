package ni.com.incasa.pesaje.produccion;

import jakarta.validation.Valid;
import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.pesaje.PesajeDto;
import ni.com.incasa.pesaje.pesaje.PesajeRepositorio;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 3 · PRODUCCIONES — espejo del bloque «3 · PRODUCCIONES» de js/api.js.
 *
 *   GET  /api/producciones                 → [ produccion ]   filtros: estado, productoId, areaId, desde, hasta, buscar
 *   GET  /api/producciones/{id}            → { produccion, pesajes }
 *   POST /api/producciones                 → 201 produccion   (abrir)
 *   PUT  /api/producciones/{id}            → produccion       (corregir)
 *   POST /api/producciones/{id}/terminar   → produccion
 *   POST /api/producciones/{id}/anular     → 204
 */
@RestController
@RequestMapping("/api/producciones")
public class ProduccionController {

    public record Detalle(ProduccionDto produccion, List<PesajeDto> pesajes) { }

    private final ProduccionServicio servicio;
    private final ProduccionConsulta consulta;
    private final PesajeRepositorio pesajes;

    public ProduccionController(ProduccionServicio servicio, ProduccionConsulta consulta,
                                PesajeRepositorio pesajes) {
        this.servicio = servicio;
        this.consulta = consulta;
        this.pesajes = pesajes;
    }

    @GetMapping
    public List<ProduccionDto> listar(
            SesionActual sesion,
            @RequestParam(required = false) String estado,
            @RequestParam(required = false) Long productoId,
            @RequestParam(required = false) Long areaId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @RequestParam(required = false) String buscar) {
        sesion.exigir(Permiso.CONSULTAR);
        return consulta.buscar(new ProduccionConsulta.Filtro(estado, productoId, areaId, desde, hasta, buscar));
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public Detalle obtener(SesionActual sesion, @PathVariable Long id) {
        sesion.exigir(Permiso.CONSULTAR);
        return new Detalle(servicio.obtener(id),
                pesajes.deProduccion(id).stream().map(PesajeDto::de).toList());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProduccionDto abrir(SesionActual sesion, @Valid @RequestBody ProduccionPeticiones.Datos d) {
        return servicio.abrir(sesion, d);
    }

    @PutMapping("/{id}")
    public ProduccionDto corregir(SesionActual sesion, @PathVariable Long id,
                                  @Valid @RequestBody ProduccionPeticiones.Datos d) {
        return servicio.corregir(sesion, id, d);
    }

    @PostMapping("/{id}/terminar")
    public ProduccionDto terminar(SesionActual sesion, @PathVariable Long id,
                                  @Valid @RequestBody(required = false) ProduccionPeticiones.Terminar t) {
        return servicio.terminar(sesion, id, t);
    }

    @PostMapping("/{id}/anular")
    public ResponseEntity<Void> anular(SesionActual sesion, @PathVariable Long id,
                                       @Valid @RequestBody(required = false) ProduccionPeticiones.Anular a) {
        servicio.anular(sesion, id, a);
        return ResponseEntity.noContent().build();
    }
}
