package ni.com.incasa.pesaje.bascula;

import java.util.OptionalDouble;

/** ASCII continuo X1: '=' delimita muestras; Adr=00 invierte los caracteres. */
final class ProtocoloX1 {
    private final StringBuilder trama = new StringBuilder();
    private final boolean invertir;
    private boolean iniciada;

    ProtocoloX1(boolean invertir) { this.invertir = invertir; }

    OptionalDouble aceptar(char c) {
        if (c == '=') {
            String dato = trama.toString();
            trama.setLength(0);
            boolean previa = iniciada;
            iniciada = true;
            if (!previa) return OptionalDouble.empty();
            if (invertir) dato = new StringBuilder(dato).reverse().toString();
            dato = dato.trim();
            if (!dato.matches("[+-]?\\d{1,7}(\\.\\d{1,3})?")) return OptionalDouble.empty();
            return OptionalDouble.of(Double.parseDouble(dato));
        }
        if (iniciada) {
            if (trama.length() >= 24) { reiniciar(); }
            else trama.append(c);
        }
        return OptionalDouble.empty();
    }

    void reiniciar() { trama.setLength(0); iniciada = false; }
}
