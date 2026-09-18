package ni.com.incasa.pesaje.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Una sesión abierta. La clave es el SHA-256 del token, nunca el token: una
 * copia de la tabla no sirve para entrar en nombre de nadie.
 */
@Entity
@Table(name = "sesion")
public class Sesion {

    @Id
    @Column(name = "token_hash", length = 64)
    private String tokenHash;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "creada_en", nullable = false)
    private Instant creadaEn;

    @Column(name = "caduca_en", nullable = false)
    private Instant caducaEn;

    protected Sesion() { }

    Sesion(String tokenHash, Long usuarioId, Instant creadaEn, Instant caducaEn) {
        this.tokenHash = tokenHash;
        this.usuarioId = usuarioId;
        this.creadaEn = creadaEn;
        this.caducaEn = caducaEn;
    }

    public String getTokenHash() { return tokenHash; }
    public Long getUsuarioId()   { return usuarioId; }
    public Instant getCreadaEn() { return creadaEn; }
    public Instant getCaducaEn() { return caducaEn; }
}
