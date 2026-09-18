package ni.com.incasa.pesaje.documento;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 4 · DOCUMENTOS — certificado, ticket y reporte en PDF.
 *
 *   GET  /api/pesajes/{id}/certificado  → application/pdf
 *   GET  /api/pesajes/{id}/ticket       → application/pdf (80 mm, térmica)
 *   POST /api/reportes/pesajes.pdf      → application/pdf (listado del periodo)
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN IMPLEMENTAR · los tres responden 501 con el cuerpo de error estándar.│
 * │ js/api.js trata el 501 como «el servidor no lo genera» y js/reportes.js  │
 * │ arma el documento en el navegador con jsPDF, idéntico al de la vista     │
 * │ previa. El operario no nota la diferencia.                               │
 * │                                                                          │
 * │ No es urgente. Pasarlos a Java sólo hace falta cuando el certificado     │
 * │ deba llevar firma o numeración fiscal controlada por el servidor.        │
 * │                                                                          │
 * │ Al implementarlos: añadir openhtmltopdf o PDFBox al pom, devolver        │
 * │ ResponseEntity<byte[]> con Content-Type application/pdf y                │
 * │ Content-Disposition attachment; filename="CP-004821.pdf".                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@RestController
public class DocumentoController {

    @GetMapping("/api/pesajes/{id}/certificado")
    public void certificado(SesionActual sesion, @PathVariable Long id) {
        throw ApiExcepcion.noImplementado("El certificado en PDF");
    }

    @GetMapping("/api/pesajes/{id}/ticket")
    public void ticket(SesionActual sesion, @PathVariable Long id) {
        throw ApiExcepcion.noImplementado("El ticket en PDF");
    }

    @PostMapping("/api/reportes/pesajes.pdf")
    public void reporte(SesionActual sesion,
                        @RequestBody(required = false) Map<String, Object> filtros) {
        throw ApiExcepcion.noImplementado("El reporte en PDF");
    }
}
