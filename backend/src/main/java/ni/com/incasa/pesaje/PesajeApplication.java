package ni.com.incasa.pesaje;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * INCASA · Sistema de Pesaje — punto de entrada.
 *
 * Arranque en desarrollo:   mvn spring-boot:run
 * Arranque del JAR:         java -jar target/pesaje-3.0.0.jar
 *
 * Escucha en http://localhost:8080. El frontend corre aparte en Vite (5173) y
 * su proxy reenvía /api y /ws hasta aquí, así que no hay CORS que configurar.
 * En producción, `pnpm build` deja el frontend en src/main/resources/static y
 * este mismo JAR sirve las dos cosas desde el mismo origen.
 */
@SpringBootApplication
public class PesajeApplication {

    public static void main(String[] args) {
        SpringApplication.run(PesajeApplication.class, args);
    }
}
