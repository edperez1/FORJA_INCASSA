package ni.com.incasa.pesaje.bascula;

import com.fazecast.jSerialComm.SerialPort;
import jakarta.annotation.PreDestroy;
import ni.com.incasa.pesaje.catalogo.CatalogoServicio;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;

/** Receptor de solo lectura: no envía órdenes de calibración, cero ni tara. */
@Component
@ConditionalOnProperty(name = "incasa.bascula.serie-habilitada", havingValue = "true")
public class LectorSerie {
    private static final Logger log = LoggerFactory.getLogger(LectorSerie.class);
    private final BasculaWebSocketHandler websocket;
    private final CatalogoServicio catalogos;
    private final SerialPort puerto;
    private final ProtocoloX1 protocolo;
    private final long estabilidadMs;
    private final long timeoutMs;
    private long reintentar;
    private long ultima;
    private long desde;
    private double referencia;

    public LectorSerie(BasculaWebSocketHandler websocket, CatalogoServicio catalogos,
            @Value("${incasa.bascula.simular}") boolean simular,
            @Value("${incasa.bascula.puerto-serie}") String nombre,
            @Value("${incasa.bascula.baudios}") int baudios,
            @Value("${incasa.bascula.bits-datos}") int bits,
            @Value("${incasa.bascula.paridad}") String paridad,
            @Value("${incasa.bascula.bits-parada}") int parada,
            @Value("${incasa.bascula.direccion}") int direccion,
            @Value("${incasa.bascula.estabilidad-ms}") long estabilidadMs,
            @Value("${incasa.bascula.timeout-ms}") long timeoutMs) {
        if (simular) throw new IllegalArgumentException("Desactiva INCASA_BASCULA_SIMULAR para usar RS-232");
        if (direccion != 0 && direccion != 99) throw new IllegalArgumentException("Dirección X1: 0 o 99");
        if (estabilidadMs < 500 || timeoutMs < 1000 || parada < 1 || parada > 2 || bits < 7 || bits > 8 || baudios <= 0)
            throw new IllegalArgumentException("Parámetros RS-232 inválidos");
        int p = switch (paridad.toUpperCase(java.util.Locale.ROOT)) {
            case "NONE" -> SerialPort.NO_PARITY;
            case "EVEN" -> SerialPort.EVEN_PARITY;
            case "ODD" -> SerialPort.ODD_PARITY;
            default -> throw new IllegalArgumentException("Paridad: NONE, EVEN u ODD");
        };
        this.websocket = websocket;
        this.catalogos = catalogos;
        this.estabilidadMs = estabilidadMs;
        this.timeoutMs = timeoutMs;
        protocolo = new ProtocoloX1(direccion == 0);
        puerto = SerialPort.getCommPort(nombre);
        puerto.setComPortParameters(baudios, bits, parada == 1 ? SerialPort.ONE_STOP_BIT : SerialPort.TWO_STOP_BITS, p);
        puerto.setFlowControl(SerialPort.FLOW_CONTROL_DISABLED);
        puerto.setComPortTimeouts(SerialPort.TIMEOUT_NONBLOCKING, 0, 0);
    }

    @Scheduled(fixedDelay = 100)
    synchronized void leer() {
        long ahora = System.currentTimeMillis();
        try {
            if (!puerto.isOpen()) {
                if (ahora < reintentar) return;
                reintentar = ahora + 5000;
                if (!puerto.openPort()) { log.warn("No se pudo abrir {}", puerto.getSystemPortName()); return; }
                ultima = ahora;
                desde = 0;
                protocolo.reiniciar();
                log.info("RS-232 abierto: {} (protocolo X1 de referencia)", puerto.getSystemPortName());
            }
            int disponibles = puerto.bytesAvailable();
            if (disponibles < 0) throw new IllegalStateException("Puerto desconectado");
            if (disponibles > 0) {
                byte[] datos = new byte[Math.min(disponibles, 4096)];
                int leidos = puerto.readBytes(datos, datos.length);
                if (leidos < 0) throw new IllegalStateException("Error de lectura RS-232");
                for (int i = 0; i < leidos; i++) {
                    var peso = protocolo.aceptar((char) (datos[i] & 0xff));
                    if (peso.isPresent()) publicar(peso.getAsDouble(), ahora);
                }
            }
            if (ahora - ultima > timeoutMs) throw new IllegalStateException("Sin tramas válidas; comprobar cable, baudios y Adr");
        } catch (RuntimeException ex) {
            log.warn("Lectura RS-232 interrumpida: {}", ex.getMessage());
            cerrar();
            reintentar = ahora + 5000;
        }
    }

    private void publicar(double peso, long ahora) {
        var b = catalogos.basculaActiva();
        // La trama X1 no contiene bandera de estabilidad: se estima por repetición.
        if (desde == 0 || Math.abs(peso - referencia) > 0.000001 || ahora - ultima > timeoutMs) {
            referencia = peso;
            desde = ahora;
        }
        ultima = ahora;
        double capacidad = b.getCapacidadKg().doubleValue();
        websocket.difundir(new LecturaBascula(b.getCodigo(), b.modeloCompleto(), peso,
                peso, 0, "kg", ahora - desde >= estabilidadMs, "BRUTO", peso > capacidad,
                capacidad, b.getDivisionKg().doubleValue(), Instant.now()));
    }

    @PreDestroy
    synchronized void cerrar() {
        puerto.closePort();
        desde = 0;
        protocolo.reiniciar();
    }
}
