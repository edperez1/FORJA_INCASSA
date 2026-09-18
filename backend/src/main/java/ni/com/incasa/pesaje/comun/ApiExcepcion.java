package ni.com.incasa.pesaje.comun;

import org.springframework.http.HttpStatus;

import java.util.Map;

/**
 * Excepción de negocio que ya sabe con qué código HTTP y con qué código de
 * error debe responderse. La traduce {@link ManejadorErrores} al cuerpo que
 * espera el frontend:
 *
 *     { "error": "CODIGO_MAQUINA", "mensaje": "Texto para el operario" }
 *
 * Las de validación llevan además `campos`, igual que un @Valid fallido.
 */
public class ApiExcepcion extends RuntimeException {

    private final HttpStatus estado;
    private final String codigo;
    private final Map<String, String> campos;

    public ApiExcepcion(HttpStatus estado, String codigo, String mensaje) {
        this(estado, codigo, mensaje, null);
    }

    private ApiExcepcion(HttpStatus estado, String codigo, String mensaje, Map<String, String> campos) {
        super(mensaje);
        this.estado = estado;
        this.codigo = codigo;
        this.campos = campos;
    }

    public HttpStatus estado()          { return estado; }
    public String codigo()              { return codigo; }
    public Map<String, String> campos() { return campos; }

    /* ---- Atajos para los errores que nombra el contrato de js/api.js ---- */

    public static ApiExcepcion credencialesInvalidas() {
        return new ApiExcepcion(HttpStatus.UNAUTHORIZED,
                "CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos");
    }

    public static ApiExcepcion sesionInvalida() {
        return new ApiExcepcion(HttpStatus.UNAUTHORIZED,
                "SESION_INVALIDA", "La sesión caducó");
    }

    public static ApiExcepcion usuarioExistente(String usuario) {
        return new ApiExcepcion(HttpStatus.CONFLICT,
                "USUARIO_EXISTENTE", "El usuario «" + usuario + "» ya está registrado en la planta");
    }

    public static ApiExcepcion codigoPlantaInvalido() {
        return new ApiExcepcion(HttpStatus.FORBIDDEN,
                "CODIGO_PLANTA_INVALIDO", "El código de planta no es válido");
    }

    public static ApiExcepcion noEncontrado(String que) {
        return new ApiExcepcion(HttpStatus.NOT_FOUND, "NO_ENCONTRADO", que + " no existe");
    }

    public static ApiExcepcion sinPermiso(String mensaje) {
        return new ApiExcepcion(HttpStatus.FORBIDDEN, "SIN_PERMISO", mensaje);
    }

    /** 422 con un único campo señalado, para reglas que @Valid no puede expresar. */
    public static ApiExcepcion validacion(String campo, String motivo) {
        return new ApiExcepcion(HttpStatus.UNPROCESSABLE_CONTENT, "VALIDACION", motivo,
                Map.of(campo, motivo));
    }

    public static ApiExcepcion noImplementado(String que) {
        return new ApiExcepcion(HttpStatus.NOT_IMPLEMENTED, "NO_IMPLEMENTADO",
                que + " todavía no está implementado en el servidor");
    }
}
