/* ============================================================================
 *  INCASA · js/vista-admin.js
 *  ---------------------------------------------------------------------------
 *  Vista de Administración: usuarios, roles y permisos, catálogos, báscula
 *  activa y auditoría.
 *
 *  Un único punto de entrada, `montarAdmin(contenedor)`, que el panel llama
 *  cada vez que se abre la vista. Reconstruye el HTML completo y recarga los
 *  datos, así que es idempotente: los escuchadores cuelgan de nodos nuevos y
 *  nunca se duplican sobre el contenedor.
 *
 *  Los permisos de `puede()` sólo deciden qué se MUESTRA; el backend vuelve a
 *  exigirlos en cada petición (403 si alguien fuerza la interfaz).
 *  ==========================================================================*/

import '../css/admin.css';
import { API } from './api.js';
import {
  $, $$, esc, aviso, abrirModal, fechaHora, relativo, iniciales,
  sesion, puede, marcarCampos
} from './ui.js';
import { montarIconos } from './iconos.js';

const CLAVE_PESTANA = 'incasa_admin_pestana';

/** Las pestañas posibles, en orden. `permiso` decide si se ven. */
const PESTANAS = [
  { id: 'usuarios',  texto: 'Usuarios',  icono: 'users',    permiso: 'GESTIONAR_USUARIOS',  pintar: pintarUsuarios },
  { id: 'permisos',  texto: 'Roles y permisos', icono: 'shield-check', permiso: 'GESTIONAR_PERMISOS', pintar: pintarPermisos },
  { id: 'catalogos', texto: 'Catálogos', icono: 'tags',     permiso: 'GESTIONAR_CATALOGOS', pintar: pintarCatalogos },
  { id: 'bascula',   texto: 'Báscula',   icono: 'scale',    permiso: 'GESTIONAR_CATALOGOS', pintar: pintarBascula },
  { id: 'auditoria', texto: 'Auditoría', icono: 'activity', permiso: 'VER_AUDITORIA',       pintar: pintarAuditoria }
];

/**
 * Cada pintado de pestaña recibe un turno. Si el operario cambia de pestaña
 * (o reabre la vista) mientras una petición sigue en vuelo, la respuesta
 * vieja se descarta en lugar de pisar el contenido nuevo.
 */
let turnoActual = 0;
const vigente = (turno, panel) => turno === turnoActual && panel.isConnected;

/* ============================================================================
 *  PUNTO DE ENTRADA
 * ==========================================================================*/

export async function montarAdmin(contenedor) {
  const visibles = PESTANAS.filter(p => puede(p.permiso));

  contenedor.innerHTML = `
    <div class="encabezado-vista">
      <div>
        <p class="rotulo">Administración del sistema</p>
        <h2>Administración</h2>
      </div>
    </div>
    ${visibles.length ? `
      <div class="subpestanas" role="tablist" aria-label="Secciones de administración">
        ${visibles.map(p => `
          <button type="button" role="tab" id="admin-tab-${p.id}" data-pestana="${p.id}"
                  aria-controls="admin-panel" aria-selected="false" tabindex="-1">
            <i data-icono="${p.icono}"></i> ${esc(p.texto)}
          </button>`).join('')}
      </div>
      <div id="admin-panel" role="tabpanel"></div>` : `
      <div class="tarjeta">
        ${vacio('lock', 'Sin acceso', 'Tu rol no tiene permisos de administración.')}
      </div>`}`;
  montarIconos(contenedor);

  if (!visibles.length) return;

  const botones = $$('[data-pestana]', contenedor);
  const panel = $('#admin-panel', contenedor);

  const activar = (id, enfocar = false) => {
    const pestana = visibles.find(p => p.id === id) || visibles[0];
    botones.forEach(b => {
      const sel = b.dataset.pestana === pestana.id;
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
      if (sel && enfocar) b.focus();
    });
    panel.setAttribute('aria-labelledby', `admin-tab-${pestana.id}`);
    try { sessionStorage.setItem(CLAVE_PESTANA, pestana.id); } catch { /* sin persistencia */ }

    const turno = ++turnoActual;
    return pestana.pintar(panel, turno);
  };

  botones.forEach(b => b.addEventListener('click', () => activar(b.dataset.pestana)));

  // Flechas izquierda/derecha entre pestañas: patrón ARIA de tablist.
  $('.subpestanas', contenedor).addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    const i = botones.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const paso = ev.key === 'ArrowRight' ? 1 : -1;
    const siguiente = botones[(i + paso + botones.length) % botones.length];
    activar(siguiente.dataset.pestana, true);
  });

  let guardada = null;
  try { guardada = sessionStorage.getItem(CLAVE_PESTANA); } catch { /* modo privado */ }
  await activar(guardada);
}

/* ============================================================================
 *  PIEZAS COMUNES
 * ==========================================================================*/

function vacio(icono, titulo, texto = '') {
  return `
    <div class="vacio">
      <i data-icono="${icono}"></i>
      <b>${esc(titulo)}</b>
      ${texto ? `<p>${esc(texto)}</p>` : ''}
    </div>`;
}

function cargando(panel, texto = 'Cargando…') {
  panel.innerHTML = `<div class="tarjeta">${vacio('refresh-cw', texto)}</div>`;
  montarIconos(panel);
}

/** Error de carga con botón de reintento. */
function falloCarga(panel, error, reintentar) {
  panel.innerHTML = `
    <div class="tarjeta">
      <div class="vacio">
        <i data-icono="triangle-alert"></i>
        <b>No se pudo cargar</b>
        <p>${esc(error?.message || 'Error desconocido')}</p>
        <button type="button" class="btn btn--linea btn--sm" data-reintentar>
          <i data-icono="refresh-cw"></i> Reintentar
        </button>
      </div>
    </div>`;
  montarIconos(panel);
  $('[data-reintentar]', panel).addEventListener('click', reintentar);
}

function cabezaModal({ sello = 'info', icono, titulo, texto }) {
  return `
    <div class="modal__cabeza">
      <span class="modal__sello modal__sello--${sello}"><i data-icono="${icono}"></i></span>
      <div>
        <h3>${esc(titulo)}</h3>
        ${texto ? `<p>${esc(texto)}</p>` : ''}
      </div>
      <button type="button" class="btn-icono modal__cerrar" data-cerrar aria-label="Cerrar">
        <i data-icono="x"></i>
      </button>
    </div>`;
}

function pieModal(textoGuardar, icono = 'save') {
  return `
    <div class="modal__pie">
      <button type="button" class="btn btn--fantasma" data-cerrar>Cancelar</button>
      <button type="submit" class="btn btn--primario">
        <i data-icono="${icono}"></i> ${esc(textoGuardar)}
      </button>
    </div>`;
}

/**
 * Envía un formulario de modal con el botón en estado de carga.
 * `accion` lanza si falla; el botón vuelve a su estado para reintentar.
 */
async function conCarga(boton, accion) {
  boton.dataset.cargando = 'si';
  boton.disabled = true;
  try { return await accion(); }
  finally { delete boton.dataset.cargando; boton.disabled = false; }
}

const val = (caja, id) => $('#' + id, caja).value.trim();

/* ============================================================================
 *  1 · USUARIOS
 * ==========================================================================*/

/** Roles asignables: se piden una vez por montaje de pestaña. */
let rolesCache = null;

async function obtenerRoles() {
  if (!rolesCache) rolesCache = await API.rolesAsignables();
  return rolesCache;
}

async function pintarUsuarios(panel, turno) {
  rolesCache = null;
  cargando(panel, 'Cargando usuarios…');

  let usuarios;
  try { usuarios = await API.listarUsuarios(); }
  catch (error) {
    if (vigente(turno, panel)) falloCarga(panel, error, () => pintarUsuarios(panel, ++turnoActual));
    return;
  }
  if (!vigente(turno, panel)) return;

  panel.innerHTML = `
    <div class="tarjeta">
      <div class="filtros admin-herramientas">
        <div class="campo campo--buscar">
          <label for="u-buscar">Buscar</label>
          <div class="campo__control">
            <i data-icono="search"></i>
            <input id="u-buscar" type="search" placeholder="Nombre, usuario o rol…">
          </div>
        </div>
        <div class="campo campo--filtro">
          <label for="u-filtro">Estado</label>
          <select id="u-filtro">
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
        <button type="button" class="btn btn--primario" data-nuevo>
          <i data-icono="plus"></i> Nuevo usuario
        </button>
      </div>
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th>
              <th>Último ingreso</th><th style="text-align:right">Acciones</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pie-tabla"><span class="admin-contador"></span></div>
    </div>`;
  montarIconos(panel);

  const recargar = () => pintarUsuarios(panel, ++turnoActual);
  const cuerpo = $('tbody', panel);
  const buscar = $('#u-buscar', panel);
  const filtro = $('#u-filtro', panel);
  const contador = $('.admin-contador', panel);

  const filtrar = () => {
    const q = buscar.value.trim().toLowerCase();
    const estado = filtro.value;
    const lista = usuarios.filter(u => {
      if (estado === 'activos' && !u.activo) return false;
      if (estado === 'inactivos' && u.activo) return false;
      if (!q) return true;
      return [u.nombre, u.usuario, u.rolNombre, u.rol]
        .some(v => String(v ?? '').toLowerCase().includes(q));
    });

    cuerpo.innerHTML = lista.length
      ? lista.map(filaUsuario).join('')
      : `<tr><td colspan="6">${vacio('users', 'Sin resultados', 'Ningún usuario coincide con la búsqueda.')}</td></tr>`;
    montarIconos(cuerpo);
    contador.textContent = `${lista.length} de ${usuarios.length} usuarios`;
  };

  buscar.addEventListener('input', filtrar);
  filtro.addEventListener('change', filtrar);
  $('[data-nuevo]', panel).addEventListener('click', () => modalNuevoUsuario(recargar));

  // Delegación en el tbody: sobrevive a cada re-filtrado sin re-enganchar.
  cuerpo.addEventListener('click', ev => {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    const usuario = usuarios.find(u => String(u.id) === boton.dataset.id);
    if (!usuario) return;
    if (boton.dataset.accion === 'editar') modalEditarUsuario(usuario, recargar);
    if (boton.dataset.accion === 'clave') modalRestablecerClave(usuario, recargar);
  });

  filtrar();
}

/**
 * Por qué una fila NO se puede gestionar desde aquí (o null si sí se puede).
 * Refleja las reglas del backend para no ofrecer botones que acabarían en 403.
 */
function bloqueoUsuario(u) {
  const yo = sesion();
  if (u.rol === 'PROPIETARIO') {
    return `<span class="etiqueta etiqueta--ambar"><i data-icono="lock"></i> Propietario</span>`;
  }
  if (yo && String(u.id) === String(yo.id)) {
    return `<span class="admin-pista"><i data-icono="user-cog"></i> Tu cuenta: edítala en Mi perfil</span>`;
  }
  if (u.rol === 'ADMINISTRADOR' && !puede('GESTIONAR_ADMINISTRADORES')) {
    return `<span class="admin-pista"><i data-icono="lock"></i> Sólo el propietario</span>`;
  }
  return null;
}

function filaUsuario(u) {
  const bloqueo = bloqueoUsuario(u);
  const acciones = bloqueo || `
    <div class="acciones-fila">
      <button type="button" class="btn-icono" data-accion="editar" data-id="${esc(u.id)}"
              title="Editar" aria-label="Editar a ${esc(u.nombre)}">
        <i data-icono="pencil"></i>
      </button>
      <button type="button" class="btn-icono" data-accion="clave" data-id="${esc(u.id)}"
              title="Restablecer contraseña" aria-label="Restablecer la contraseña de ${esc(u.nombre)}">
        <i data-icono="key-round"></i>
      </button>
    </div>`;

  return `
    <tr class="${u.activo ? '' : 'admin-fila--inactiva'}">
      <td>
        <div class="admin-persona">
          <span class="ficha" aria-hidden="true">${esc(iniciales(u.nombre))}</span>
          <div><b>${esc(u.nombre)}</b><small>${esc(u.usuario)}</small></div>
        </div>
      </td>
      <td>${esc(u.rolNombre || u.rol)}</td>
      <td>${u.correo ? esc(u.correo) : '<span class="admin-sub">—</span>'}</td>
      <td>${u.activo
        ? '<span class="etiqueta etiqueta--ok">Activo</span>'
        : '<span class="etiqueta etiqueta--neutra">Inactivo</span>'}</td>
      <td>${u.ultimoIngreso
        ? `${esc(fechaHora(u.ultimoIngreso))}<span class="admin-sub">${esc(relativo(u.ultimoIngreso))}</span>`
        : '<span class="admin-sub">Nunca</span>'}</td>
      <td style="text-align:right">${acciones}</td>
    </tr>`;
}

/**
 * Opciones del select de rol. Si el rol actual del usuario no está entre los
 * asignables se añade igual, para que abrir y guardar sin tocar nada no le
 * cambie el rol por el primero de la lista.
 */
function opcionesRol(roles, actual, actualNombre) {
  const lista = [...roles];
  if (actual && !lista.some(r => r.codigo === actual)) {
    lista.unshift({ codigo: actual, nombre: actualNombre || actual });
  }
  return (actual ? '' : '<option value="" disabled selected>Elige un rol…</option>') +
    lista.map(r => `
      <option value="${esc(r.codigo)}" ${r.codigo === actual ? 'selected' : ''}>${esc(r.nombre)}</option>`
    ).join('');
}

/** Valida contraseña + repetición en cliente. Devuelve true si es válida. */
function claveValida(caja, idClave, idRepetir) {
  const clave = $('#' + idClave, caja).value;
  const repetir = $('#' + idRepetir, caja).value;
  if (clave.length < 8) {
    aviso('Contraseña muy corta', 'Debe tener al menos 8 caracteres.', 'alerta');
    $('#' + idClave, caja).focus();
    return false;
  }
  if (clave !== repetir) {
    aviso('Las contraseñas no coinciden', 'Escribe la misma contraseña en los dos campos.', 'alerta');
    $('#' + idRepetir, caja).focus();
    return false;
  }
  return true;
}

function camposClave(prefijo, etiqueta = 'Contraseña') {
  return `
    <div class="campo">
      <label for="${prefijo}-clave">${esc(etiqueta)} <span class="obligatorio">*</span></label>
      <input id="${prefijo}-clave" type="password" minlength="8" required autocomplete="new-password">
      <small>Mínimo 8 caracteres.</small>
    </div>
    <div class="campo">
      <label for="${prefijo}-repetir">Repetir contraseña <span class="obligatorio">*</span></label>
      <input id="${prefijo}-repetir" type="password" minlength="8" required autocomplete="new-password">
    </div>`;
}

async function modalNuevoUsuario(alGuardar) {
  let roles;
  try { roles = await obtenerRoles(); }
  catch (error) { aviso('No se cargaron los roles', error.message, 'error'); return; }

  abrirModal({
    html: `
      ${cabezaModal({ sello: 'ok', icono: 'users', titulo: 'Nuevo usuario',
                      texto: 'La cuenta queda activa y puede entrar de inmediato.' })}
      <form novalidate>
        <div class="modal__cuerpo">
          <div class="rejilla rejilla--2">
            <div class="campo">
              <label for="u-usuario">Usuario <span class="obligatorio">*</span></label>
              <input id="u-usuario" type="text" required maxlength="40" autocomplete="off"
                     pattern="^[\\w.\\-]{3,40}$" spellcheck="false">
              <small>3 a 40 caracteres: letras, números, punto, guion o guion bajo.</small>
            </div>
            <div class="campo">
              <label for="u-rol">Rol <span class="obligatorio">*</span></label>
              <select id="u-rol" required>${opcionesRol(roles, '')}</select>
            </div>
            <div class="campo">
              <label for="u-nombres">Nombres <span class="obligatorio">*</span></label>
              <input id="u-nombres" type="text" required maxlength="80" autocomplete="off">
            </div>
            <div class="campo">
              <label for="u-apellidos">Apellidos <span class="obligatorio">*</span></label>
              <input id="u-apellidos" type="text" required maxlength="80" autocomplete="off">
            </div>
            <div class="campo campo--ancho">
              <label for="u-correo">Correo <small>(opcional)</small></label>
              <input id="u-correo" type="email" maxlength="120" autocomplete="off">
            </div>
            ${camposClave('u')}
          </div>
        </div>
        ${pieModal('Crear usuario', 'plus')}
      </form>`,

    alMontar(caja, cerrar) {
      $('form', caja).addEventListener('submit', async ev => {
        ev.preventDefault();
        const forma = ev.currentTarget;

        // Validación nativa campo a campo (novalidate evita el globo del
        // navegador al enviar; aquí lo pedimos sobre el primer inválido).
        const invalido = $$('input, select', forma).find(el => !el.checkValidity());
        if (invalido) {
          invalido.reportValidity();
          return;
        }
        if (!claveValida(caja, 'u-clave', 'u-repetir')) return;

        const datos = {
          usuario: val(caja, 'u-usuario'),
          nombres: val(caja, 'u-nombres'),
          apellidos: val(caja, 'u-apellidos'),
          correo: val(caja, 'u-correo') || null,
          rol: $('#u-rol', caja).value,
          clave: $('#u-clave', caja).value
        };

        try {
          await conCarga($('button[type="submit"]', forma), () => API.crearUsuario(datos));
          cerrar();
          aviso('Usuario creado', `${datos.nombres} ${datos.apellidos} · ${datos.usuario}`, 'ok');
          alGuardar();
        } catch (error) {
          aviso('No se creó', error.message, 'error');
          marcarCampos(error, {
            usuario: 'u-usuario', nombres: 'u-nombres', apellidos: 'u-apellidos',
            correo: 'u-correo', rol: 'u-rol', clave: 'u-clave'
          }, caja);
        }
      });
    }
  });
}

async function modalEditarUsuario(u, alGuardar) {
  let roles;
  try { roles = await obtenerRoles(); }
  catch (error) { aviso('No se cargaron los roles', error.message, 'error'); return; }

  abrirModal({
    html: `
      ${cabezaModal({ sello: 'ambar', icono: 'pencil', titulo: `Editar ${u.nombre}`,
                      texto: `Usuario ${u.usuario}` })}
      <form novalidate>
        <div class="modal__cuerpo">
          <div class="rejilla rejilla--2">
            <div class="campo">
              <label for="e-nombres">Nombres <span class="obligatorio">*</span></label>
              <input id="e-nombres" type="text" required maxlength="80" value="${esc(u.nombres)}">
            </div>
            <div class="campo">
              <label for="e-apellidos">Apellidos <span class="obligatorio">*</span></label>
              <input id="e-apellidos" type="text" required maxlength="80" value="${esc(u.apellidos)}">
            </div>
            <div class="campo">
              <label for="e-correo">Correo <small>(opcional)</small></label>
              <input id="e-correo" type="email" maxlength="120" value="${esc(u.correo || '')}">
            </div>
            <div class="campo">
              <label for="e-rol">Rol <span class="obligatorio">*</span></label>
              <select id="e-rol" required>${opcionesRol(roles, u.rol, u.rolNombre)}</select>
            </div>
            <div class="campo campo--ancho">
              <label class="admin-casilla">
                <input id="e-activo" type="checkbox" ${u.activo ? 'checked' : ''}>
                <span>
                  Cuenta activa
                  <small>
                    Al desactivarla se cierran de inmediato todas sus sesiones abiertas
                    y ya no podrá entrar. Su historial de pesajes se conserva.
                  </small>
                </span>
              </label>
            </div>
          </div>
        </div>
        ${pieModal('Guardar cambios')}
      </form>`,

    alMontar(caja, cerrar) {
      $('form', caja).addEventListener('submit', async ev => {
        ev.preventDefault();
        const forma = ev.currentTarget;
        const invalido = $$('input, select', forma).find(el => !el.checkValidity());
        if (invalido) { invalido.reportValidity(); return; }

        const datos = {
          nombres: val(caja, 'e-nombres'),
          apellidos: val(caja, 'e-apellidos'),
          correo: val(caja, 'e-correo') || null,
          rol: $('#e-rol', caja).value,
          activo: $('#e-activo', caja).checked
        };

        try {
          await conCarga($('button[type="submit"]', forma), () => API.editarUsuario(u.id, datos));
          cerrar();
          aviso('Usuario actualizado', `${datos.nombres} ${datos.apellidos}`, 'ok');
          alGuardar();
        } catch (error) {
          aviso('No se guardó', error.message, 'error');
          marcarCampos(error, {
            nombres: 'e-nombres', apellidos: 'e-apellidos', correo: 'e-correo',
            rol: 'e-rol', activo: 'e-activo'
          }, caja);
        }
      });
    }
  });
}

function modalRestablecerClave(u, alGuardar) {
  abrirModal({
    ancho: 'angosto',
    html: `
      ${cabezaModal({ sello: 'ambar', icono: 'key-round', titulo: 'Restablecer contraseña',
                      texto: `${u.nombre} · ${u.usuario}` })}
      <form novalidate>
        <div class="modal__cuerpo">
          <div class="rejilla rejilla--1">
            ${camposClave('r', 'Contraseña nueva')}
          </div>
          <p class="nota admin-modal-nota">
            <i data-icono="shield-check"></i>
            <span>
              Se cerrarán todas sus sesiones abiertas. Comunícale la contraseña nueva
              por un medio seguro; podrá cambiarla después desde Mi perfil.
            </span>
          </p>
        </div>
        ${pieModal('Restablecer', 'key-round')}
      </form>`,

    alMontar(caja, cerrar) {
      $('form', caja).addEventListener('submit', async ev => {
        ev.preventDefault();
        if (!claveValida(caja, 'r-clave', 'r-repetir')) return;
        const clave = $('#r-clave', caja).value;

        try {
          await conCarga($('button[type="submit"]', ev.currentTarget),
                         () => API.restablecerClave(u.id, clave));
          cerrar();
          aviso('Contraseña restablecida', `${u.nombre}: sus sesiones se cerraron.`, 'ok');
          alGuardar();
        } catch (error) {
          aviso('No se restableció', error.message, 'error');
          marcarCampos(error, { claveNueva: 'r-clave', clave: 'r-clave' }, caja);
        }
      });
    }
  });
}

/* ============================================================================
 *  2 · CATÁLOGOS
 * ==========================================================================*/

const CATALOGOS = [
  { tipo: 'areas',     titulo: 'Áreas',              nuevo: 'Nueva área',     icono: 'map-pin',
    sub: 'Áreas de proceso y de destino' },
  { tipo: 'productos', titulo: 'Productos',          nuevo: 'Nuevo producto', icono: 'package',
    sub: 'Lo que sale de cada producción' },
  { tipo: 'materias',  titulo: 'Materias',           nuevo: 'Nueva materia',  icono: 'disc-3',
    sub: 'Tipos de bobina' },
  { tipo: 'unidades',  titulo: 'Unidades de medida', nuevo: 'Nueva unidad',   icono: 'ruler',
    sub: 'Unidad de la cantidad a producir' }
];

async function pintarCatalogos(panel, turno) {
  cargando(panel, 'Cargando catálogos…');

  let datos;
  try { datos = await API.catalogos(true); }
  catch (error) {
    if (vigente(turno, panel)) falloCarga(panel, error, () => pintarCatalogos(panel, ++turnoActual));
    return;
  }
  if (!vigente(turno, panel)) return;

  panel.innerHTML = `
    <p class="nota">
      <i data-icono="info"></i>
      <span>
        Los elementos de un catálogo no se borran: se <b>desactivan</b>. Así dejan
        de ofrecerse al abrir producciones nuevas, pero las producciones antiguas
        conservan su nombre en el historial y en los reportes.
      </span>
    </p>
    <div class="admin-rejilla">
      ${CATALOGOS.map(c => tarjetaCatalogo(c, datos[c.tipo] || [])).join('')}
    </div>`;
  montarIconos(panel);

  const recargar = () => pintarCatalogos(panel, ++turnoActual);

  $$('[data-catalogo]', panel).forEach(tarjeta => {
    const cat = CATALOGOS.find(c => c.tipo === tarjeta.dataset.catalogo);
    const lista = datos[cat.tipo] || [];

    tarjeta.addEventListener('click', ev => {
      const boton = ev.target.closest('[data-accion]');
      if (!boton) return;
      if (boton.dataset.accion === 'agregar') modalCatalogo(cat, null, recargar);
      if (boton.dataset.accion === 'editar') {
        const elemento = lista.find(e => String(e.id) === boton.dataset.id);
        if (elemento) modalCatalogo(cat, elemento, recargar);
      }
    });
  });
}

function tarjetaCatalogo(cat, lista) {
  const conCodigo = cat.tipo === 'unidades';
  const activos = lista.filter(e => e.activo).length;

  // Activos primero y luego alfabético: lo que se usa a diario arriba.
  const orden = [...lista].sort((a, b) =>
    (b.activo - a.activo) || String(a.nombre).localeCompare(String(b.nombre), 'es'));

  const filas = orden.map(e => `
    <tr class="${e.activo ? '' : 'admin-fila--inactiva'}">
      <td>
        <span class="admin-nombre">${esc(e.nombre)}</span>
        ${e.observaciones ? `<span class="admin-sub admin-texto">${esc(e.observaciones)}</span>` : ''}
      </td>
      ${conCodigo ? `<td class="num">${esc(e.codigo || '')}</td>` : ''}
      <td>${e.activo
        ? '<span class="etiqueta etiqueta--ok">Activo</span>'
        : '<span class="etiqueta etiqueta--neutra">Inactivo</span>'}</td>
      <td>
        <div class="acciones-fila">
          <button type="button" class="btn-icono" data-accion="editar" data-id="${esc(e.id)}"
                  title="Editar" aria-label="Editar ${esc(e.nombre)}">
            <i data-icono="pencil"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');

  return `
    <section class="tarjeta" data-catalogo="${cat.tipo}">
      <div class="tarjeta__cabeza">
        <span class="admin-sello"><i data-icono="${cat.icono}"></i></span>
        <div class="admin-titulo">
          <h3>${esc(cat.titulo)}</h3>
          <p>${esc(cat.sub)} · ${activos} activos de ${lista.length}</p>
        </div>
        <div class="acciones">
          <button type="button" class="btn btn--linea btn--sm" data-accion="agregar">
            <i data-icono="plus"></i> Agregar
          </button>
        </div>
      </div>
      ${lista.length ? `
        <div class="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                ${conCodigo ? '<th>Código</th>' : ''}
                <th>Estado</th>
                <th aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>`
      : vacio(cat.icono, 'Sin elementos', 'Todavía no hay nada en este catálogo. Usa «Agregar».')}
    </section>`;
}

function modalCatalogo(cat, elemento, alGuardar) {
  const editando = Boolean(elemento);
  const conCodigo = cat.tipo === 'unidades';
  const e = elemento || {};

  abrirModal({
    html: `
      ${cabezaModal({
        sello: editando ? 'ambar' : 'ok',
        icono: editando ? 'pencil' : cat.icono,
        titulo: editando ? `Editar ${e.nombre}` : cat.nuevo,
        texto: cat.titulo
      })}
      <form novalidate>
        <div class="modal__cuerpo">
          <div class="rejilla ${conCodigo ? 'rejilla--2' : 'rejilla--1'}">
            <div class="campo">
              <label for="c-nombre">Nombre <span class="obligatorio">*</span></label>
              <input id="c-nombre" type="text" required maxlength="80" value="${esc(e.nombre || '')}">
            </div>
            ${conCodigo ? `
              <div class="campo">
                <label for="c-codigo">Código <span class="obligatorio">*</span></label>
                <input id="c-codigo" type="text" required maxlength="10" spellcheck="false"
                       value="${esc(e.codigo || '')}" placeholder="kg, t, und…">
                <small>Abreviatura que aparece junto a la cantidad (máx. 10).</small>
              </div>` : ''}
            <div class="campo campo--ancho">
              <label for="c-observaciones">Observaciones <small>(opcional)</small></label>
              <textarea id="c-observaciones" maxlength="300">${esc(e.observaciones || '')}</textarea>
            </div>
            ${editando ? `
              <div class="campo campo--ancho">
                <label class="admin-casilla">
                  <input id="c-activo" type="checkbox" ${e.activo ? 'checked' : ''}>
                  <span>
                    Activo
                    <small>Desactivado deja de ofrecerse en producciones nuevas; las anteriores lo conservan.</small>
                  </span>
                </label>
              </div>` : ''}
          </div>
        </div>
        ${pieModal(editando ? 'Guardar cambios' : 'Agregar', editando ? 'save' : 'plus')}
      </form>`,

    alMontar(caja, cerrar) {
      $('form', caja).addEventListener('submit', async ev => {
        ev.preventDefault();
        const forma = ev.currentTarget;
        const invalido = $$('input, textarea', forma).find(el => !el.checkValidity());
        if (invalido) { invalido.reportValidity(); return; }

        const datos = {
          nombre: val(caja, 'c-nombre'),
          observaciones: val(caja, 'c-observaciones') || null
        };
        if (conCodigo) datos.codigo = val(caja, 'c-codigo');
        if (editando) datos.activo = $('#c-activo', caja).checked;

        try {
          await conCarga($('button[type="submit"]', forma), () => (editando
            ? API.editarCatalogo(cat.tipo, e.id, datos)
            : API.crearCatalogo(cat.tipo, datos)));
          cerrar();
          aviso(editando ? 'Catálogo actualizado' : 'Agregado al catálogo',
                `${cat.titulo}: ${datos.nombre}`, 'ok');
          alGuardar();
        } catch (error) {
          aviso('No se guardó', error.message, 'error');
          marcarCampos(error, {
            nombre: 'c-nombre', codigo: 'c-codigo', observaciones: 'c-observaciones'
          }, caja);
        }
      });
    }
  });
}

/* ============================================================================
 *  3 · BÁSCULA
 * ==========================================================================*/

async function pintarBascula(panel, turno) {
  cargando(panel, 'Cargando báscula…');

  let datos;
  try { datos = await API.catalogos(true); }
  catch (error) {
    if (vigente(turno, panel)) falloCarga(panel, error, () => pintarBascula(panel, ++turnoActual));
    return;
  }
  if (!vigente(turno, panel)) return;

  const b = datos.bascula;
  if (!b) {
    panel.innerHTML = `<div class="tarjeta">${vacio('scale', 'Sin báscula activa',
      'El servidor no tiene ninguna báscula activa configurada.')}</div>`;
    montarIconos(panel);
    return;
  }

  // Sólo áreas activas; si la báscula apunta a una desactivada se conserva
  // como opción para que guardar sin tocar nada no la desasigne.
  const areas = (datos.areas || []).filter(a => a.activo || String(a.id) === String(b.areaId));
  const opcionesArea = `<option value="">Sin área</option>` + areas.map(a => `
    <option value="${esc(a.id)}" ${String(a.id) === String(b.areaId) ? 'selected' : ''}>
      ${esc(a.nombre)}${a.activo ? '' : ' (inactiva)'}
    </option>`).join('');

  panel.innerHTML = `
    <div class="tarjeta admin-forma-bascula">
      <div class="tarjeta__cabeza">
        <span class="admin-sello"><i data-icono="scale"></i></span>
        <div class="admin-titulo">
          <h3>Báscula activa</h3>
          <p>${esc(b.modeloCompleto || [b.marca, b.modelo].filter(Boolean).join(' '))}</p>
        </div>
      </div>
      <form class="tarjeta__cuerpo" novalidate>
        <div class="rejilla rejilla--3">
          <div class="campo">
            <label for="b-codigo">Código</label>
            <input id="b-codigo" type="text" readonly value="${esc(b.codigo)}">
          </div>
          <div class="campo">
            <label for="b-marca">Marca <span class="obligatorio">*</span></label>
            <input id="b-marca" type="text" required maxlength="60" value="${esc(b.marca || '')}">
          </div>
          <div class="campo">
            <label for="b-modelo">Modelo <span class="obligatorio">*</span></label>
            <input id="b-modelo" type="text" required maxlength="60" value="${esc(b.modelo || '')}">
          </div>
          <div class="campo">
            <label for="b-capacidad">Capacidad (kg) <span class="obligatorio">*</span></label>
            <input id="b-capacidad" type="number" required min="0.5" step="0.5" inputmode="decimal"
                   class="num" value="${esc(b.capacidadKg ?? '')}">
          </div>
          <div class="campo">
            <label for="b-division">División (kg) <span class="obligatorio">*</span></label>
            <input id="b-division" type="number" required min="0.01" step="0.01" inputmode="decimal"
                   class="num" value="${esc(b.divisionKg ?? '')}">
            <small>Resolución mínima que marca la celda.</small>
          </div>
          <div class="campo">
            <label for="b-area">Área</label>
            <select id="b-area">${opcionesArea}</select>
          </div>
        </div>

        <p class="nota admin-modal-nota">
          <i data-icono="info"></i>
          <span>
            Las pantallas de pesaje ya abiertas tomarán la nueva capacidad y división
            cuando se reconecten a la báscula. Los pesajes ya registrados conservan
            los datos del equipo con que se tomaron.
          </span>
        </p>

        <div class="acciones-forma">
          <button type="submit" class="btn btn--primario">
            <i data-icono="save"></i> Guardar báscula
          </button>
        </div>
      </form>
    </div>`;
  montarIconos(panel);

  $('form', panel).addEventListener('submit', async ev => {
    ev.preventDefault();
    const forma = ev.currentTarget;
    const invalido = $$('input:not([readonly]), select', forma).find(el => !el.checkValidity());
    if (invalido) { invalido.reportValidity(); return; }

    const capacidadKg = Number($('#b-capacidad', forma).value);
    const divisionKg = Number($('#b-division', forma).value);
    if (divisionKg >= capacidadKg) {
      aviso('División inválida', 'La división debe ser menor que la capacidad.', 'alerta');
      $('#b-division', forma).focus();
      return;
    }

    const area = $('#b-area', forma).value;
    const datosB = {
      marca: val(forma, 'b-marca'),
      modelo: val(forma, 'b-modelo'),
      capacidadKg,
      divisionKg,
      areaId: area ? Number(area) : null
    };

    try {
      await conCarga($('button[type="submit"]', forma), () => API.editarBascula(datosB));
      aviso('Báscula actualizada', `${b.codigo} · ${datosB.marca} ${datosB.modelo}`, 'ok');
      // El formulario no es modal: si mientras guardaba se cambió de pestaña,
      // no se repinta encima de la otra.
      if (panel.getAttribute('aria-labelledby') === 'admin-tab-bascula') {
        pintarBascula(panel, ++turnoActual);
      }
    } catch (error) {
      aviso('No se guardó', error.message, 'error');
      marcarCampos(error, {
        marca: 'b-marca', modelo: 'b-modelo', capacidadKg: 'b-capacidad',
        divisionKg: 'b-division', areaId: 'b-area'
      }, forma);
    }
  });
}

/* ============================================================================
 *  4 · AUDITORÍA
 * ==========================================================================*/

const ACCIONES = {
  CONFIGURACION_INICIAL: 'Configuración inicial',
  ALTA_USUARIO: 'Alta de usuario',
  EDICION_USUARIO: 'Edición de usuario',
  RESTABLECER_CLAVE: 'Clave restablecida',
  CAMBIO_CLAVE: 'Cambio de clave',
  ALTA_CATALOGO: 'Alta en catálogo',
  EDICION_CATALOGO: 'Edición de catálogo',
  EDICION_BASCULA: 'Edición de báscula',
  EDICION_PRODUCCION: 'Producción corregida',
  TERMINAR_PRODUCCION: 'Producción terminada',
  ANULAR_PRODUCCION: 'Producción anulada',
  EDICION_PESAJE: 'Pesaje corregido',
  ANULAR_PESAJE: 'Pesaje anulado',
  EDICION_PERMISOS: 'Permisos cambiados'
};

const nombreAccion = (codigo) => ACCIONES[codigo] || codigo || '—';

async function pintarAuditoria(panel, turno) {
  cargando(panel, 'Cargando auditoría…');

  let registros;
  try { registros = await API.auditoria(300); }
  catch (error) {
    if (vigente(turno, panel)) falloCarga(panel, error, () => pintarAuditoria(panel, ++turnoActual));
    return;
  }
  if (!vigente(turno, panel)) return;

  panel.innerHTML = `
    <div class="tarjeta">
      <div class="filtros admin-herramientas">
        <div class="campo campo--buscar">
          <label for="a-buscar">Buscar</label>
          <div class="campo__control">
            <i data-icono="search"></i>
            <input id="a-buscar" type="search" placeholder="Usuario, acción, entidad o detalle…">
          </div>
        </div>
      </div>
      <div class="tabla-scroll">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="pie-tabla">
        <span class="admin-contador"></span>
        <span class="admin-sub">Se muestran los 300 movimientos más recientes.</span>
      </div>
    </div>`;
  montarIconos(panel);

  const cuerpo = $('tbody', panel);
  const buscar = $('#a-buscar', panel);
  const contador = $('.admin-contador', panel);

  const filtrar = () => {
    const q = buscar.value.trim().toLowerCase();
    const lista = !q ? registros : registros.filter(r =>
      [r.usuario, r.accion, nombreAccion(r.accion), r.entidad, r.entidadId, r.detalle]
        .some(v => String(v ?? '').toLowerCase().includes(q)));

    cuerpo.innerHTML = lista.length ? lista.map(r => `
      <tr>
        <td>${esc(fechaHora(r.en))}<span class="admin-sub">${esc(relativo(r.en))}</span></td>
        <td>${esc(r.usuario || '—')}</td>
        <td><span class="etiqueta ${String(r.accion).startsWith('ANULAR') ? 'etiqueta--error' : 'etiqueta--neutra'}">
          ${esc(nombreAccion(r.accion))}</span></td>
        <td>${esc(r.entidad || '—')}${r.entidadId != null ? ` <span class="num admin-sub" style="display:inline">#${esc(r.entidadId)}</span>` : ''}</td>
        <td><div class="admin-texto">${r.detalle ? esc(r.detalle) : '—'}</div></td>
      </tr>`).join('')
      : `<tr><td colspan="5">${vacio('activity', q ? 'Sin resultados' : 'Sin movimientos',
          q ? 'Ningún movimiento coincide con la búsqueda.' : 'Todavía no hay acciones registradas.')}</td></tr>`;
    montarIconos(cuerpo);
    contador.textContent = `${lista.length} de ${registros.length} movimientos`;
  };

  buscar.addEventListener('input', filtrar);
  filtrar();
}

/* ============================================================================
 *  6 · ROLES Y PERMISOS · sólo el propietario
 *  --------------------------------------------------------------------------
 *  Una matriz permiso × rol con casillas. La columna del propietario va
 *  marcada y bloqueada (los tiene todos, siempre), igual que las filas de
 *  los permisos exclusivos suyos. Cada rol se guarda por separado y el
 *  cambio aplica en el acto: el backend relee los permisos en cada petición.
 * ==========================================================================*/

async function pintarPermisos(panel, turno) {
  cargando(panel, 'Cargando permisos…');

  let matriz;
  try { matriz = await API.permisos(); }
  catch (error) {
    if (vigente(turno, panel)) falloCarga(panel, error, () => pintarPermisos(panel, ++turnoActual));
    return;
  }
  if (!vigente(turno, panel)) return;

  const { permisos, roles } = matriz;
  const tiene = (rol, codigo) => rol.permisos.includes(codigo);

  panel.innerHTML = `
    <p class="nota" style="margin-bottom:18px">
      <i data-icono="info"></i>
      <span>
        Marca lo que puede hacer cada rol y pulsa <b>Guardar</b> bajo su columna. El
        cambio aplica en el acto a todas las cuentas de ese rol, aunque tengan la
        sesión abierta (el menú se actualiza cuando recargan la página). Los
        permisos con candado son exclusivos del propietario.
      </span>
    </p>
    <div class="tarjeta">
      <div class="tabla-scroll">
        <table class="matriz-permisos">
          <thead>
            <tr>
              <th>Permiso</th>
              ${roles.map(r => `<th class="matriz-permisos__rol">${esc(r.nombre)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${permisos.map(p => `
              <tr>
                <td>
                  <b>${p.fijo ? '<i data-icono="lock"></i> ' : ''}${esc(p.nombre)}</b>
                  <span class="admin-sub">${esc(p.descripcion)}</span>
                </td>
                ${roles.map(r => `
                  <td class="matriz-permisos__celda">
                    <input type="checkbox" data-rol="${esc(r.codigo)}" data-permiso="${esc(p.codigo)}"
                           aria-label="${esc(p.nombre)} · ${esc(r.nombre)}"
                           ${tiene(r, p.codigo) ? 'checked' : ''}
                           ${!r.editable || p.fijo ? 'disabled' : ''}>
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              ${roles.map(r => `
                <td class="matriz-permisos__celda">
                  ${r.editable ? `
                    <button type="button" class="btn btn--primario btn--sm" data-guardar="${esc(r.codigo)}" disabled>
                      <i data-icono="save"></i> Guardar
                    </button>` : '<span class="admin-sub">Fijo</span>'}
                </td>`).join('')}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
  montarIconos(panel);

  const casillas = rol => $$(`input[data-rol="${rol}"]`, panel);
  const marcados = rol => casillas(rol).filter(c => c.checked).map(c => c.dataset.permiso).sort();
  const original = Object.fromEntries(roles.map(r => [r.codigo, marcados(r.codigo).join(',')]));

  // El botón de cada rol sólo se enciende si su columna cambió.
  panel.addEventListener('change', ev => {
    const rol = ev.target.dataset?.rol;
    if (!rol) return;
    const boton = $(`[data-guardar="${rol}"]`, panel);
    if (boton) boton.disabled = marcados(rol).join(',') === original[rol];
  });

  $$('[data-guardar]', panel).forEach(boton => boton.addEventListener('click', async () => {
    const rol = boton.dataset.guardar;
    const nombre = roles.find(r => r.codigo === rol)?.nombre || rol;
    try {
      await conCarga(boton, () => API.asignarPermisos(rol, marcados(rol)));
      original[rol] = marcados(rol).join(',');
      boton.disabled = true;
      aviso('Permisos guardados', `${nombre} · aplican desde ya`, 'ok');
    } catch (error) {
      aviso('No se guardaron', error.message, 'error');
    }
  }));
}
