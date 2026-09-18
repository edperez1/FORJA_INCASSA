package ni.com.incasa.pesaje.catalogo;

import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.catalogo.CatalogoDtos.*;
import ni.com.incasa.pesaje.comun.ApiExcepcion;
import ni.com.incasa.pesaje.comun.Auditor;
import ni.com.incasa.pesaje.comun.Texto;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.RoundingMode;
import java.util.List;
import java.util.function.Supplier;

/**
 * Lectura y administración de los catálogos. Los demás módulos piden aquí
 * los elementos por id con {@link #areaActiva}, {@link #productoActivo}…,
 * que ya validan que existan y estén activos.
 */
@Service
public class CatalogoServicio {

    /** Los cuatro catálogos editables, tal como aparecen en la URL. */
    public enum Tipo {
        areas("área", "El área"),
        productos("producto", "El producto"),
        materias("materia", "La materia"),
        unidades("unidad de medida", "La unidad de medida");

        final String nombre;
        final String articulo;

        Tipo(String nombre, String articulo) {
            this.nombre = nombre;
            this.articulo = articulo;
        }

        public static Tipo desde(String s) {
            for (Tipo t : values()) if (t.name().equals(s)) return t;
            throw ApiExcepcion.noEncontrado("El catálogo «" + s + "»");
        }
    }

    private final AreaRepositorio areas;
    private final ProductoRepositorio productos;
    private final MateriaRepositorio materias;
    private final UnidadMedidaRepositorio unidades;
    private final BasculaRepositorio basculas;
    private final Auditor auditor;

    public CatalogoServicio(AreaRepositorio areas, ProductoRepositorio productos,
                            MateriaRepositorio materias, UnidadMedidaRepositorio unidades,
                            BasculaRepositorio basculas, Auditor auditor) {
        this.areas = areas;
        this.productos = productos;
        this.materias = materias;
        this.unidades = unidades;
        this.basculas = basculas;
        this.auditor = auditor;
    }

    /* ====================================================================
     *  Lectura
     * ==================================================================*/

    /** Con `todos` = false sólo lo activo (formularios); con true, todo (panel de administración). */
    @Transactional(readOnly = true)
    public Todos todos(boolean todos) {
        return new Todos(
                lista(areas, todos), lista(productos, todos), lista(materias, todos), lista(unidades, todos),
                BasculaDto.de(basculaActiva()));
    }

    private static List<Elemento> lista(CatalogoRepositorio<? extends ElementoCatalogo> repo, boolean todos) {
        var filas = todos ? repo.findAllByOrderByNombreAsc() : repo.findByActivoTrueOrderByNombreAsc();
        return filas.stream().map(Elemento::de).toList();
    }

    @Transactional(readOnly = true)
    public Bascula basculaActiva() {
        return basculas.findFirstByActivaTrueOrderByIdAsc()
                .orElseThrow(() -> new IllegalStateException("No hay ninguna báscula activa en la tabla bascula"));
    }

    public Area areaActiva(String campo, Long id)            { return activo(areas, campo, id, Tipo.areas); }
    public Producto productoActivo(String campo, Long id)    { return activo(productos, campo, id, Tipo.productos); }
    public Materia materiaActiva(String campo, Long id)      { return activo(materias, campo, id, Tipo.materias); }
    public UnidadMedida unidadActiva(String campo, Long id)  { return activo(unidades, campo, id, Tipo.unidades); }

    private static <T extends ElementoCatalogo> T activo(CatalogoRepositorio<T> repo, String campo,
                                                         Long id, Tipo tipo) {
        if (id == null) throw ApiExcepcion.validacion(campo, "Elige " + tipo.articulo.toLowerCase());
        T e = repo.findById(id).orElse(null);
        if (e == null || !e.isActivo()) {
            throw ApiExcepcion.validacion(campo, tipo.articulo + " elegido no existe o está desactivado");
        }
        return e;
    }

    /* ====================================================================
     *  Administración
     * ==================================================================*/

    @Transactional
    public Elemento crear(SesionActual s, Tipo tipo, ElementoPeticion p) {
        s.exigir(Permiso.GESTIONAR_CATALOGOS);
        String nombre = p.nombre().trim();
        exigirNombreLibre(tipo, nombre, null);

        ElementoCatalogo e = switch (tipo) {
            case areas -> new Area();
            case productos -> new Producto();
            case materias -> new Materia();
            case unidades -> {
                UnidadMedida u = new UnidadMedida();
                u.setCodigo(codigoUnidad(p.codigo(), null));
                yield u;
            }
        };
        e.setNombre(nombre);
        e.setObservaciones(Texto.opcional(p.observaciones()));
        e.setActivo(p.activo() == null || p.activo());

        e = guardar(tipo, e);
        auditor.anotar(s.usuario(), "ALTA_CATALOGO", tipo.name(), e.getId(), nombre);
        return Elemento.de(e);
    }

    @Transactional
    public Elemento editar(SesionActual s, Tipo tipo, Long id, ElementoPeticion p) {
        s.exigir(Permiso.GESTIONAR_CATALOGOS);
        ElementoCatalogo e = repositorio(tipo).findById(id)
                .orElseThrow(() -> ApiExcepcion.noEncontrado(tipo.articulo));

        String nombre = p.nombre().trim();
        exigirNombreLibre(tipo, nombre, id);

        e.setNombre(nombre);
        e.setObservaciones(Texto.opcional(p.observaciones()));
        if (p.activo() != null) e.setActivo(p.activo());
        if (e instanceof UnidadMedida u) u.setCodigo(codigoUnidad(p.codigo(), id));

        auditor.anotar(s.usuario(), "EDICION_CATALOGO", tipo.name(), id,
                nombre + (e.isActivo() ? "" : " · desactivado"));
        return Elemento.de(e);
    }

    @Transactional
    public BasculaDto editarBascula(SesionActual s, BasculaPeticion p) {
        s.exigir(Permiso.GESTIONAR_CATALOGOS);
        Bascula b = basculaActiva();
        b.setMarca(p.marca().trim());
        b.setModelo(p.modelo().trim());
        b.setCapacidadKg(p.capacidadKg().setScale(1, RoundingMode.HALF_UP));
        b.setDivisionKg(p.divisionKg().setScale(2, RoundingMode.HALF_UP));
        b.setArea(p.areaId() == null ? null : areaActiva("areaId", p.areaId()));

        auditor.anotar(s.usuario(), "EDICION_BASCULA", "bascula", b.getId(),
                b.modeloCompleto() + " · " + b.getCapacidadKg().toPlainString() + " kg");
        return BasculaDto.de(b);
    }

    /* ====================================================================
     *  Apoyo
     * ==================================================================*/

    @SuppressWarnings("unchecked")
    private CatalogoRepositorio<ElementoCatalogo> repositorio(Tipo tipo) {
        Supplier<CatalogoRepositorio<?>> r = switch (tipo) {
            case areas -> () -> areas;
            case productos -> () -> productos;
            case materias -> () -> materias;
            case unidades -> () -> unidades;
        };
        return (CatalogoRepositorio<ElementoCatalogo>) r.get();
    }

    private ElementoCatalogo guardar(Tipo tipo, ElementoCatalogo e) {
        return repositorio(tipo).saveAndFlush(e);
    }

    private void exigirNombreLibre(Tipo tipo, String nombre, Long id) {
        // Las unidades pueden repetir nombre; lo único es su código.
        if (tipo == Tipo.unidades) return;
        var repo = repositorio(tipo);
        boolean ocupado = id == null ? repo.existsByNombreIgnoreCase(nombre)
                                     : repo.existsByNombreIgnoreCaseAndIdNot(nombre, id);
        if (ocupado) {
            String un = tipo.articulo.startsWith("La") ? "una " : "un ";
            throw ApiExcepcion.validacion("nombre", "Ya existe " + un + tipo.nombre + " con ese nombre");
        }
    }

    private String codigoUnidad(String codigo, Long id) {
        String c = Texto.obligatorio("codigo", codigo, "Indica el código de la unidad (kg, pie, und…)");
        boolean ocupado = id == null ? unidades.existsByCodigoIgnoreCase(c)
                                     : unidades.existsByCodigoIgnoreCaseAndIdNot(c, id);
        if (ocupado) throw ApiExcepcion.validacion("codigo", "Ya existe una unidad con el código «" + c + "»");
        return c;
    }
}
