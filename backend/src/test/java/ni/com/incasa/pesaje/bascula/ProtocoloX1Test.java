package ni.com.incasa.pesaje.bascula;

import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.List;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ProtocoloX1Test {
    private List<Double> leer(ProtocoloX1 parser, String texto) {
        List<Double> pesos = new ArrayList<>();
        for (char c : texto.toCharArray()) parser.aceptar(c).ifPresent(pesos::add);
        return pesos;
    }

    @Test void direccion99YFragmentacion() {
        var p = new ProtocoloX1(false);
        assertEquals(List.of(), leer(p, "ruido=100."));
        assertEquals(List.of(100.0, -12.5), leer(p, "00=-12.5="));
    }

    @Test void direccion00InvierteCaracteres() {
        assertEquals(List.of(100.0, -12.5), leer(new ProtocoloX1(true), "=00.001=5.21-="));
    }

    @Test void rechazaEstadosYRecuperaSinInventarPesos() {
        assertEquals(List.of(25.5), leer(new ProtocoloX1(false),
                "=OL=ST,100kg=12..0=" + "x".repeat(40) + "=25.5="));
    }

    @Test void reconexionDescartaTramaIncompleta() {
        var p = new ProtocoloX1(false);
        leer(p, "=123");
        p.reiniciar();
        assertEquals(List.of(42.0), leer(p, "45=42="));
    }
}
