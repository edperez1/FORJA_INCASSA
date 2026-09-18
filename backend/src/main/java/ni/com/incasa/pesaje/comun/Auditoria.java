package ni.com.incasa.pesaje.comun;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/** Una línea del registro de auditoría. Sólo se inserta, nunca se modifica. */
@Entity
@Table(name = "auditoria")
public class Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Instant en;

    @Column(name = "usuario_id", updatable = false)
    private Long usuarioId;

    @Column(nullable = false, length = 40, updatable = false)
    private String usuario;

    @Column(nullable = false, length = 40, updatable = false)
    private String accion;

    @Column(nullable = false, length = 30, updatable = false)
    private String entidad;

    @Column(name = "entidad_id", updatable = false)
    private Long entidadId;

    @Column(length = 500, updatable = false)
    private String detalle;

    protected Auditoria() { }

    public Auditoria(Long usuarioId, String usuario, String accion,
                     String entidad, Long entidadId, String detalle) {
        this.en = Instant.now();
        this.usuarioId = usuarioId;
        this.usuario = usuario;
        this.accion = accion;
        this.entidad = entidad;
        this.entidadId = entidadId;
        this.detalle = detalle == null || detalle.length() <= 500 ? detalle : detalle.substring(0, 500);
    }

    public Long getId()         { return id; }
    public Instant getEn()      { return en; }
    public Long getUsuarioId()  { return usuarioId; }
    public String getUsuario()  { return usuario; }
    public String getAccion()   { return accion; }
    public String getEntidad()  { return entidad; }
    public Long getEntidadId()  { return entidadId; }
    public String getDetalle()  { return detalle; }
}
