# INCASA · Backend del Sistema de Pesaje

API REST + WebSocket en **Spring Boot 4 / Java 21** sobre **SQL Server 2022**.
Es el espejo exacto de `js/api.js`: cada ruta, cuerpo y código de error de
ese archivo está implementado aquí y cubierto por `ContratoApiTest`.

---

## 1 · Preparar SQL Server (una sola vez)

Instancia `localhost\SQLEXPRESS`, base `incasa_pesaje`.

**a) Autenticación mixta.** En SSMS, clic derecho sobre el servidor →
*Propiedades* → *Seguridad* → «Modo de autenticación de SQL Server y Windows».

**b) TCP/IP en el puerto 1433.** *SQL Server Configuration Manager* →
*Configuración de red* → *Protocolos de SQLEXPRESS* → **TCP/IP: Habilitado** →
pestaña *Direcciones IP* → *IPAll* → `TCP Port = 1433`.

Tras a) y b), reinicia el servicio *SQL Server (SQLEXPRESS)*.

**c) Usuario de la aplicación.** En SSMS, con una clave tuya:

```sql
CREATE LOGIN incasa_app WITH PASSWORD = 'CambiaEstaClave-2026!', CHECK_POLICY = ON;
GO
USE incasa_pesaje;
CREATE USER incasa_app FOR LOGIN incasa_app;
ALTER ROLE db_owner ADD MEMBER incasa_app;   -- Flyway crea y migra las tablas
GO
```

Las **tablas no se crean a mano**: Flyway aplica las migraciones de
`db/migration/` al arrancar y deja registro en `flyway_schema_history`.
Una migración aplicada **no se edita nunca**: cualquier cambio va en una nueva
(`V4__…sql`).

| Versión | Qué hace |
|---|---|
| V1 | Esquema inicial y datos de partida |
| V2 | Permisos editables por rol (`permiso`, `rol_permiso`) y columna `pesaje.cantidad` |
| V3 | Completa la cantidad de las salidas antiguas en kg y añade su restricción |

Los datos de partida de la V1 son los roles, el área *Refinado*, cinco
productos, la materia *Bobina de alambrón*, las unidades kg/pie/und y la
báscula `BASC-01`; la V2 añade los permisos iniciales de cada rol.

---

## 2 · Arrancar

La clave de la base se lee de una variable de entorno; nunca va en el repositorio.

```powershell
# PowerShell, en la carpeta backend/ (comillas simples: el $ de la clave no se interpreta)
$env:INCASA_DB_CLAVE = 'CambiaEstaClave-2026!'
mvn spring-boot:run
```

Escucha en `http://localhost:8080`. El frontend (`pnpm dev` dentro de
`front/`) le llega por el proxy de Vite.

**Primer arranque:** la pantalla de acceso detecta que no hay propietario y
muestra la configuración inicial. Pide el **código de instalación**
(`INCASA_CODIGO_INSTALACION`), que sólo sirve mientras no exista propietario.

### Variables de entorno

| Variable                    | Por defecto                       | Para qué                                     |
|-----------------------------|-----------------------------------|----------------------------------------------|
| `INCASA_DB_CLAVE`           | *(vacía)*                         | Clave de `incasa_app`. **Obligatoria**        |
| `INCASA_DB_USUARIO`         | `incasa_app`                      | Login de SQL Server                           |
| `INCASA_DB_URL`             | `localhost:1433`, `incasa_pesaje` | Otra instancia u otra base                    |
| `INCASA_CODIGO_INSTALACION` | `INCASA-2026`                     | Código para crear al propietario. **Cámbialo** |
| `INCASA_BASCULA_SIMULAR`    | `true`                            | `false` cuando exista el lector serie         |
| `INCASA_ACEPTAR_SIMULADOR`  | `false`                           | `true` sólo para formar operarios en pruebas  |
| `INCASA_MERMA_MAXIMA`       | `2`                               | Merma máxima entrada → salida, en %           |
| `INCASA_PUERTO_SERIE`       | `COM3`                            | Puerto del indicador                          |

---

## 3 · Desplegar en un solo JAR

```powershell
cd front
pnpm build:java                 # compila el frontend en backend/src/main/resources/static
cd ../backend
mvn package                     # corre las pruebas y genera target/pesaje-3.0.0.jar
java -jar target/pesaje-3.0.0.jar
```

El JAR sirve el frontend y la API desde el mismo origen: sin CORS.

---

## 4 · Pruebas

```powershell
mvn test
```

Corren sobre **H2 en modo SQL Server** con las mismas migraciones de Flyway:
no tocan la base real. Cubren la configuración inicial, el login, la jerarquía
de cuentas, los catálogos, el ciclo completo de una producción, las reglas de
peso, los permisos de cada rol, la auditoría y el formato de error.

---

## 5 · Estructura

```
ni.com.incasa.pesaje
├── auth/         configuración inicial, login, sesiones (token opaco en tabla)
├── usuario/      Usuario, Rol, permisos editables por rol, gestión de cuentas
├── catalogo/     áreas, productos, materias, unidades, báscula
├── produccion/   ciclo de vida PROCESO → TERMINADO / ANULADA, totales
├── pesaje/       pesajes de ENTRADA y SALIDA, historial
├── bascula/      WebSocket /ws/bascula y simulador del indicador
├── documento/    PDF (hoy 501: los genera el navegador)
└── comun/        errores, auditoría, zona horaria de planta
```

---

## 6 · Qué garantiza el servidor

| Regla | Detalle |
|---|---|
| **Permisos** | Cada ruta exige su permiso (`SesionActual.exigir`). Qué permisos tiene cada rol está en la tabla `rol_permiso` y lo edita el propietario (`GET/PUT /api/permisos`); `usuario/Permisos.java` la cachea y la vacía al guardar, así que un cambio aplica en el acto. El propietario los tiene todos por código; `GESTIONAR_ADMINISTRADORES` y `GESTIONAR_PERMISOS` son exclusivos suyos. |
| **Propietario único** | Se crea una vez con el código de instalación. No se asigna, edita ni desactiva desde la gestión de cuentas. Sólo él gestiona administradores. |
| **Sin autogestión** | Nadie cambia su propio rol ni se desactiva a sí mismo. |
| **El peso no se edita** | De un pesaje sólo se corrige código de bobina, cantidad producida y observaciones. Las columnas de peso son `updatable = false`. |
| **El neto se recalcula** | `pesoNeto = pesoBruto − tara`; lo que mande el cliente se ignora. Un `CHECK` en la tabla lo garantiza también. |
| **Capacidad** | Bruto > 0 y ≤ capacidad de la báscula activa; tara ≥ 0 y < bruto. |
| **Operario, hora y báscula** | Los pone el servidor (sesión, reloj y báscula activa). |
| **Entrada con bobina** | Un pesaje de `ENTRADA` exige código de bobina (y un `CHECK` en la tabla). |
| **Cantidad producida** | Una `SALIDA` registra el producto obtenido en la unidad de la producción; si esa unidad es kg vale el neto. La producción expone `cantidadProducida` y `avance`. Las entradas nunca llevan cantidad (`CHECK`). |
| **Producción cerrada** | Una producción terminada no admite pesajes. Terminar exige al menos una entrada y una salida. |
| **Salida ≤ entrada** | Una `SALIDA` exige entrada previa y la salida acumulada no puede superar el peso de entrada (422). Anular una `ENTRADA` que dejaría la salida por encima se rechaza (409 `SALIDA_SUPERA_ENTRADA`). |
| **Cierre automático** | Tras guardar una `SALIDA`, si lo producido alcanza la cantidad pedida y la merma está en tolerancia, la producción se termina sola (`TERMINAR_AUTOMATICA` en auditoría). El exceso queda en `observaciones` y en `ProduccionDto.exceso`; la respuesta del pesaje trae `cierre` para avisar al operario. |
| **Merma máxima** | `INCASA_MERMA_MAXIMA` (2 %). Por encima, terminar responde 409 `MERMA_FUERA_DE_TOLERANCIA`; con `forzar: true` cierra quien tiene `CORREGIR`, con justificación obligatoria (`TERMINAR_FUERA_TOLERANCIA`). |
| **Concurrencia** | Pesar, terminar y anular bloquean la fila de la producción: un pesaje no se cuela en una producción que otra terminal está cerrando. |
| **Totales siempre cuadran** | kg de entrada/salida, merma y rendimiento se calculan de los pesajes vigentes, nunca se guardan a mano. |
| **Nada operativo se borra** | Pesajes y producciones se anulan con quién, cuándo y motivo. Una producción sólo se anula sin pesajes vigentes. |
| **Catálogos** | Se desactivan, no se borran. Corregir una producción conserva un elemento ya desactivado si no se cambia. |
| **Folios** | `CP-000001` (pesajes) y `PR-000001` (producciones) salen de secuencias propias; no se reutilizan. |
| **Simulador** | Con `INCASA_ACEPTAR_SIMULADOR=false` se rechazan los pesos con `origenLectura = "simulador"`. |
| **Lectura inestable** | Con `origenLectura = "conectada"` se exige `estable = true`. La contingencia `manual` se acepta y queda marcada. |
| **Claves y sesiones** | BCrypt. Token opaco de 256 bits; en la tabla sólo su SHA-256. Caducan en 8 h y sobreviven a un reinicio. Cambiar la clave cierra las demás sesiones; desactivar una cuenta o restablecer su clave, todas. |
| **Auditoría** | Cuentas, catálogos, báscula, correcciones, cierres y anulaciones quedan en la tabla `auditoria`. |
| **WebSocket** | `/ws/bascula` exige token válido (cierra con 1008) y trabaja con la báscula activa. |
| **Días de planta** | Los filtros por fecha se cuentan en hora de Nicaragua, no en UTC. |

---

## 7 · Pendiente

- **Lector serie del indicador** (jSerialComm): llamar a
  `BasculaWebSocketHandler.difundir(lectura)` por cada trama y poner
  `INCASA_BASCULA_SIMULAR=false`.
- **PDF en el servidor**: hoy los tres endpoints responden 501 y el navegador
  genera el documento con jsPDF. Sólo hace falta si el certificado debe llevar
  firma o numeración fiscal controlada por el servidor.
- **Cookie httpOnly** en lugar de `sessionStorage` para el token.
- **Varias básculas**: el modelo ya las admite (tabla `bascula`), pero el
  sistema trabaja con la primera activa.
