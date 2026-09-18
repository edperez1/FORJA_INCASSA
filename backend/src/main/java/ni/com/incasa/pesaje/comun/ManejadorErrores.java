package ni.com.incasa.pesaje.comun;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Traductor único de excepciones a la respuesta de error del contrato.
 *
 * Todo error del backend sale con esta forma, y sólo con esta forma:
 *
 *     { "error": "CODIGO_MAQUINA", "mensaje": "Texto para el operario" }
 *
 * salvo las validaciones, que añaden el detalle por campo:
 *
 *     { "error": "VALIDACION", "mensaje": "…", "campos": { "clave": "Mínimo 8 caracteres" } }
 *
 * El envoltorio `pedir()` de js/api.js lee `mensaje` y lo muestra tal cual al
 * operario, así que el texto debe estar en español y ser accionable.
 *
 * El Content-Type va FIJADO a JSON en cada respuesta. Sin eso, una petición
 * con `Accept: application/pdf` (el certificado) que acaba en error hace que
 * Spring no encuentre cómo escribir el JSON y lo convierta en un 500 vacío.
 */
@RestControllerAdvice
public class ManejadorErrores {

    private static final Logger log = LoggerFactory.getLogger(ManejadorErrores.class);

    @ExceptionHandler(ApiExcepcion.class)
    public ResponseEntity<Map<String, Object>> api(ApiExcepcion e) {
        Map<String, Object> cuerpo = cuerpo(e.codigo(), e.getMessage());
        if (e.campos() != null) cuerpo.put("campos", e.campos());
        return responder(e.estado(), cuerpo);
    }

    /** Falla un @Valid: 422 con el mapa campo → motivo. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validacion(MethodArgumentNotValidException e) {
        Map<String, String> campos = new LinkedHashMap<>();
        for (FieldError f : e.getBindingResult().getFieldErrors()) {
            campos.putIfAbsent(f.getField(), f.getDefaultMessage());
        }
        // El primer motivo va también en `mensaje`: es lo único que pinta el aviso.
        String mensaje = campos.values().stream().findFirst().orElse("Revisa los campos marcados");
        Map<String, Object> cuerpo = cuerpo("VALIDACION", mensaje);
        cuerpo.put("campos", campos);
        return responder(HttpStatus.UNPROCESSABLE_CONTENT, cuerpo);
    }

    /** JSON mal formado o con un tipo imposible (texto en un peso, p. ej.). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> ilegible(HttpMessageNotReadableException e) {
        return responder(HttpStatus.BAD_REQUEST, cuerpo("PETICION_INVALIDA", "La petición no tiene el formato esperado"));
    }

    /** Un id o una fecha que no se pueden convertir: /pesajes/abc, desde=ayer. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> tipo(MethodArgumentTypeMismatchException e) {
        return responder(HttpStatus.BAD_REQUEST, cuerpo("PETICION_INVALIDA", "El valor de «" + e.getName() + "» no es válido"));
    }

    /**
     * Red de seguridad: nada debe salir del backend sin este formato.
     *
     * Los errores del propio Spring MVC (ruta inexistente, método no
     * permitido, tipo de contenido…) implementan ErrorResponse y ya traen su
     * código HTTP: se respeta y se viste con el cuerpo del contrato en lugar
     * de convertirlos en un 500.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> inesperado(Exception e) {
        if (e instanceof ErrorResponse er) {
            HttpStatusCode estado = er.getStatusCode();
            boolean noExiste = estado.value() == 404;
            return responder(estado, noExiste
                    ? cuerpo("NO_ENCONTRADO", "El recurso no existe")
                    : cuerpo("PETICION_INVALIDA", "La petición no es válida (" + estado.value() + ")"));
        }

        // El detalle va al log de planta, no al navegador del operario.
        log.error("Error no controlado", e);
        return responder(HttpStatus.INTERNAL_SERVER_ERROR, cuerpo("ERROR_INTERNO", "Ocurrió un error en el servidor"));
    }

    private static ResponseEntity<Map<String, Object>> responder(HttpStatusCode estado, Map<String, Object> cuerpo) {
        return ResponseEntity.status(estado).contentType(MediaType.APPLICATION_JSON).body(cuerpo);
    }

    private static Map<String, Object> cuerpo(String codigo, String mensaje) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("error", codigo);
        m.put("mensaje", mensaje);
        return m;
    }
}
