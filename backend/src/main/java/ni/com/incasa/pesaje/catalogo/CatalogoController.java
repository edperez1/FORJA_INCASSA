package ni.com.incasa.pesaje.catalogo;

import jakarta.validation.Valid;
import ni.com.incasa.pesaje.auth.SesionActual;
import ni.com.incasa.pesaje.catalogo.CatalogoDtos.*;
import ni.com.incasa.pesaje.usuario.Permiso;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/**
 * 5 · CATÁLOGOS — espejo del bloque «5 · CATÁLOGOS» de js/api.js.
 *
 *   GET  /api/catalogos                  → { areas, productos, materias, unidades, bascula }
 *   GET  /api/catalogos?todos=true       → incluye los desactivados (panel de administración)
 *   POST /api/catalogos/{tipo}           → 201 elemento     tipo: areas|productos|materias|unidades
 *   PUT  /api/catalogos/{tipo}/{id}      → elemento
 *   PUT  /api/catalogos/bascula          → báscula activa
 */
@RestController
@RequestMapping("/api/catalogos")
public class CatalogoController {

    private final CatalogoServicio catalogos;

    public CatalogoController(CatalogoServicio catalogos) {
        this.catalogos = catalogos;
    }

    @GetMapping
    public Todos todos(SesionActual sesion, @RequestParam(defaultValue = "false") boolean todos) {
        if (todos) sesion.exigir(Permiso.GESTIONAR_CATALOGOS);
        return catalogos.todos(todos);
    }

    @PutMapping("/bascula")
    public BasculaDto editarBascula(SesionActual sesion, @Valid @RequestBody BasculaPeticion p) {
        return catalogos.editarBascula(sesion, p);
    }

    @PostMapping("/{tipo}")
    @ResponseStatus(HttpStatus.CREATED)
    public Elemento crear(SesionActual sesion, @PathVariable String tipo,
                          @Valid @RequestBody ElementoPeticion p) {
        return catalogos.crear(sesion, CatalogoServicio.Tipo.desde(tipo), p);
    }

    @PutMapping("/{tipo}/{id}")
    public Elemento editar(SesionActual sesion, @PathVariable String tipo, @PathVariable Long id,
                           @Valid @RequestBody ElementoPeticion p) {
        return catalogos.editar(sesion, CatalogoServicio.Tipo.desde(tipo), id, p);
    }
}
