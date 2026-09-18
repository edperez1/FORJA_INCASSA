package ni.com.incasa.pesaje.auth;

import ni.com.incasa.pesaje.comun.ApiExcepcion;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * Resuelve los parámetros {@link SesionActual} de los controladores a partir
 * de `Authorization: Bearer …`.
 *
 * Si falta la cabecera, el token no existe o caducó, responde 401
 * SESION_INVALIDA — que es lo que hace saltar la expulsión automática del
 * envoltorio `pedir()` en js/api.js.
 */
@Component
public class SesionActualResolver implements HandlerMethodArgumentResolver {

    private final SesionServicio sesiones;

    public SesionActualResolver(SesionServicio sesiones) {
        this.sesiones = sesiones;
    }

    @Override
    public boolean supportsParameter(MethodParameter parametro) {
        return parametro.getParameterType() == SesionActual.class;
    }

    @Override
    public SesionActual resolveArgument(MethodParameter parametro, ModelAndViewContainer mav,
                                        NativeWebRequest peticion, WebDataBinderFactory binder) {
        String token = SesionServicio.tokenDe(peticion.getHeader(HttpHeaders.AUTHORIZATION));
        return sesiones.resolver(token).orElseThrow(ApiExcepcion::sesionInvalida);
    }
}
