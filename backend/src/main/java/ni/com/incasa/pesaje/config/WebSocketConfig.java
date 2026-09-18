package ni.com.incasa.pesaje.config;

import ni.com.incasa.pesaje.bascula.BasculaWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * Publica el WebSocket de la báscula en /ws/bascula, que es la ruta que reenvía
 * el proxy de vite.config.js.
 *
 * Sin setAllowedOrigins: el frontend llega por el proxy de Vite o servido por
 * este mismo JAR, así que siempre es el mismo origen.
 *
 * @EnableScheduling hace falta para el emisor simulado a 10 Hz del handler.
 */
@Configuration
@EnableWebSocket
@EnableScheduling
public class WebSocketConfig implements WebSocketConfigurer {

    private final BasculaWebSocketHandler handler;

    public WebSocketConfig(BasculaWebSocketHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registro) {
        registro.addHandler(handler, "/ws/bascula");
    }
}
