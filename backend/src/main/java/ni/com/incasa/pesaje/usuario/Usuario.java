package ni.com.incasa.pesaje.usuario;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Una cuenta del sistema.
 *
 * `claveHash` es un hash BCrypt. La clave en claro no se guarda nunca y no
 * sale nunca del backend: el frontend sólo ve {@link UsuarioDto}.
 */
@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 40, updatable = false)
    private String usuario;

    @Column(nullable = false, length = 80)
    private String nombres;

    @Column(nullable = false, length = 80)
    private String apellidos;

    @Column(length = 160)
    private String correo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Rol rol;

    @Column(name = "clave_hash", nullable = false, length = 100)
    private String claveHash;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "creado_en", nullable = false, updatable = false)
    private Instant creadoEn;

    @Column(name = "creado_por", length = 40, updatable = false)
    private String creadoPor;

    @Column(name = "ultimo_ingreso")
    private Instant ultimoIngreso;

    protected Usuario() { }

    public Usuario(String usuario, String nombres, String apellidos, String correo,
                   Rol rol, String claveHash, String creadoPor) {
        this.usuario = usuario;
        this.nombres = nombres;
        this.apellidos = apellidos;
        this.correo = correo;
        this.rol = rol;
        this.claveHash = claveHash;
        this.creadoPor = creadoPor;
        this.creadoEn = Instant.now();
    }

    /** «Javier López»: lo que se imprime en certificados y reportes. */
    public String nombreCompleto() {
        return (nombres + " " + apellidos).trim();
    }

    public Long getId()              { return id; }
    public String getUsuario()       { return usuario; }
    public String getNombres()       { return nombres; }
    public String getApellidos()     { return apellidos; }
    public String getCorreo()        { return correo; }
    public Rol getRol()              { return rol; }
    public String getClaveHash()     { return claveHash; }
    public boolean isActivo()        { return activo; }
    public Instant getCreadoEn()     { return creadoEn; }
    public String getCreadoPor()     { return creadoPor; }
    public Instant getUltimoIngreso(){ return ultimoIngreso; }

    public void setNombres(String v)         { this.nombres = v; }
    public void setApellidos(String v)       { this.apellidos = v; }
    public void setCorreo(String v)          { this.correo = v; }
    public void setRol(Rol v)                { this.rol = v; }
    public void setClaveHash(String v)       { this.claveHash = v; }
    public void setActivo(boolean v)         { this.activo = v; }
    public void setUltimoIngreso(Instant v)  { this.ultimoIngreso = v; }
}
