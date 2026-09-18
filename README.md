# INCASA · Sistema de Pesaje

Sistema de pesaje industrial de **INCASA (Industria Centroamericana, S.A.)**,
Nicaragua. Controla la **producción** de punta a punta: la bobina que entra a un
área de proceso, lo que sale de ella y la **merma** entre ambos, con lectura
directa desde la báscula, **Certificado de Pesaje** por cada pesada, roles,
auditoría y reportes gerenciales.

| Parte     | Tecnología                                              | Dónde        |
|-----------|---------------------------------------------------------|--------------|
| Frontend  | JavaScript (módulos ES) sobre **Vite**, sin framework   | `front/`     |
| Backend   | **Spring Boot 4 / Java 21**, JPA, Flyway                | `backend/`   |
| Base      | **SQL Server 2022** (`incasa_pesaje`)                   | —            |

La puesta en marcha del backend y de SQL Server está en
[`backend/README.md`](backend/README.md).

---

## Índice

1. [Arrancar](#1--arrancar)
2. [Estructura de carpetas](#2--estructura-de-carpetas)
3. [Cuentas y roles](#3--cuentas-y-roles)
4. [El flujo de una producción](#4--el-flujo-de-una-producción)
5. [Fuente de lectura: báscula, simulador y contingencia](#5--fuente-de-lectura-báscula-simulador-y-contingencia)
6. [Contratos con el backend · `js/api.js`](#6--contratos-con-el-backend--jsapijs)
7. [Documentos generados](#7--documentos-generados)
8. [El logotipo](#8--el-logotipo--publiclogo-incasajpg)
9. [Paleta corporativa](#9--paleta-corporativa)
10. [Reglas del dominio](#10--reglas-del-dominio)

---

## 1 · Arrancar

Requisitos: **Node 18+** con **pnpm**, **Java 21+** con **Maven**, y el backend
configurado según [`backend/README.md`](backend/README.md).

```powershell
# 1 · Backend (http://localhost:8080). La clave de la base, en variable de entorno.
$env:INCASA_DB_CLAVE = '…'
cd backend; mvn spring-boot:run

# 2 · Frontend (http://localhost:5173), en otra terminal
cd front
pnpm install
pnpm dev
```

El frontend **siempre** habla con el backend: el proxy de `vite.config.js`
reenvía `/api` y `/ws` al 8080. Ya no existe un modo de demostración con datos
inventados.

Los comandos de `pnpm` se ejecutan dentro de `front/`:

| Comando           | Qué hace                                                     |
|-------------------|--------------------------------------------------------------|
| `pnpm dev`        | Servidor de desarrollo con recarga en caliente (5173)         |
| `pnpm build`      | Compila a `front/dist/`                                       |
| `pnpm build:java` | Compila dentro de `backend/src/main/resources/static`, para servir todo desde el JAR |
| `pnpm preview`    | Sirve `dist/` para revisar la compilación                     |

**Primer arranque:** con la base vacía, la pantalla de acceso muestra la
**configuración inicial**, que crea la cuenta del **propietario** con el código
de instalación (`INCASA_CODIGO_INSTALACION`, por defecto `INCASA-2026`).

### Dependencias y por qué están

| Paquete               | Para qué                                                     |
|-----------------------|--------------------------------------------------------------|
| `vite`                | Servidor de desarrollo, empaquetado y proxy al backend        |
| `lucide`              | Iconografía. Se importan sólo los iconos usados               |
| `jspdf` + `autotable` | Certificado, ticket de 80 mm y reporte en PDF                 |
| `@fontsource/*`       | Tipografías autoalojadas: la planta puede quedarse sin internet |

---

## 2 · Estructura de carpetas

```
FORJA_INCASSA/
├── README.md                   este documento
├── backend/                    Spring Boot · ver backend/README.md
│
└── front/                      todo el frontend
    ├── index.html              Acceso: iniciar sesión · configuración inicial
    ├── app.html                Panel: todas las vistas
    ├── vite.config.js          Multipágina + proxy hacia el backend
    ├── package.json            scripts: dev, build, build:java, preview
    │
    ├── public/logo-incasa.jpg  ★ LOGOTIPO OFICIAL (sección 8)
    │
    ├── css/
    │   ├── tokens.css          Paleta corporativa y los dos temas
    │   ├── base.css            Reset, tipografía y animaciones
    │   ├── components.css      Botones, campos, tarjetas, tablas, modales
    │   ├── acceso.css          Sólo la pantalla de acceso
    │   ├── panel.css           Sólo el panel
    │   └── admin.css           Sólo Administración
    │
    └── js/
        ├── api.js                  ★★★ ÚNICO archivo con red: todos los contratos
        ├── estado.js               Estado compartido y aviso de cambios entre vistas
        ├── ui.js                   Tema, avisos, formato, modales, sesión, permisos
        ├── iconos.js               Puente con Lucide
        │
        ├── auth.js                 Entrada de index.html
        ├── app.js                  Entrada de app.html: arranque, permisos, rutas, perfil
        ├── vista-pesaje.js         Pesaje en vivo
        ├── vista-producciones.js   Producciones
        ├── vista-historial.js      Historial de pesajes
        ├── vista-reportes.js       Reportes gerenciales
        ├── vista-admin.js          Administración: usuarios, catálogos, báscula, auditoría
        │
        ├── produccion-modales.js   Abrir · corregir · ver · terminar · anular producción
        ├── pesajes-modales.js      Ver · corregir · anular pesaje
        ├── certificado-modal.js    Vista previa del certificado
        ├── reportes.js             CSV + orquestación de los PDF
        ├── reportes-pdf.js         Certificado, ticket y reporte con jsPDF
        ├── reportes-columnas.js    Columnas compartidas por CSV y PDF
        └── bascula.js              Simulador del indicador (sólo formación)
```

**Regla de oro:** ningún archivo llama a `fetch` salvo `front/js/api.js`.

---

## 3 · Cuentas y roles

No hay registro público. La primera cuenta es la del **propietario**, creada en
la configuración inicial; las demás las crean el propietario o los
administradores en **Administración**.

**Los permisos de cada rol los decide el propietario** en
**Administración → Roles y permisos** (tabla `rol_permiso`). Valores de partida:

| Permiso                          | Propietario | Admin | Supervisor | Operario | Calidad |
|----------------------------------|:-:|:-:|:-:|:-:|:-:|
| Abrir producciones               | ✔ | ✔ |   |   |   |
| Pesar                            | ✔ |   | ✔ | ✔ |   |
| Terminar producciones            | ✔ |   | ✔ | ✔ |   |
| Corregir y anular                | ✔ |   | ✔ |   |   |
| Consultar                        | ✔ | ✔ | ✔ | ✔ | ✔ |
| Gestionar usuarios y catálogos   | ✔ | ✔ |   |   |   |
| Ver auditoría                    | ✔ | ✔ |   |   |   |
| Gestionar administradores 🔒     | ✔ |   |   |   |   |
| Gestionar permisos 🔒            | ✔ |   |   |   |   |

- 🔒 = exclusivo del propietario: no se puede asignar a otro rol.
- El propietario tiene todos los permisos, siempre; su columna no se edita.
- Un cambio aplica en el acto a las sesiones abiertas de ese rol: el backend
  relee los permisos en cada petición.
- El propietario es **único** y nadie más lo gestiona.
- Nadie cambia su propio rol ni se desactiva a sí mismo.
- Desactivar una cuenta o restablecer su clave **cierra sus sesiones** al instante.
- El menú y los botones se ocultan según `usuario.permisos`, pero **el backend
  exige el permiso en cada petición**: ocultar es comodidad, no seguridad.

---

## 4 · El flujo de una producción

```
1 · Abrir producción     producto, materia, cantidad a producir + unidad,
                         área de PROCESO → área de DESTINO
2 · Pesaje de ENTRADA    la bobina que entra (código de bobina obligatorio)
3 · Pesaje de SALIDA     lo producido: peso + CANTIDAD producida en la
                         unidad de la producción (código de lote opcional)
4 · Terminar             → merma = kg entrada − kg salida
                         → rendimiento = salida / entrada
                         → producido = suma de las cantidades de salida
```

Ejemplo: la bobina BOB-0001 entra con 2,014.5 kg; sale 1,978 kg de producto que
son 40,000 clavos. La producción pedía 50,000 und → avance 80 %.

- Si la unidad de la producción es **kg**, la cantidad de una salida es su
  propio neto y no hace falta escribirla.
- La cantidad no es un peso certificado: un supervisor la puede corregir.

### Reglas de peso y de cierre

- **La salida nunca pesa más que la entrada.** No se pesa una salida sin haber
  pesado la bobina, y la salida acumulada no puede pasar del peso que entró.
  Tampoco se puede anular una entrada si con ello la salida quedaría mayor.
- **Cierre automático.** La salida que alcanza la cantidad pedida termina la
  producción sola. Si se pasó de lo pedido, el **exceso** queda anotado en la
  producción y en la auditoría, y el operario lo ve en un aviso antes del
  certificado.
- **Merma máxima de 2 %** (configurable con `INCASA_MERMA_MAXIMA`). Con más
  merma la producción no se cierra sola ni la cierra un operario: se avisa y
  sólo alguien con permiso de **Corregir y anular** la cierra, justificándolo.
  Queda en la auditoría como *cierre fuera de tolerancia*.

- Los kg de entrada y salida **no se teclean**: se suman de los pesajes vigentes.
- Normalmente hay una bobina por producción, pero si se usan varias se
  registran varias entradas y queda trazado qué bobinas se consumieron.
- Una producción terminada **no admite más pesajes**.
- Una producción sólo se anula **sin pesajes vigentes**, y con motivo.

---

## 5 · Fuente de lectura: báscula, simulador y contingencia

**Pesaje en vivo** abre el WebSocket con la báscula activa al cargar. El panel
«Fuente de lectura» tiene cuatro estados (`VistaPesaje.fuente`):

| Estado       | Qué significa                                  | Cómo se llega                      |
|--------------|------------------------------------------------|------------------------------------|
| `esperando`  | Sin señal del indicador                         | Al cargar o si se corta la red      |
| `conectada`  | El WebSocket entrega tramas (~10 por segundo)   | Automático                          |
| `simulador`  | Pesos generados en el navegador                 | «Activar Simulación de Báscula»     |
| `manual`     | Contingencia: el operario teclea el peso        | «Ingreso Manual / Contingencia»     |

- Cada pesaje guarda **`origenLectura`**: una auditoría distingue una lectura
  certificada de una tecleada en contingencia.
- **El backend rechaza los pesos del simulador** salvo que planta lo habilite
  (`INCASA_ACEPTAR_SIMULADOR=true`), para que un certificado nunca salga de un
  peso inventado. El botón sigue ahí para formar operarios.
- Mientras el backend no tenga el lector del puerto serie, emite un ciclo de
  pesadas sintéticas (`INCASA_BASCULA_SIMULAR=true`): así se prueba todo el flujo
  sin la báscula delante.

---

## 6 · Contratos con el backend · `js/api.js`

**Todos los contratos viven en `js/api.js`**, documentados sobre cada método, y
el backend los prueba de punta a punta en `ContratoApiTest`.

```
js/api.js
├── 1 · ACCESO          estado, configurar, login, logout
├── 2 · BÁSCULA         conectarBascula (WebSocket + reconexión)
├── 3 · PRODUCCIONES    listar, obtener, abrir, corregir, terminar, anular
├── 4 · PESAJES         guardar, listar, obtener, corregir, anular + PDF
├── 5 · CATÁLOGOS       catálogos, crear/editar elemento, editar báscula
├── 6 · CUENTAS         perfil propio y gestión de usuarios
└── 7 · AUDITORÍA
```

Todo error llega como `{ "error": "CODIGO", "mensaje": "…", "campos": {…} }`.
`API.pedir()` lo convierte en un `Error` con `mensaje`, `codigo` y `campos`, y
`marcarCampos()` (js/ui.js) pinta los errores de validación bajo cada campo.
Un `401` fuera de `/auth/*` expulsa a la pantalla de acceso.

---

## 7 · Documentos generados

| Documento              | Formato          | Dónde se genera   | Desde dónde                         |
|------------------------|------------------|-------------------|-------------------------------------|
| Certificado de Pesaje  | PDF A4 vertical  | `reportes-pdf.js` | Al guardar · botón de cada fila     |
| Ticket                 | PDF 80 mm        | `reportes-pdf.js` | Vista previa del certificado        |
| Reporte de producción  | PDF A4 apaisado  | `reportes-pdf.js` | Historial y Reportes                |
| Listado                | CSV (`;`, BOM)   | `ui.js`           | Historial y Reportes                |

**Los PDF se piden primero al backend**, que hoy responde `501`; entonces el
navegador arma el documento con jsPDF. Si algún día el certificado debe llevar
firma o numeración fiscal del servidor, basta con implementar los tres
endpoints en Java: el frontend no cambia.

---

## 8 · El logotipo · `public/logo-incasa.jpg`

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

## 9 · Paleta corporativa

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

## 10 · Reglas del dominio

### Báscula

Marca, modelo, capacidad y división viven en la tabla `bascula` y se editan en
**Administración → Báscula**. Hoy: **Hiweight X10**, **4,600 kg**, división
**0.5 kg**. La unidad del peso es **kilogramos (kg)**, estricta: los pesos se
muestran con un decimal porque la celda no resuelve centésimas.

### Campos de un pesaje

| Campo                | Clave JSON      | Notas                                         |
|----------------------|-----------------|-----------------------------------------------|
| Producción           | `produccionId`  | Una producción en proceso                     |
| Tipo                 | `tipo`          | `ENTRADA` (bobina) \| `SALIDA` (producto)    |
| Código de bobina     | `codigoBobina`  | Obligatorio en la entrada; lote opcional en la salida |
| Bruto y tara         | `pesoBruto`, `tara` | El neto lo calcula el servidor            |
| Observaciones        | `observaciones` | **Opcional**: sólo si hay algo que anotar     |

### Reglas que aplica el backend

- **El peso no se edita nunca.** De un pesaje sólo se corrige el código de
  bobina y las observaciones. Si un peso está mal, se anula y se vuelve a pesar.
- **Nada operativo se borra.** Pesajes y producciones se **anulan**: la fila se
  conserva con quién, cuándo y por qué, y desaparece de listados y reportes.
- **El servidor es la fuente de verdad** del operario, la hora, la báscula y el
  neto de cada pesaje.
- **Los catálogos se desactivan**, no se borran, para que las producciones
  antiguas conserven sus nombres.
