# INCASA · Sistema de Pesaje

Frontend del sistema de pesaje industrial de **INCASA (Industria Centroamericana,
S.A.)**, Nicaragua. Controla el pesaje de **bobinas de alambrón** y **producto
semielaborado**, emite el **Certificado de Pesaje** de cada pesada y mantiene el
historial y los reportes gerenciales de producción.

JavaScript moderno (módulos ES) sobre **Vite**, sin framework de UI.

---

## Índice

1. [Arrancar el entorno](#1--arrancar-el-entorno-de-desarrollo)
2. [Estructura de carpetas](#2--estructura-de-carpetas)
3. [El logotipo · `public/logo-incasa.jpg`](#3--el-logotipo--publiclogo-incasajpg)
4. [Paleta corporativa](#4--paleta-corporativa)
5. [Fuente de lectura: modo real, simulador y contingencia](#5--fuente-de-lectura-modo-real-simulador-y-contingencia)
6. [Desactivar o eliminar el simulador en producción](#6--desactivar-o-eliminar-el-simulador-en-producción)
7. [Contratos REST y WebSocket · `js/api.js`](#7--contratos-rest-y-websocket--jsapijs)
8. [Conectar con el backend en Java · paso a paso](#8--conectar-con-el-backend-en-java--paso-a-paso)
9. [Referencia de endpoints](#9--referencia-de-endpoints)
10. [Documentos generados](#10--documentos-generados)
11. [Reglas del dominio](#11--reglas-del-dominio)

---

## 1 · Arrancar el entorno de desarrollo

Requisitos: **Node 18 o superior** y **pnpm**.

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar el servidor de desarrollo
pnpm dev
```

Abre **http://localhost:5173**. Vite recarga en caliente al guardar cualquier
archivo.

| Comando        | Qué hace                                                       |
|----------------|----------------------------------------------------------------|
| `pnpm dev`     | Servidor de desarrollo con recarga en caliente (puerto 5173)    |
| `pnpm build`   | Compila a `dist/`, listo para servir desde el JAR de Java       |
| `pnpm preview` | Sirve `dist/` para comprobar la compilación antes de desplegar  |

**Credenciales de la demo:** en modo simulación cualquier usuario y contraseña
abren el panel. Para probar el alta de cuenta, el código de planta es
`INCASA-2026`.

### Dependencias y por qué están

| Paquete               | Para qué                                                     |
|-----------------------|--------------------------------------------------------------|
| `vite`                | Servidor de desarrollo, empaquetado y proxy al backend        |
| `lucide`              | Iconografía. Se importan sólo los ~45 iconos usados           |
| `jspdf` + `autotable` | Certificado, ticket de 80 mm y reporte en PDF real            |
| `@fontsource/*`       | Tipografías autoalojadas: la planta puede quedarse sin internet |

`jspdf` vive en su propio módulo con `import()` dinámico, así que la terminal
sólo descarga esos ~300 kB si alguien exporta de verdad.

---

## 2 · Estructura de carpetas

```
INCASA-Sistema-de-Pesaje/
│
├── index.html                  Acceso: iniciar sesión + crear cuenta
├── app.html                    Panel: pesaje, historial, reportes y perfil
├── vite.config.js              Multipágina + PROXY hacia el backend de Java
├── package.json
│
├── public/                     Servido tal cual, sin procesar por Vite
│   └── logo-incasa.jpg         ★ LOGOTIPO OFICIAL (ver sección 3)
│
├── css/
│   ├── tokens.css              Paleta corporativa y los dos temas
│   ├── base.css                Reset, tipografía y catálogo de animaciones
│   ├── components.css          Botones, campos, tarjetas, tablas, modales
│   ├── acceso.css              Sólo la pantalla de acceso
│   └── panel.css               Sólo el panel (incluye la vista del certificado)
│
└── js/
    ├── api.js                  ★★★ CAPA DE INTEGRACIÓN — todos los contratos
    ├── mock-data.js            10 registros de prueba (ELIMINAR en producción)
    ├── bascula.js              Simulador del indicador (ELIMINAR en producción)
    │
    ├── ui.js                   Tema, avisos, formato, modales, sesión
    ├── iconos.js               Puente con Lucide
    │
    ├── reportes.js             CSV + orquestación de los PDF
    ├── reportes-pdf.js         Certificado, ticket y reporte con jsPDF
    ├── reportes-columnas.js    Columnas compartidas por CSV y PDF
    ├── certificado-modal.js    Vista previa del certificado antes de descargar
    ├── pesajes-modales.js      Ver detalle · Editar · Eliminar
    │
    ├── auth.js                 Punto de entrada de index.html
    └── app.js                  Punto de entrada de app.html
```

**Regla de oro:** ningún archivo llama a `fetch` salvo `js/api.js`. Todo lo demás
usa `API.*`. Por eso conectar el backend no toca las vistas.

---

## 3 · El logotipo · `public/logo-incasa.jpg`

El logotipo oficial vive en **`public/logo-incasa.jpg`** y se carga por ruta
absoluta (`/logo-incasa.jpg`). **Para actualizarlo basta con reemplazar ese
archivo conservando el nombre**: no hay que tocar ningún HTML, CSS ni JS.

### Dónde aparece

| Lugar                        | Archivo                        | Tamaño   |
|------------------------------|--------------------------------|----------|
| Barra lateral (sidebar)      | `app.html` → `.lateral__marca` | 52×52 px |
| Encabezado superior (topbar) | `app.html` → `.barra__marca`   | 46×46 px |
| Pantalla de acceso           | `index.html` → `.acceso__marca`| 76×76 px |
| Icono de pestaña (favicon)   | `<link rel="icon">` en ambos HTML | —     |
| Vista previa del certificado | `js/certificado-modal.js`      | 56×56 px |
| **PDF del certificado**      | `js/reportes-pdf.js`           | 22 mm    |
| **PDF del ticket 80 mm**     | `js/reportes-pdf.js`           | 16 mm    |
| **PDF del reporte**          | `js/reportes-pdf.js`           | 18 mm    |

### Cómo llega el logotipo al PDF

jsPDF no puede leer una ruta: necesita los bytes de la imagen. `reportes-pdf.js`
la descarga una sola vez, la convierte a *data URL* y la cachea:

```js
const RUTA_LOGO = '/logo-incasa.jpg';   // ← si renombras el archivo, cámbialo aquí
export async function cargarLogo() { … }
```

Si el archivo faltara, el PDF **no falla**: dibuja un recuadro pizarra de
respaldo y deja un aviso en consola. Un certificado sin logotipo es preferible a
un error en plena jornada.

### Notas del archivo actual

- Fondo opaco **#48555D** (muestreado del propio JPG). La interfaz usa ese valor
  como `--logo-fondo` para que la placa del logotipo se funda con la barra
  lateral en lugar de parecer un recorte pegado.
- El JPG **ya contiene el texto** «INCASA · Industria Centroamericana, S.A.», por
  eso la interfaz nunca repite el nombre de la empresa a su lado: sólo añade
  «Sistema de Pesaje».
- Si algún día se dispone de una versión con fondo transparente (PNG o SVG),
  reemplaza el archivo y quita `background: var(--logo-fondo)` de `.marca__logo`
  en `css/components.css`.

---

## 4 · Paleta corporativa

Toda la paleta está en `css/tokens.css`, en dos capas: **rampas** (colores crudos
de la marca) y **roles** (qué significa cada color). Los componentes sólo usan
roles, así que un cambio de marca se hace en un único archivo.

| Grupo                 | Valores               | Uso                                        |
|-----------------------|-----------------------|--------------------------------------------|
| **Gris pizarra**      | `#2D3539` `#3F4A50` `#48555D` | Barra lateral, cabeceras, tarjetas de alto contraste |
| **Verde INCASA**      | `#008744` `#1E7E34`   | Botones principales, estados activos, confirmaciones |
| **Dorado / ámbar**    | `#F4B400` `#E69A00`   | Lectura de báscula estabilizada, cifras y alertas |
| **Blanco y nieve**    | `#FFFFFF` `#F8F9FA`   | Lienzo y contraste de texto                 |

Dos criterios que conviene respetar al ampliar la interfaz:

- **El ámbar es el idioma de la medición.** El visor se enciende en ámbar cuando
  la lectura está estabilizada, igual que un LED de indicador industrial. Si se
  usa como color decorativo deja de avisar.
- **El verde es acción, no estado.** Botón principal, tecla «Capturar peso» y
  confirmaciones. El semáforo del peso lo lleva el ámbar.

---

## 5 · Fuente de lectura: modo real, simulador y contingencia

La pantalla **Pesaje en vivo** arranca **siempre en modo real**, esperando al
indicador. Ni el simulador ni el ingreso manual se activan solos: son decisiones
explícitas del operario, para que nadie confunda un peso inventado con una
lectura certificada.

El panel «Fuente de lectura» del cabezal tiene cuatro estados
(`App.fuente` en `js/app.js`):

| Estado       | Qué significa                                         | Cómo se llega                        |
|--------------|-------------------------------------------------------|--------------------------------------|
| `esperando`  | **Estado inicial.** «Esperando conexión con indicador Hiweight X10 / BASC-01» | Al cargar la vista |
| `conectada`  | El WebSocket entrega tramas reales                     | Automático con `API.MODO = 'produccion'` |
| `simulador`  | Pesos generados por el sistema                         | Botón **«Activar Simulación de Báscula»** |
| `manual`     | Contingencia: el peso lo teclea el operario            | Botón **«Ingreso Manual / Contingencia»** |

Detalles que importan:

- Con `esperando` o `manual`, las teclas CERO/TARA/BRUTO quedan **deshabilitadas**
  y el visor muestra `----.-`: no hay nada que tarar.
- El simulador **se detiene de verdad** al desactivarlo (`enlace.cerrar()`), no
  sólo visualmente.
- Cada pesaje guarda el campo **`origenLectura`** (`conectada` | `simulador` |
  `manual`). Una auditoría puede así distinguir una lectura certificada de una
  tecleada en contingencia. **El backend debería persistir este campo.**

---

## 6 · Desactivar o eliminar el simulador en producción

El simulador vive en **`js/bascula.js`** y es el único archivo que genera pesos
falsos. Hay dos niveles, según lo definitivo que quieras que sea.

### Nivel 1 · Desactivarlo (recomendado durante la puesta en marcha)

Crea un archivo `.env` en la raíz del proyecto:

```bash
VITE_API_MODO=produccion
```

Con eso:

- `API.conectarBascula()` abre el **WebSocket real** en lugar del simulador.
- La vista arranca conectando con el indicador y pasa a `conectada` en cuanto
  llega la primera trama.
- El botón «Activar Simulación de Báscula» **sigue existiendo**, lo que resulta
  útil para formar operarios sin mover material real.

### Nivel 2 · Eliminarlo por completo

Cuando el sistema esté en producción estable y no quieras que exista la
posibilidad de generar pesos falsos:

1. **Borra los archivos de simulación:**
   ```bash
   rm js/bascula.js js/mock-data.js
   ```

2. **Quita sus dos `import` de la cabecera de `js/api.js`:**
   ```js
   import { MockData } from './mock-data.js';   // ← borrar
   import { Bascula } from './bascula.js';      // ← borrar
   ```

3. **Quita el import y el uso en `js/app.js`:**
   ```js
   import { Bascula } from './bascula.js';      // ← borrar
   ```
   …y elimina el método `alternarSimulador()` junto con la llamada
   `Bascula.retirarCarga()` de `guardar()`.

4. **Quita el botón del HTML** en `app.html`:
   ```html
   <button type="button" class="btn btn--ambar btn--sm" id="btn-simular">…</button>
   ```
   …y su escucha en `acciones()` de `js/app.js`.

5. **Opcional:** conserva el ingreso manual. En una planta real es la única
   salida cuando el indicador se avería a mitad de turno, y queda registrado
   como `origenLectura: 'manual'`.

> Tras el paso 2, todas las ramas `if (!this.enProduccion)` de `js/api.js`
> quedan muertas y pueden borrarse; cada método se reduce a su llamada `fetch`.

---

## 7 · Contratos REST y WebSocket · `js/api.js`

**Todos los contratos JSON viven en `js/api.js`**, documentados en el comentario
que precede a cada método. No hay contratos repartidos por otros archivos.

```
js/api.js
├── ⚙️  CONFIGURACIÓN        ← MODO, BASE, WS, cabeceras, pedir()
├── 🔐  1 · AUTENTICACIÓN    ← login, registro, logout, miPerfil
├── ⚖️  2 · BÁSCULA          ← conectarBascula (WebSocket + reconexión)
├── 📦  3 · PESAJES          ← guardar, listar, obtener, actualizar, eliminar
├── 📄  4 · CERTIFICADO      ← certificadoPesaje, ticketPesaje, reportePDF
├── 🗂️  5 · CATÁLOGOS        ← materiales, básculas
└── 👤  6 · PERFIL           ← guardarPerfil, cambiarClave
```

### La configuración, en tres líneas

```js
MODO: env('VITE_API_MODO', 'simulacion'),   // 'simulacion' | 'produccion'
BASE: env('VITE_API_BASE', '/api'),         // raíz REST
WS:   env('VITE_WS_BASE', '/ws/bascula'),   // WebSocket de la báscula
```

### Cuerpo de error estándar

`API.pedir()` espera que **todos** los errores tengan esta forma. En Spring Boot
se consigue con un `@ControllerAdvice` + `@ExceptionHandler`:

```json
{ "error": "CODIGO_MAQUINA", "mensaje": "Texto para el operario" }
```

Un `401` expulsa al usuario a la pantalla de acceso automáticamente.

### Cómo modificar un endpoint

Abre `js/api.js`, busca el método y edita la cadena de la ruta:

```js
// Antes
return this.pedir('/pesajes', { method: 'POST', body: JSON.stringify(pesaje) });
// Después
return this.pedir('/pesajes/registrar', { method: 'POST', body: JSON.stringify(pesaje) });
```

Actualiza también el comentario de arriba para que la documentación no mienta.

### WebSocket de la báscula

```
ws://localhost:8080/ws/bascula?bascula=BASC-01&token=…
```

El backend lee el puerto serie del **Hiweight X10** (por ejemplo con
**jSerialComm**) y reemite ~10 tramas por segundo:

```json
{
  "bascula": "BASC-01",
  "modelo": "Hiweight X10",
  "peso": 2014.5,
  "bruto": 2043.0,
  "tara": 28.5,
  "unidad": "kg",
  "estable": true,
  "modo": "NETO",
  "sobrecarga": false,
  "capacidad": 4600.0,
  "division": 0.5,
  "ts": "2026-08-31T09:25:11.320Z"
}
```

Comandos que el frontend envía por el mismo socket:

```json
{"comando":"CERO"}   {"comando":"TARA"}
{"comando":"BRUTO"}  {"comando":"NETO"}
```

**Reconexión:** ya implementada con espera creciente (1,6 s · 3,2 s · 6,4 s …
hasta 15 s). Si la red de planta se cae, el operario no tiene que recargar.

**Sin WebSocket:** sirve `GET /api/basculas/{codigo}/lectura` y haz polling cada
300 ms con el mismo JSON.

---

## 8 · Conectar con el backend en Java · paso a paso

Entorno previsto: **Spring Boot en `http://localhost:8080`**.

### Paso 1 · Comprobar el proxy

`vite.config.js` ya reenvía `/api` y `/ws` al puerto 8080:

```js
server: {
  proxy: {
    '/api': { target: 'http://localhost:8080', changeOrigin: true },
    '/ws':  { target: 'ws://localhost:8080',   ws: true }
  }
}
```

Si tu Spring Boot escucha en otro puerto, cámbialo aquí.

### Paso 2 · Activar el modo producción

Una sola bandera. Crea `.env` en la raíz:

```bash
VITE_API_MODO=produccion
```

Cada método deja de usar `MockData` y ejecuta su `fetch`. **No hay que
descomentar nada**: las llamadas reales ya están escritas.

### Paso 3 · Implementar los endpoints

Lo mínimo para que la aplicación arranque:

1. `POST /api/auth/login` — devuelve `token` + `usuario`
2. `GET  /api/catalogos/materiales`
3. `GET  /api/catalogos/basculas`
4. `GET  /api/pesajes`
5. `POST /api/pesajes`

El resto puede llegar después: la interfaz avisa del error sin romperse.

### Paso 4 · Publicar el WebSocket

Registra un `WebSocketHandler` en `/ws/bascula` con la trama de la sección 7.

### Paso 5 · Compilar y desplegar dentro del JAR

```bash
pnpm build
```

Copia el contenido de `dist/` a `src/main/resources/static/` de tu proyecto
Spring Boot. El JAR servirá el frontend y la API desde el mismo origen.

### Paso 6 · Retirar el andamiaje

Sigue la [sección 6](#6--desactivar-o-eliminar-el-simulador-en-producción) y,
además:

- Sustituye `sessionStorage` por una cookie `httpOnly` emitida por el backend
  (ver `guardarSesion()` en `js/ui.js`).
- Valida el token al arrancar con `API.miPerfil()` y redirige si responde 401.

### Sobre CORS

`BASE` es `/api`, una **ruta relativa**. En desarrollo el proxy de Vite la
reenvía a 8080 y, en producción, el JAR sirve los estáticos. En ambos casos es el
mismo origen: **no hay CORS ni preflight que configurar en Java**.

Si algún día el frontend se despliega en un dominio distinto, pon la URL absoluta
en `BASE` y añade `@CrossOrigin` (o un `WebMvcConfigurer`) en el backend.

---

## 9 · Referencia de endpoints

Raíz: `http://localhost:8080/api`

### Autenticación

| Método | Ruta                 | Uso                                    |
|--------|----------------------|----------------------------------------|
| `POST` | `/auth/login`        | Devuelve `token` + objeto `usuario`     |
| `POST` | `/auth/registro`     | Alta de operario/administrador (201)    |
| `POST` | `/auth/logout`       | Invalida el token (204)                 |
| `GET`  | `/usuarios/me`       | Perfil del token actual                 |
| `PUT`  | `/usuarios/me`       | Nombre, rol, correo, báscula            |
| `PUT`  | `/usuarios/me/clave` | `{ claveActual, claveNueva }`           |

### Pesajes y documentos

| Método   | Ruta                        | Uso                                        |
|----------|-----------------------------|--------------------------------------------|
| `POST`   | `/pesajes`                  | Registra el pesaje (201 con `id`, `folio`)  |
| `GET`    | `/pesajes`                  | Filtros: `desde`, `hasta`, `tipoMaterial`, `bascula`, `buscar`, `pagina` |
| `GET`    | `/pesajes/{id}`             | Un pesaje completo                          |
| `PUT`    | `/pesajes/{id}`             | Edita material, rollo, orden y observaciones |
| `DELETE` | `/pesajes/{id}`             | Baja del registro (204)                     |
| `GET`    | `/pesajes/{id}/certificado` | **Certificado de Pesaje** (`application/pdf`) |
| `GET`    | `/pesajes/{id}/ticket`      | Ticket de 80 mm (`application/pdf`)         |
| `POST`   | `/reportes/pesajes.pdf`     | Listado del periodo (`application/pdf`)     |
| `GET`    | `/catalogos/materiales`     | Tipos de material                           |
| `GET`    | `/catalogos/basculas`       | Básculas de planta                          |

El CSV se genera siempre en el navegador y no necesita backend.

### JSON del pesaje

```json
{
  "ordenTrabajo":  "OT-2026-1240",
  "codigoRollo":   "RA-84512",
  "tipoMaterial":  "BOBINA_ALAMBRON",
  "operario":      "Javier López",
  "operarioId":    12,
  "pesoBruto":     2043.0,
  "tara":          28.5,
  "pesoNeto":      2014.5,
  "unidad":        "kg",
  "bascula":       "BASC-01",
  "modeloBascula": "Hiweight X10",
  "estable":       true,
  "origenLectura": "conectada",
  "observaciones": "Recepción de proveedor · lote completo",
  "capturadoEn":   "2026-08-31T09:25:11.320Z"
}
```

Respuesta esperada (201): el mismo objeto más `id`, `folio` y `creadoEn`.
El `folio` (`CP-` = Certificado de Pesaje) lo genera el backend y es el número
impreso en el PDF.

---

## 10 · Documentos generados

| Documento              | Formato          | Dónde se genera       | Desde dónde                       |
|------------------------|------------------|------------------------|-----------------------------------|
| Certificado de Pesaje  | PDF A4 vertical  | `reportes-pdf.js`      | Al guardar · botón de cada fila   |
| Ticket                 | PDF 80 mm        | `reportes-pdf.js`      | Modal del certificado             |
| Reporte de producción  | PDF A4 apaisado  | `reportes-pdf.js`      | Historial y Reportes              |
| Listado                | CSV (`;`, BOM)   | `ui.js`                | Historial y Reportes              |

**Flujo del certificado:** al guardar un pesaje se abre automáticamente la
**vista previa** (`js/certificado-modal.js`), una réplica en pantalla del PDF con
el mismo logotipo y los mismos bloques. El operario comprueba los datos *antes*
de emitir el documento. Desde ahí descarga el PDF A4 o el ticket de 80 mm.

En el historial, **cada fila tiene su propio botón «Ver / Descargar»**, anclado al
borde derecho de la tabla para que siga a la vista por ancha que sea.

**Los PDF se piden primero al backend.** Si Java devuelve el blob se descarga el
suyo; si el endpoint no existe todavía, el navegador arma el documento con jsPDF.
Las dos ramas terminan en la misma descarga, así que puedes implementar los PDF
en Java (iText, JasperReports) cuando quieras sin tocar el frontend.

---

## 11 · Reglas del dominio

### Báscula

| Parámetro            | Valor                                      |
|----------------------|--------------------------------------------|
| Modelo del indicador | **Hiweight X10**                           |
| Capacidad máxima     | **4,600 kg**                               |
| División de escala   | 0.5 kg (9.200 divisiones)                  |
| Unidad               | **Kilogramos (kg)** — estricta e inamovible |

La unidad **no es configurable** en ninguna pantalla. Por eso los pesos se
muestran con **un solo decimal** (`kg()` en `js/ui.js`): mostrar centésimas
fingiría una precisión que la celda de carga no tiene.

### Campos obligatorios de captura

| Campo                | Clave JSON      | Notas                                         |
|----------------------|-----------------|-----------------------------------------------|
| Tipo de Material     | `tipoMaterial`  | `BOBINA_ALAMBRON` \| `PRODUCTO_SEMIELABORADO` |
| Código de Rollo/Lote | `codigoRollo`   | Identificador físico del material             |
| Orden de Trabajo     | `ordenTrabajo`  | Orden de producción asociada                  |
| Observaciones        | `observaciones` | Obligatorio: estado del rollo o «Sin novedad» |

El tipo de material se elige con **dos tarjetas grandes**, no con un desplegable:
es el campo que más se equivoca y sólo tiene dos valores.

### Reglas que el backend debe respetar

- **El peso no se edita nunca.** `PUT /pesajes/{id}` sólo acepta los cuatro
  campos de identificación. El peso es la lectura certificada de la celda de
  carga y ya figura en un certificado emitido; si está mal, se anula el registro
  y se vuelve a pesar el material.
- **`DELETE` no debería borrar la fila.** Conviene marcarla como anulada
  (`anuladoEn`, `anuladoPor`, `motivo`) y excluirla de las consultas: un
  certificado de pesaje es un documento comercial y puede hacer falta en una
  auditoría meses después.
- **Persistir `origenLectura`.** Distingue una lectura certificada de una
  tecleada en contingencia.

---

## Estado de la simulación

`js/mock-data.js` trae **exactamente 10 registros** escritos a mano —no
generados al azar— repartidos en los tres últimos días: bobinas de alambrón
alrededor de 2.000 kg y producto semielaborado entre 50 y 3.000 kg, con las horas
concentradas entre las 07:00 y las 15:00 y un pico a media mañana. Así los
reportes gerenciales (hora pico, tonelaje, reparto por material) muestran cifras
con sentido en lugar de ruido.

Los datos viven en memoria: **al recargar el navegador se regeneran**. Todo eso
desaparece en cuanto el backend de Java sirva los datos reales.
