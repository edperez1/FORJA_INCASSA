package ni.com.incasa.pesaje;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * El contrato de js/api.js, de punta a punta: controlador → servicio → JPA →
 * esquema de Flyway. Si una de estas pruebas se rompe, el frontend se rompe.
 *
 * Todas comparten una base H2: el propietario se crea una vez y cada prueba
 * crea sus propios usuarios y producciones con nombres únicos.
 */
@SpringBootTest
@ActiveProfiles("test")
class ContratoApiTest {

    private static final AtomicInteger SEC = new AtomicInteger();
    private static final String CODIGO_INSTALACION = "INCASA-2026";
    private static final String CLAVE = "clave-segura-1";

    /** Token del propietario, creado por la primera prueba que lo necesite. */
    private static String propietario;

    @Autowired WebApplicationContext contexto;
    @Autowired JdbcTemplate jdbc;

    MockMvc mvc;

    @BeforeEach
    void preparar() throws Exception {
        mvc = MockMvcBuilders.webAppContextSetup(contexto).build();
        if (propietario == null) {
            propietario = tokenDe(configurar("dueno", CODIGO_INSTALACION).andExpect(status().isCreated()));
        }
    }

    /* ====================================================================
     *  Configuración inicial y acceso
     * ==================================================================*/

    @Test
    void laConfiguracionInicialSoloOcurreUnaVez() throws Exception {
        mvc.perform(get("/api/auth/estado"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requiereConfiguracion").value(false));

        configurar("otro_dueno", CODIGO_INSTALACION)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("YA_CONFIGURADO"));

        // No hay registro público.
        mvc.perform(post("/api/auth/registro").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + propietario))
                .andExpect(jsonPath("$.usuario.rol").value("PROPIETARIO"))
                .andExpect(jsonPath("$.usuario.rolNombre").value("Propietario del sistema"))
                .andExpect(jsonPath("$.usuario.nombre").value("Dueño Del Sistema"))
                .andExpect(jsonPath("$.usuario.permisos", hasItem("GESTIONAR_ADMINISTRADORES")))
                .andExpect(jsonPath("$.usuario.claveHash").doesNotExist());
    }

    @Test
    void loginCorrectoIncorrectoYCuentaInactiva() throws Exception {
        String usuario = crearUsuario(propietario, "OPERARIO");

        login(usuario, "equivocada")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("CREDENCIALES_INVALIDAS"));
        login("nadie_" + usuario, CLAVE).andExpect(status().isUnauthorized());

        String token = tokenDe(login(usuario.toUpperCase(), CLAVE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.rol").value("OPERARIO"))
                .andExpect(jsonPath("$.usuario.permisos", containsInAnyOrder("PESAR", "TERMINAR_PRODUCCION", "CONSULTAR"))));

        long id = idUsuario(usuario);
        conToken(put("/api/usuarios/" + id), propietario, Map.of(
                "nombres", "Op", "apellidos", "Inactivo", "rol", "OPERARIO", "activo", false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activo").value(false));

        // Desactivar cierra sus sesiones al instante y le impide volver a entrar.
        mvc.perform(get("/api/usuarios/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
        login(usuario, CLAVE)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("CUENTA_INACTIVA"));
    }

    @Test
    void sinTokenEs401() throws Exception {
        mvc.perform(get("/api/usuarios/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("SESION_INVALIDA"));
        mvc.perform(get("/api/catalogos")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/pesajes").header("Authorization", "Bearer inventado"))
                .andExpect(status().isUnauthorized());
    }

    /* ====================================================================
     *  Jerarquía de cuentas
     * ==================================================================*/

    @Test
    void administradorGestionaUsuariosPeroNoAdministradores() throws Exception {
        String admin = tokenDe(login(crearUsuario(propietario, "ADMINISTRADOR"), CLAVE));

        // Roles que ofrece el panel: el admin no ve «Administrador».
        conToken(get("/api/usuarios/roles"), admin, null)
                .andExpect(jsonPath("$[*].codigo", contains("SUPERVISOR", "OPERARIO", "CALIDAD")));
        conToken(get("/api/usuarios/roles"), propietario, null)
                .andExpect(jsonPath("$[*].codigo", contains("ADMINISTRADOR", "SUPERVISOR", "OPERARIO", "CALIDAD")));

        String operario = crearUsuario(admin, "SUPERVISOR");
        assertThat(operario).isNotBlank();

        conToken(post("/api/usuarios"), admin, alta("ADMINISTRADOR"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("SIN_PERMISO"));
        conToken(post("/api/usuarios"), propietario, alta("PROPIETARIO"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.rol").exists());

        // Un admin no toca a otro admin ni al propietario, ni se gestiona a sí mismo.
        long otroAdmin = idUsuario(crearUsuario(propietario, "ADMINISTRADOR"));
        conToken(put("/api/usuarios/" + otroAdmin), admin, edicion("ADMINISTRADOR"))
                .andExpect(status().isForbidden());
        conToken(put("/api/usuarios/" + idUsuario("dueno")), admin, edicion("OPERARIO"))
                .andExpect(status().isForbidden());
        long propio = JsonPath.<Integer>read(conToken(get("/api/usuarios/me"), admin, null)
                .andReturn().getResponse().getContentAsString(), "$.usuario.id");
        conToken(put("/api/usuarios/" + propio), admin, edicion("OPERARIO"))
                .andExpect(status().isForbidden());

        // Ascender a alguien a administrador también es cosa del propietario.
        long sup = idUsuario(operario);
        conToken(put("/api/usuarios/" + sup), admin, edicion("ADMINISTRADOR")).andExpect(status().isForbidden());
        conToken(put("/api/usuarios/" + sup), propietario, edicion("ADMINISTRADOR"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rol").value("ADMINISTRADOR"));

        // El operario no gestiona a nadie.
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        conToken(get("/api/usuarios"), op, null).andExpect(status().isForbidden());
    }

    @Test
    void restablecerYCambiarClave() throws Exception {
        String usuario = crearUsuario(propietario, "OPERARIO");
        String tokenA = tokenDe(login(usuario, CLAVE));
        String tokenB = tokenDe(login(usuario, CLAVE));

        conToken(put("/api/usuarios/me/clave"), tokenA, Map.of("claveActual", "mal", "claveNueva", "clave-nueva-2"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("CLAVE_ACTUAL_INVALIDA"));
        conToken(put("/api/usuarios/me/clave"), tokenA, Map.of("claveActual", CLAVE, "claveNueva", "clave-nueva-2"))
                .andExpect(status().isNoContent());
        conToken(get("/api/usuarios/me"), tokenB, null).andExpect(status().isUnauthorized());
        conToken(get("/api/usuarios/me"), tokenA, null).andExpect(status().isOk());

        conToken(put("/api/usuarios/" + idUsuario(usuario) + "/clave"), propietario, Map.of("claveNueva", "restablecida-3"))
                .andExpect(status().isNoContent());
        conToken(get("/api/usuarios/me"), tokenA, null).andExpect(status().isUnauthorized());
        login(usuario, "restablecida-3").andExpect(status().isOk());
    }

    @Test
    void perfilPropioSinRol() throws Exception {
        String token = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        conToken(put("/api/usuarios/me"), token, Map.of(
                "nombres", "Ana", "apellidos", "Castillo", "correo", "ana@incasa.com.ni", "rol", "ADMINISTRADOR"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usuario.nombre").value("Ana Castillo"))
                .andExpect(jsonPath("$.usuario.rol").value("OPERARIO"));
    }

    /* ====================================================================
     *  Catálogos
     * ==================================================================*/

    @Test
    void catalogosLecturaYAdministracion() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        String admin = tokenDe(login(crearUsuario(propietario, "ADMINISTRADOR"), CLAVE));

        conToken(get("/api/catalogos"), op, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.productos[*].nombre", hasItem("Clavos")))
                .andExpect(jsonPath("$.areas[*].nombre", hasItem("Refinado")))
                .andExpect(jsonPath("$.unidades[*].codigo", hasItems("kg", "pie", "und")))
                .andExpect(jsonPath("$.bascula.codigo").value("BASC-01"))
                .andExpect(jsonPath("$.bascula.modeloCompleto").value("Hiweight X10"))
                .andExpect(jsonPath("$.bascula.capacidadKg").value(4600.0));

        conToken(get("/api/catalogos").param("todos", "true"), op, null).andExpect(status().isForbidden());
        conToken(post("/api/catalogos/areas"), op, Map.of("nombre", "Clavos")).andExpect(status().isForbidden());

        String nombre = "Área " + SEC.incrementAndGet();
        long id = idDe(conToken(post("/api/catalogos/areas"), admin, Map.of("nombre", nombre))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.activo").value(true)));
        conToken(post("/api/catalogos/areas"), admin, Map.of("nombre", nombre.toUpperCase()))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.nombre").exists());
        conToken(post("/api/catalogos/unidades"), admin, Map.of("nombre", "Rollo"))
                .andExpect(jsonPath("$.campos.codigo").exists());
        conToken(post("/api/catalogos/cosas"), admin, Map.of("nombre", "x")).andExpect(status().isNotFound());

        // Desactivado: sale de los formularios pero sigue en el panel.
        conToken(put("/api/catalogos/areas/" + id), admin, Map.of("nombre", nombre, "activo", false))
                .andExpect(jsonPath("$.activo").value(false));
        conToken(get("/api/catalogos"), op, null).andExpect(jsonPath("$.areas[*].nombre", not(hasItem(nombre))));
        conToken(get("/api/catalogos").param("todos", "true"), admin, null)
                .andExpect(jsonPath("$.areas[*].nombre", hasItem(nombre)));
    }

    /* ====================================================================
     *  Producción y pesajes
     * ==================================================================*/

    @Test
    void cicloCompletoDeUnaProduccion() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        long prod = abrirProduccion();

        conToken(get("/api/producciones/" + prod), op, null)
                .andExpect(jsonPath("$.produccion.estado").value("PROCESO"))
                .andExpect(jsonPath("$.produccion.codigo").value(matchesPattern("PR-\\d{6}")))
                .andExpect(jsonPath("$.produccion.producto").value("Clavos"))
                .andExpect(jsonPath("$.produccion.areaProceso").value("Refinado"))
                .andExpect(jsonPath("$.produccion.unidad").value("kg"))
                .andExpect(jsonPath("$.produccion.kgEntrada").value(0.0))
                .andExpect(jsonPath("$.produccion.mermaKg").doesNotExist())
                .andExpect(jsonPath("$.pesajes", hasSize(0)));

        // Terminar sin pesajes no se puede.
        conToken(post("/api/producciones/" + prod + "/terminar"), op, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("FALTA_ENTRADA"));

        // La entrada exige el código de bobina.
        Map<String, Object> sinBobina = pesaje(prod, "ENTRADA", 2043.0, 28.5);
        sinBobina.remove("codigoBobina");
        conToken(post("/api/pesajes"), op, sinBobina)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.codigoBobina").exists());

        Map<String, Object> entrada = pesaje(prod, "ENTRADA", 2043.0, 28.5);
        entrada.put("operario", "Alguien Falso");   // sale de la sesión
        entrada.put("pesoNeto", 1.0);               // se recalcula
        conToken(post("/api/pesajes"), op, entrada)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.folio").value(matchesPattern("CP-\\d{6}")))
                .andExpect(jsonPath("$.tipo").value("ENTRADA"))
                .andExpect(jsonPath("$.pesoNeto").value(2014.5))
                .andExpect(jsonPath("$.operario").value(not("Alguien Falso")))
                .andExpect(jsonPath("$.bascula").value("BASC-01"))
                .andExpect(jsonPath("$.modeloBascula").value("Hiweight X10"))
                .andExpect(jsonPath("$.producto").value("Clavos"))
                .andExpect(jsonPath("$.areaDestino").exists())
                .andExpect(jsonPath("$.observaciones").doesNotExist());

        conToken(post("/api/producciones/" + prod + "/terminar"), op, null)
                .andExpect(jsonPath("$.error").value("FALTA_SALIDA"));

        Map<String, Object> salida = pesaje(prod, "SALIDA", 1990.0, 12.0);
        salida.remove("codigoBobina");
        conToken(post("/api/pesajes"), op, salida).andExpect(status().isCreated());

        conToken(post("/api/producciones/" + prod + "/terminar"), op, Map.of("observaciones", "Sin novedad"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("TERMINADO"))
                .andExpect(jsonPath("$.finEn").isNotEmpty())
                .andExpect(jsonPath("$.kgEntrada").value(2014.5))
                .andExpect(jsonPath("$.kgSalida").value(1978.0))
                .andExpect(jsonPath("$.mermaKg").value(36.5))
                .andExpect(jsonPath("$.rendimiento").value(98.2))
                .andExpect(jsonPath("$.bobinas", contains("BOB-" + prod)))
                .andExpect(jsonPath("$.observaciones").value("Cierre: Sin novedad"));

        // Terminada: ya no admite pesajes ni se vuelve a terminar.
        conToken(post("/api/pesajes"), op, pesaje(prod, "SALIDA", 100.0, 0.0))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("PRODUCCION_CERRADA"));
        conToken(post("/api/producciones/" + prod + "/terminar"), op, null)
                .andExpect(status().isConflict());
    }

    @Test
    void reglasDePeso() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        long prod = abrirProduccion();

        Map<String, Object> simulado = pesaje(prod, "ENTRADA", 2000.0, 10.0);
        simulado.put("origenLectura", "simulador");
        conToken(post("/api/pesajes"), op, simulado).andExpect(jsonPath("$.campos.origenLectura").exists());

        conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 2000.0, 2000.0))
                .andExpect(jsonPath("$.campos.tara").exists());
        conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 4600.5, 0.0))
                .andExpect(jsonPath("$.campos.pesoBruto").exists());
        conToken(post("/api/pesajes"), op, pesaje(prod, "PESADO", 100.0, 0.0))
                .andExpect(jsonPath("$.campos.tipo").exists());

        Map<String, Object> inestable = pesaje(prod, "ENTRADA", 2000.0, 10.0);
        inestable.put("estable", false);
        conToken(post("/api/pesajes"), op, inestable).andExpect(jsonPath("$.campos.estable").exists());

        Map<String, Object> manual = pesaje(prod, "ENTRADA", 2000.0, 10.0);
        manual.put("origenLectura", "manual");
        manual.put("estable", false);
        conToken(post("/api/pesajes"), op, manual)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.origenLectura").value("manual"));

        conToken(post("/api/pesajes"), op, pesaje(987654321L, "ENTRADA", 100.0, 0.0))
                .andExpect(jsonPath("$.campos.produccionId").exists());
    }

    @Test
    void permisosDeOperacion() throws Exception {
        String calidad = tokenDe(login(crearUsuario(propietario, "CALIDAD"), CLAVE));
        String admin = tokenDe(login(crearUsuario(propietario, "ADMINISTRADOR"), CLAVE));
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        String sup = tokenDe(login(crearUsuario(propietario, "SUPERVISOR"), CLAVE));

        // Sólo el administrador (y el propietario) abre producciones; el operario pesa y termina.
        conToken(post("/api/producciones"), calidad, datosProduccion()).andExpect(status().isForbidden());
        conToken(post("/api/producciones"), op, datosProduccion()).andExpect(status().isForbidden());
        long delAdmin = idDe(conToken(post("/api/producciones"), admin, datosProduccion())
                .andExpect(status().isCreated()));
        conToken(post("/api/pesajes"), admin, pesaje(delAdmin, "ENTRADA", 500.0, 0.0))
                .andExpect(status().isForbidden());
        conToken(get("/api/producciones"), calidad, null).andExpect(status().isOk());

        long prod = abrirProduccion();
        long pesajeId = idDe(conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 2000.0, 20.0)));

        // El operario pesa, pero no corrige ni anula.
        conToken(put("/api/pesajes/" + pesajeId), op, Map.of("observaciones", "x")).andExpect(status().isForbidden());
        conToken(delete("/api/pesajes/" + pesajeId), op, null).andExpect(status().isForbidden());

        // El supervisor corrige lo identificable; el peso no se toca.
        conToken(put("/api/pesajes/" + pesajeId), sup, Map.of(
                "codigoBobina", "BOB-CORREGIDA", "observaciones", "Etiqueta mal leída", "pesoNeto", 1.0))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.codigoBobina").value("BOB-CORREGIDA"))
                .andExpect(jsonPath("$.pesoNeto").value(1980.0))
                .andExpect(jsonPath("$.modificadoPor").exists());
        conToken(put("/api/pesajes/" + pesajeId), sup, Map.of("codigoBobina", " "))
                .andExpect(jsonPath("$.campos.codigoBobina").exists());

        // No se anula una producción con pesajes vigentes.
        conToken(post("/api/producciones/" + prod + "/anular"), sup, Map.of("motivo", "Error"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("PRODUCCION_CON_PESAJES"));

        conToken(delete("/api/pesajes/" + pesajeId).param("motivo", "Bobina equivocada"), sup, null)
                .andExpect(status().isNoContent());
        conToken(get("/api/pesajes/" + pesajeId), sup, null).andExpect(status().isNotFound());
        Map<String, Object> fila = jdbc.queryForMap(
                "SELECT motivo_anulacion, peso_neto FROM pesaje WHERE id = ?", pesajeId);
        assertThat(fila.get("motivo_anulacion")).isEqualTo("Bobina equivocada");
        assertThat(((Number) fila.get("peso_neto")).doubleValue()).isEqualTo(1980.0);

        conToken(post("/api/producciones/" + prod + "/anular"), sup, Map.of())
                .andExpect(jsonPath("$.campos.motivo").exists());
        conToken(post("/api/producciones/" + prod + "/anular"), sup, Map.of("motivo", "Abierta por error"))
                .andExpect(status().isNoContent());
        conToken(get("/api/producciones/" + prod), sup, null).andExpect(status().isNotFound());

        // Todo quedó en la auditoría; el operario no la ve.
        conToken(get("/api/auditoria"), admin, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].accion", hasItems("ANULAR_PESAJE", "ANULAR_PRODUCCION", "EDICION_PESAJE")));
        conToken(get("/api/auditoria"), op, null).andExpect(status().isForbidden());
    }

    @Test
    void historialConFiltrosYTotales() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        long prod = abrirProduccion();
        String marca = "LOTE_" + SEC.incrementAndGet();

        for (int i = 0; i < 2; i++) {
            Map<String, Object> e = pesaje(prod, "ENTRADA", 1000.0, 0.0);
            e.put("codigoBobina", marca + "-" + i);
            conToken(post("/api/pesajes"), op, e).andExpect(status().isCreated());
        }
        Map<String, Object> s = pesaje(prod, "SALIDA", 900.0, 0.0);
        s.put("codigoBobina", marca + "-S");
        conToken(post("/api/pesajes"), op, s).andExpect(status().isCreated());

        conToken(get("/api/pesajes").param("buscar", marca.toLowerCase()), op, null)
                .andExpect(jsonPath("$.datos", hasSize(3)))
                .andExpect(jsonPath("$.meta.total").value(3))
                .andExpect(jsonPath("$.meta.totales.entradaKg").value(2000.0))
                .andExpect(jsonPath("$.meta.totales.salidaKg").value(900.0));

        conToken(get("/api/pesajes").param("produccionId", String.valueOf(prod)).param("tipo", "ENTRADA"), op, null)
                .andExpect(jsonPath("$.meta.total").value(2));

        // «_» literal: LOTEX… no casa con LOTE_…
        conToken(get("/api/pesajes").param("buscar", marca.replace('_', 'X')), op, null)
                .andExpect(jsonPath("$.meta.total").value(0));

        String hoy = LocalDate.now(ZoneId.of("America/Managua")).toString();
        String manana = LocalDate.parse(hoy).plusDays(1).toString();
        conToken(get("/api/pesajes").param("buscar", marca).param("desde", hoy).param("hasta", hoy), op, null)
                .andExpect(jsonPath("$.meta.total").value(3));
        conToken(get("/api/pesajes").param("buscar", marca).param("desde", manana), op, null)
                .andExpect(jsonPath("$.meta.total").value(0));

        conToken(get("/api/pesajes").param("buscar", marca).param("porPagina", "2").param("pagina", "2"), op, null)
                .andExpect(jsonPath("$.datos", hasSize(1)))
                .andExpect(jsonPath("$.meta.total").value(3));

        conToken(get("/api/producciones").param("estado", "PROCESO"), op, null)
                .andExpect(jsonPath("$[?(@.id == " + prod + ")].kgEntrada", contains(2000.0)))
                .andExpect(jsonPath("$[?(@.id == " + prod + ")].bobinas[*]", hasSize(2)));
    }

    /* ====================================================================
     *  Permisos editables y cantidad producida
     * ==================================================================*/

    @Test
    void elPropietarioDecideLosPermisosDeCadaRol() throws Exception {
        String admin = tokenDe(login(crearUsuario(propietario, "ADMINISTRADOR"), CLAVE));

        conToken(get("/api/permisos"), propietario, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.permisos[?(@.codigo == 'GESTIONAR_PERMISOS')].fijo", contains(true)))
                .andExpect(jsonPath("$.roles[?(@.codigo == 'PROPIETARIO')].editable", contains(false)))
                .andExpect(jsonPath("$.roles[?(@.codigo == 'ADMINISTRADOR')].permisos[*]", hasItem("ABRIR_PRODUCCION")));
        conToken(get("/api/permisos"), admin, null).andExpect(status().isForbidden());

        long prod = abrirProduccion();
        conToken(post("/api/pesajes"), admin, pesaje(prod, "ENTRADA", 800.0, 0.0)).andExpect(status().isForbidden());

        // El propietario le da «Pesar» al administrador: aplica en el acto, sin volver a entrar.
        java.util.List<String> conPesar = java.util.List.of(
                "ABRIR_PRODUCCION", "PESAR", "CONSULTAR", "GESTIONAR_USUARIOS", "GESTIONAR_CATALOGOS", "VER_AUDITORIA");
        conToken(put("/api/permisos/ADMINISTRADOR"), propietario, Map.of("permisos", conPesar))
                .andExpect(status().isOk());
        try {
            conToken(post("/api/pesajes"), admin, pesaje(prod, "ENTRADA", 800.0, 0.0)).andExpect(status().isCreated());
            conToken(get("/api/usuarios/me"), admin, null).andExpect(jsonPath("$.usuario.permisos", hasItem("PESAR")));
        } finally {
            conToken(put("/api/permisos/ADMINISTRADOR"), propietario, Map.of("permisos", java.util.List.of(
                    "ABRIR_PRODUCCION", "CONSULTAR", "GESTIONAR_USUARIOS", "GESTIONAR_CATALOGOS", "VER_AUDITORIA")))
                    .andExpect(status().isOk());
        }
        conToken(post("/api/pesajes"), admin, pesaje(prod, "ENTRADA", 800.0, 0.0)).andExpect(status().isForbidden());

        // Lo exclusivo del propietario no se reparte, y a él no se le toca.
        conToken(put("/api/permisos/SUPERVISOR"), propietario, Map.of("permisos", java.util.List.of("GESTIONAR_PERMISOS")))
                .andExpect(status().isUnprocessableContent());
        conToken(put("/api/permisos/PROPIETARIO"), propietario, Map.of("permisos", java.util.List.of()))
                .andExpect(status().isUnprocessableContent());
        conToken(put("/api/permisos/OPERARIO"), admin, Map.of("permisos", java.util.List.of("PESAR")))
                .andExpect(status().isForbidden());

        conToken(get("/api/auditoria"), propietario, null)
                .andExpect(jsonPath("$[*].accion", hasItem("EDICION_PERMISOS")));
    }

    @Test
    void cantidadProducidaPorSalida() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));

        // En kg, la salida produce su propio neto sin escribirlo.
        long enKg = abrirProduccion();
        conToken(post("/api/pesajes"), op, pesaje(enKg, "ENTRADA", 1000.0, 0.0)).andExpect(status().isCreated());
        Map<String, Object> salidaKg = pesaje(enKg, "SALIDA", 960.5, 0.5);
        salidaKg.remove("codigoBobina");
        conToken(post("/api/pesajes"), op, salidaKg)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cantidad").value(960.0))
                .andExpect(jsonPath("$.unidadProduccion").value("kg"));
        conToken(get("/api/producciones/" + enKg), op, null)
                .andExpect(jsonPath("$.produccion.cantidadProducida").value(960.0))
                .andExpect(jsonPath("$.produccion.avance").value(48.0));

        // En unidades (clavos), hay que contarla.
        Map<String, Object> datos = datosProduccion();
        datos.put("cantidad", 50000);
        datos.put("unidadId", jdbc.queryForObject("SELECT id FROM unidad_medida WHERE codigo = 'und'", Long.class));
        long enUnidades = idDe(conToken(post("/api/producciones"), propietario, datos).andExpect(status().isCreated()));
        conToken(post("/api/pesajes"), op, pesaje(enUnidades, "ENTRADA", 2043.0, 28.5)).andExpect(status().isCreated());

        Map<String, Object> sinCantidad = pesaje(enUnidades, "SALIDA", 1990.0, 12.0);
        sinCantidad.remove("codigoBobina");
        conToken(post("/api/pesajes"), op, sinCantidad)
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.cantidad").exists());

        Map<String, Object> conCantidad = new HashMap<>(sinCantidad);
        conCantidad.put("cantidad", 40000);
        long salida = idDe(conToken(post("/api/pesajes"), op, conCantidad)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cantidad").value(40000.0))
                .andExpect(jsonPath("$.unidadProduccion").value("und")));

        // Una entrada no lleva cantidad aunque se envíe.
        Map<String, Object> entradaConCantidad = pesaje(enKg, "ENTRADA", 100.0, 0.0);
        entradaConCantidad.put("cantidad", 5);
        conToken(post("/api/pesajes"), op, entradaConCantidad)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cantidad").doesNotExist());

        conToken(post("/api/producciones/" + enUnidades + "/terminar"), op, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cantidadProducida").value(40000.0))
                .andExpect(jsonPath("$.avance").value(80.0));

        // El supervisor corrige la cuenta si se contó mal.
        String sup = tokenDe(login(crearUsuario(propietario, "SUPERVISOR"), CLAVE));
        conToken(put("/api/pesajes/" + salida), sup, Map.of("cantidad", 41000))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cantidad").value(41000.0));
        conToken(get("/api/producciones/" + enUnidades), sup, null)
                .andExpect(jsonPath("$.produccion.cantidadProducida").value(41000.0));
    }

    /* ====================================================================
     *  Reglas de peso y cierre de una producción
     * ==================================================================*/

    /** Producción en unidades con la cantidad pedida dada; devuelve su id. */
    private long abrirEnUnidades(int cantidad) throws Exception {
        Map<String, Object> datos = datosProduccion();
        datos.put("cantidad", cantidad);
        datos.put("unidadId", jdbc.queryForObject("SELECT id FROM unidad_medida WHERE codigo = 'und'", Long.class));
        return idDe(conToken(post("/api/producciones"), propietario, datos).andExpect(status().isCreated()));
    }

    private Map<String, Object> salida(long prod, double bruto, Integer cantidad) {
        Map<String, Object> m = pesaje(prod, "SALIDA", bruto, 0.0);
        m.remove("codigoBobina");
        if (cantidad != null) m.put("cantidad", cantidad);
        return m;
    }

    @Test
    void laSalidaNuncaPesaMasQueLaEntrada() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        String sup = tokenDe(login(crearUsuario(propietario, "SUPERVISOR"), CLAVE));
        long prod = abrirEnUnidades(10000);

        // Sin entrada no hay salida.
        conToken(post("/api/pesajes"), op, salida(prod, 500.0, 10))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.tipo").exists());

        long entrada = idDe(conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 1000.0, 0.0))
                .andExpect(status().isCreated()));
        conToken(post("/api/pesajes"), op, salida(prod, 600.0, 10)).andExpect(status().isCreated());

        // 600 + 401 = 1001 kg > 1000 kg de entrada.
        conToken(post("/api/pesajes"), op, salida(prod, 401.0, 10))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.pesoBruto", containsString("quedan 400.0 kg")));
        conToken(post("/api/pesajes"), op, salida(prod, 390.0, 10)).andExpect(status().isCreated());

        // Anular la bobina dejaría la salida pesando más que la entrada.
        conToken(delete("/api/pesajes/" + entrada), sup, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("SALIDA_SUPERA_ENTRADA"));
    }

    @Test
    void alcanzarLaCantidadCierraLaProduccionYAvisaDelExceso() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        long prod = abrirEnUnidades(500);
        conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 1000.0, 0.0)).andExpect(status().isCreated());

        // Una salida parcial no cierra nada.
        conToken(post("/api/pesajes"), op, salida(prod, 600.0, 300))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cierre").doesNotExist());

        // La que completa lo pedido (300 + 220 = 520 de 500) la cierra, con 20 de exceso.
        conToken(post("/api/pesajes"), op, salida(prod, 395.0, 220))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cierre.alcanzada").value(true))
                .andExpect(jsonPath("$.cierre.terminada").value(true))
                .andExpect(jsonPath("$.cierre.exceso").value(20.0))
                .andExpect(jsonPath("$.cierre.unidad").value("und"))
                .andExpect(jsonPath("$.cierre.mensaje", containsString("20 und de exceso")))
                .andExpect(jsonPath("$.produccionEstado").value("TERMINADO"));

        conToken(get("/api/producciones/" + prod), op, null)
                .andExpect(jsonPath("$.produccion.estado").value("TERMINADO"))
                .andExpect(jsonPath("$.produccion.exceso").value(20.0))
                .andExpect(jsonPath("$.produccion.mermaPct").value(0.5))
                .andExpect(jsonPath("$.produccion.observaciones", containsString("exceso de 20 und")));

        conToken(post("/api/pesajes"), op, salida(prod, 1.0, 1)).andExpect(status().isConflict());
        conToken(get("/api/auditoria"), propietario, null)
                .andExpect(jsonPath("$[*].accion", hasItem("TERMINAR_AUTOMATICA")));
    }

    @Test
    void laMermaMayorDelDosPorCientoNoSeCierraSinSupervisor() throws Exception {
        String op = tokenDe(login(crearUsuario(propietario, "OPERARIO"), CLAVE));
        String sup = tokenDe(login(crearUsuario(propietario, "SUPERVISOR"), CLAVE));
        long prod = abrirEnUnidades(100);
        conToken(post("/api/pesajes"), op, pesaje(prod, "ENTRADA", 1000.0, 0.0)).andExpect(status().isCreated());

        // Alcanza la cantidad, pero con 5 % de merma: avisa y NO cierra.
        conToken(post("/api/pesajes"), op, salida(prod, 950.0, 100))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cierre.alcanzada").value(true))
                .andExpect(jsonPath("$.cierre.terminada").value(false))
                .andExpect(jsonPath("$.cierre.mermaPct").value(5.0));
        conToken(get("/api/producciones/" + prod), op, null)
                .andExpect(jsonPath("$.produccion.estado").value("PROCESO"))
                .andExpect(jsonPath("$.produccion.mermaMaximaPct").value(2.0));

        // El operario no puede cerrarla, ni forzándola.
        conToken(post("/api/producciones/" + prod + "/terminar"), op, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("MERMA_FUERA_DE_TOLERANCIA"));
        conToken(post("/api/producciones/" + prod + "/terminar"), op, Map.of("forzar", true, "observaciones", "x"))
                .andExpect(status().isForbidden());

        // El supervisor sí, pero justificándolo.
        conToken(post("/api/producciones/" + prod + "/terminar"), sup, Map.of("forzar", true))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.campos.observaciones").exists());
        conToken(post("/api/producciones/" + prod + "/terminar"), sup,
                        Map.of("forzar", true, "observaciones", "Bobina con óxido: se descartó una capa"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.estado").value("TERMINADO"))
                .andExpect(jsonPath("$.observaciones", containsString("fuera de tolerancia")));

        conToken(get("/api/auditoria"), propietario, null)
                .andExpect(jsonPath("$[*].accion", hasItem("TERMINAR_FUERA_TOLERANCIA")));
    }

    /* ====================================================================
     *  Errores genéricos
     * ==================================================================*/

    @Test
    void erroresConElCuerpoDelContrato() throws Exception {
        conToken(get("/api/no-existe"), propietario, null)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NO_ENCONTRADO"));
        mvc.perform(post("/api/pesajes").header("Authorization", "Bearer " + propietario)
                        .contentType(MediaType.APPLICATION_JSON).content("{ no es json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("PETICION_INVALIDA"));
        conToken(get("/api/pesajes/abc"), propietario, null)
                .andExpect(status().isBadRequest());
        conToken(get("/api/pesajes/1/certificado"), propietario, null)
                .andExpect(status().isNotImplemented());

        // Como lo pide el navegador: el 501 debe llegar íntegro aunque el
        // cliente sólo acepte PDF, o js/api.js no sabe que tiene que usar jsPDF.
        mvc.perform(get("/api/pesajes/1/certificado").header("Authorization", "Bearer " + propietario)
                        .accept(MediaType.APPLICATION_PDF))
                .andExpect(status().isNotImplemented())
                .andExpect(jsonPath("$.error").value("NO_IMPLEMENTADO"));
        mvc.perform(post("/api/reportes/pesajes.pdf").header("Authorization", "Bearer " + propietario)
                        .accept(MediaType.APPLICATION_PDF).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotImplemented());
        mvc.perform(get("/api/pesajes/1/ticket").accept(MediaType.APPLICATION_PDF))
                .andExpect(status().isUnauthorized());
    }

    /* ====================================================================
     *  Utilidades
     * ==================================================================*/

    private ResultActions configurar(String usuario, String codigo) throws Exception {
        return mvc.perform(post("/api/auth/configuracion").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("usuario", usuario, "nombres", "Dueño", "apellidos", "Del Sistema",
                        "clave", CLAVE, "codigoInstalacion", codigo))));
    }

    private ResultActions login(String usuario, String clave) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("usuario", usuario, "clave", clave))));
    }

    private ResultActions conToken(MockHttpServletRequestBuilder peticion, String token,
                                   Map<String, ?> cuerpo) throws Exception {
        peticion.header("Authorization", "Bearer " + token);
        if (cuerpo != null) peticion.contentType(MediaType.APPLICATION_JSON).content(json(cuerpo));
        return mvc.perform(peticion);
    }

    private Map<String, Object> alta(String rol) {
        return Map.of("usuario", "u" + SEC.incrementAndGet() + "_" + (System.nanoTime() % 100000),
                "nombres", "Prueba", "apellidos", "Rol " + rol, "rol", rol, "clave", CLAVE);
    }

    private static Map<String, Object> edicion(String rol) {
        return Map.of("nombres", "Editado", "apellidos", "Por Prueba", "rol", rol);
    }

    /** Crea una cuenta con `quien` y devuelve su nombre de usuario. */
    private String crearUsuario(String quien, String rol) throws Exception {
        Map<String, Object> a = alta(rol);
        conToken(post("/api/usuarios"), quien, a)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.rol").value(rol));
        return (String) a.get("usuario");
    }

    private long idUsuario(String usuario) {
        return jdbc.queryForObject("SELECT id FROM usuario WHERE usuario = ?", Long.class, usuario);
    }

    private Map<String, Object> datosProduccion() {
        long producto = jdbc.queryForObject("SELECT id FROM producto WHERE nombre = 'Clavos'", Long.class);
        long materia = jdbc.queryForObject("SELECT MIN(id) FROM materia", Long.class);
        long unidad = jdbc.queryForObject("SELECT id FROM unidad_medida WHERE codigo = 'kg'", Long.class);
        long area = jdbc.queryForObject("SELECT id FROM area WHERE nombre = 'Refinado'", Long.class);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ordenTrabajo", "OT-2026-1248");
        m.put("productoId", producto);
        m.put("materiaId", materia);
        m.put("cantidad", 2000);
        m.put("unidadId", unidad);
        m.put("areaProcesoId", area);
        m.put("areaDestinoId", area);
        return m;
    }

    /** Las abre el propietario: el operario, por defecto, no tiene ABRIR_PRODUCCION. */
    private long abrirProduccion() throws Exception {
        return idDe(conToken(post("/api/producciones"), propietario, datosProduccion())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estado").value("PROCESO")));
    }

    /** El cuerpo que arma App.guardar() en js/app.js. */
    private static Map<String, Object> pesaje(long produccion, String tipo, double bruto, double tara) {
        Map<String, Object> m = new HashMap<>();
        m.put("produccionId", produccion);
        m.put("tipo", tipo);
        m.put("codigoBobina", "BOB-" + produccion);
        m.put("pesoBruto", bruto);
        m.put("tara", tara);
        m.put("unidad", "kg");
        m.put("estable", true);
        m.put("origenLectura", "conectada");
        return m;
    }

    private static String tokenDe(ResultActions r) throws Exception {
        return JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.token");
    }

    private static long idDe(ResultActions r) throws Exception {
        return ((Number) JsonPath.read(r.andReturn().getResponse().getContentAsString(), "$.id")).longValue();
    }

    private static String json(Map<String, ?> m) {
        return tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(m);
    }
}
