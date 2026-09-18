package ni.com.incasa.pesaje.bascula;

import ni.com.incasa.pesaje.auth.SesionServicio;
import ni.com.incasa.pesaje.catalogo.Bascula;
import ni.com.incasa.pesaje.catalogo.CatalogoServicio;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

import tools.jackson.databind.ObjectMapper;

/**
 * 2 · BÁSCULA EN TIEMPO REAL · ws://localhost:8080/ws/bascula?token=...
 *
 * CÓMO DEBE QUEDAR EN PLANTA
 * --------------------------------------------------------------------------
 * El indicador Hiweight X10 publica por puerto serie. La pieza que falta es un
 * lector que abra el COM con jSerialComm, parsee la trama del indicador y llame
 * a difundir(lectura) por cada muestra. Este handler ya hace todo lo demás:
 * registro de sesiones, reparto por báscula y comandos de vuelta.
 *
 * Cada conexión exige un token de sesión vigente (query string, porque el
 * navegador no deja poner cabeceras en un WebSocket). El sistema trabaja con
 * la báscula ACTIVA de la tabla `bascula`: de ahí salen código, modelo,
 * capacidad y división de cada trama.
 *
 * Mientras tanto, con incasa.bascula.simular = true el backend emite una
 * lectura sintética a 10 Hz, que es lo que permite probar el flujo de pesaje
 * completo contra Java sin tener la báscula delante. Poner la bandera en false
 * en cuanto el lector serie exista.
 */
@Component
public class BasculaWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(BasculaWebSocketHandler.class);

    private final ObjectMapper json;
    private final SesionServicio sesiones;
    private final CatalogoServicio catalogos;
    private final boolean simular;

    /**
     * Sesiones abiertas y el estado de cada una. Se guarda el decorador
     * concurrente: el emisor (simulador o lector serie) y el cierre pueden
     * escribir a la vez, y WebSocketSession no admite envíos simultáneos.
     */
    private final Map<String, Conexion> abiertas = new ConcurrentHashMap<>();

    private record Conexion(WebSocketSession salida, Estado estado) { }

    public BasculaWebSocketHandler(ObjectMapper json,
                                   SesionServicio sesiones,
                                   CatalogoServicio catalogos,
                                   @Value("${incasa.bascula.simular}") boolean simular) {
        this.json = json;
        this.sesiones = sesiones;
        this.catalogos = catalogos;
        this.simular = simular;
    }

    /** Estado por conexión: la báscula que mira y lo que tiene tarado. */
    private static final class Estado {
        String bascula;
        String modelo;
        double capacidad;
        double division;
        double tara = 0;
        boolean modoBruto = false;

        /* Sólo los usa el simulador */
        double carga = 0;          // lo que hay físicamente sobre la plataforma
        double objetivo = 0;       // peso de la bobina que se está colocando
        int ticks = 0;             // décimas de segundo en la fase actual
        Fase fase = Fase.VACIA;
    }

    /** Ciclo de una pesada simulada: vacía → carga → asentada → retirada. */
    private enum Fase { VACIA, CARGANDO, ASENTADA, RETIRANDO }

    /* ====================================================================
     *  Ciclo de vida de la conexión
     * ==================================================================*/

    @Override
    public void afterConnectionEstablished(WebSocketSession sesion) throws IOException {
        String token = parametro(sesion, "token", null);
        if (sesiones.resolver(token).isEmpty()) {
            log.debug("WebSocket rechazado: sesión inválida");
            sesion.close(CloseStatus.POLICY_VIOLATION.withReason("Sesion invalida"));
            return;
        }

        // Los datos del equipo se leen al conectar: si un administrador cambia
        // la capacidad, las pantallas la toman en su siguiente reconexión.
        Bascula b = catalogos.basculaActiva();
        Estado e = new Estado();
        e.bascula = b.getCodigo();
        e.modelo = b.modeloCompleto();
        e.capacidad = b.getCapacidadKg().doubleValue();
        e.division = b.getDivisionKg().doubleValue();

        // 1 s de margen de envío y 64 KB de cola: una pantalla colgada no
        // frena a las demás, se la desconecta y el frontend reconecta solo.
        WebSocketSession salida = new ConcurrentWebSocketSessionDecorator(sesion, 1000, 64 * 1024);
        abiertas.put(sesion.getId(), new Conexion(salida, e));
        log.debug("Báscula conectada: {} ({} sesiones)", e.bascula, abiertas.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession sesion, CloseStatus estado) {
        abiertas.remove(sesion.getId());
        log.debug("Báscula desconectada ({} sesiones)", abiertas.size());
    }

    /* ====================================================================
     *  Comandos que manda el frontend: CERO · TARA · BRUTO · NETO
     * ==================================================================*/

    /** Cuerpo de los comandos: { "comando": "TARA" } */
    private record Comando(String comando) { }

    @Override
    protected void handleTextMessage(WebSocketSession sesion, TextMessage mensaje) {
        Conexion con = abiertas.get(sesion.getId());
        if (con == null) return;
        Estado e = con.estado();

        Comando c;
        try {
            c = json.readValue(mensaje.getPayload(), Comando.class);
        } catch (RuntimeException ilegible) {
            log.warn("Comando ilegible: {}", mensaje.getPayload());
            return;
        }
        String comando = c.comando() == null ? "" : c.comando();

        switch (comando) {
            case "CERO"  -> e.tara = 0;
            case "TARA"  -> e.tara = e.carga;
            case "BRUTO" -> e.modoBruto = true;
            case "NETO"  -> e.modoBruto = false;
            default      -> log.warn("Comando desconocido: {}", comando);
        }

        // TODO: con hardware real, reenviar el comando al indicador por el
        // puerto serie en lugar de aplicarlo aquí.
    }

    /* ====================================================================
     *  Emisión
     * ==================================================================*/

    /**
     * Punto de entrada del lector serie real. Reparte una lectura a todas las
     * pantallas abiertas sobre esa báscula.
     */
    public void difundir(LecturaBascula lectura) {
        abiertas.forEach((id, con) -> {
            if (con.estado().bascula.equals(lectura.bascula())) {
                enviar(id, con.salida(), lectura);
            }
        });
    }

    private void enviar(String id, WebSocketSession salida, LecturaBascula lectura) {
        try {
            if (salida.isOpen()) {
                salida.sendMessage(new TextMessage(json.writeValueAsString(lectura)));
            }
        } catch (IOException | RuntimeException ex) {
            log.warn("No se pudo enviar la lectura, se cierra la sesión: {}", ex.getMessage());
            abiertas.remove(id);
        }
    }

    /* ====================================================================
     *  Simulador · se apaga con incasa.bascula.simular = false
     * ==================================================================*/

    @Scheduled(fixedRate = 100)   // 10 Hz, como el indicador real
    void emitirSimulado() {
        if (!simular || abiertas.isEmpty()) return;

        abiertas.forEach((id, con) -> {
            Estado e = con.estado();
            boolean estable = simularPaso(e);

            double bruto = redondear(e.carga, e.division);
            double neto = redondear(bruto - e.tara, e.division);

            enviar(id, con.salida(), new LecturaBascula(
                    e.bascula,
                    e.modelo,
                    e.modoBruto ? bruto : neto,
                    bruto,
                    redondear(e.tara, e.division),
                    "kg",
                    estable,
                    e.modoBruto ? "BRUTO" : "NETO",
                    bruto > e.capacidad,
                    e.capacidad,
                    e.division,
                    Instant.now()
            ));
        });
    }

    /**
     * Un paso de 100 ms del ciclo simulado. Imita lo que ve el operario en la
     * nave: plataforma vacía unos segundos, llega una bobina de 1.8–2.2 t que
     * oscila al asentarse, queda ESTABLE unos 12 s (tiempo de capturar) y se
     * retira. Devuelve si la lectura está estable.
     */
    private static boolean simularPaso(Estado e) {
        ThreadLocalRandom azar = ThreadLocalRandom.current();
        e.ticks++;

        switch (e.fase) {
            case VACIA -> {
                e.carga = Math.max(0, azar.nextDouble(-e.division, e.division) * 0.4);
                if (e.ticks > 40) {
                    e.fase = Fase.CARGANDO;
                    e.ticks = 0;
                    e.objetivo = Math.round(azar.nextDouble(1800, 2200) / e.division) * e.division;
                }
                return true;
            }
            case CARGANDO -> {
                // Se acerca al peso real con una oscilación que se amortigua.
                double restante = e.objetivo - e.carga;
                double vaiven = Math.sin(e.ticks * 1.7) * Math.max(0, 40 - e.ticks * 2);
                e.carga = Math.max(0, e.carga + restante * 0.35 + vaiven);
                if (e.ticks > 22) { e.fase = Fase.ASENTADA; e.ticks = 0; e.carga = e.objetivo; }
                return false;
            }
            case ASENTADA -> {
                e.carga = e.objetivo;
                if (e.ticks > 120) { e.fase = Fase.RETIRANDO; e.ticks = 0; }
                return true;
            }
            case RETIRANDO -> {
                e.carga = Math.max(0, e.carga * 0.55 + azar.nextDouble(-8, 8));
                if (e.carga < 3) { e.fase = Fase.VACIA; e.ticks = 0; e.carga = 0; }
                return false;
            }
        }
        return false;
    }

    /** El indicador no resuelve por debajo de su división de escala (0.5 kg). */
    private static double redondear(double kg, double division) {
        return Math.round(kg / division) * division;
    }

    private static String parametro(WebSocketSession sesion, String nombre, String porDefecto) {
        URI uri = sesion.getUri();
        if (uri == null || uri.getQuery() == null) return porDefecto;

        for (String par : uri.getQuery().split("&")) {
            String[] kv = par.split("=", 2);
            if (kv.length == 2 && kv[0].equals(nombre)) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return porDefecto;
    }
}
