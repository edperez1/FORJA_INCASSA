package ni.com.incasa.pesaje.pesaje;

import jakarta.validation.Valid;
import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 4 · PESAJES — espejo del bloque «4 · PESAJES» de js/api.js.
 *
 *   POST   /api/pesajes        → 201 pesaje
 *   GET    /api/pesajes        → { datos, meta }   filtros: buscar, tipo, produccionId, productoId, desde, hasta
 *   GET    /api/pesajes/{id}
 *   PUT    /api/pesajes/{id}   → sólo código de bobina y observaciones
 *   DELETE /api/pesajes/{id}   → 204 · baja lógica (?motivo=…)
 */
@RestController
@RequestMapping("/api/pesajes")
public class PesajeController {

    /** Respuesta del listado. `meta.totales` suma el filtro completo, no la página. */
    public record Pagina(List<PesajeDto> datos, Map<String, Object> meta) { }

    private static final int MAX_POR_PAGINA = 1000;

    private final PesajeServicio servicio;
    private final PesajeConsulta consulta;

    public PesajeController(PesajeServicio servicio, PesajeConsulta consulta) {
        this.servicio = servicio;
        this.consulta = consulta;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PesajeDto crear(SesionActual sesion, @Valid @RequestBody PesajePeticiones.Alta p) {
        return servicio.crear(sesion, p);
    }

    /**
     * Sin `porPagina` se devuelve todo lo que cumple el filtro: el historial y
     * los reportes de js/app.js agregan en el navegador sobre la lista completa.
     */
    @GetMapping
    public Pagina listar(
            SesionActual sesion,
            @RequestParam(required = false) String buscar,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) Long produccionId,
            @RequestParam(required = false) Long productoId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @RequestParam(defaultValue = "1") int pagina,
            @RequestParam(required = false) Integer porPagina) {
        sesion.exigir(Permiso.CONSULTAR);

        var filtro = new PesajeConsulta.Filtro(buscar, tipo, produccionId, productoId, desde, hasta);
        int p = Math.max(1, pagina);
        Integer tam = porPagina == null ? null : Math.clamp(porPagina, 1, MAX_POR_PAGINA);

        PesajeConsulta.Resultado r = consulta.buscar(filtro, tam == null ? 0 : (p - 1) * tam, tam);

        Map<String, Object> totales = new LinkedHashMap<>();
        totales.put("entradaKg", kg(r.kgEntrada()));
        totales.put("salidaKg", kg(r.kgSalida()));

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("pagina", tam == null ? 1 : p);
        meta.put("porPagina", tam == null ? r.datos().size() : tam);
        meta.put("total", r.total());
        meta.put("totales", totales);
        return new Pagina(r.datos(), meta);
    }

    @GetMapping("/{id}")
    public PesajeDto obtener(SesionActual sesion, @PathVariable Long id) {
        sesion.exigir(Permiso.CONSULTAR);
        return servicio.obtener(id);
    }

    @PutMapping("/{id}")
    public PesajeDto corregir(SesionActual sesion, @PathVariable Long id,
                              @Valid @RequestBody PesajePeticiones.Correccion c) {
        return servicio.corregir(sesion, id, c);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> anular(SesionActual sesion, @PathVariable Long id,
                                       @RequestParam(required = false) String motivo) {
        servicio.anular(sesion, id, motivo);
        return ResponseEntity.noContent().build();
    }

    private static double kg(BigDecimal v) {
        return v.setScale(1, RoundingMode.HALF_UP).doubleValue();
    }
}
