package ni.com.incasa.pesaje.config;

import ni.com.incasa.pesaje.auth.SesionActualResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Configuración MVC: resolución de la sesión en los controladores y el
 * codificador de claves.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final SesionActualResolver sesionActual;

    public WebConfig(SesionActualResolver sesionActual) {
        this.sesionActual = sesionActual;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(sesionActual);
    }

    /** BCrypt con coste 10 (~70 ms por login): suficiente y no hace esperar al operario. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
