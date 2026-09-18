package ni.com.incasa.pesaje.auth;

import ni.com.incasa.pesaje.usuario.UsuarioDto;

/**
 * Respuesta común de login y configuración inicial.
 *
 *   { "token": "…", "expiraEn": 28800, "usuario": { … } }
 *
 * PENDIENTE · SEGURIDAD: el frontend guarda hoy este token en sessionStorage.
 * Lo recomendable en planta es emitirlo como cookie httpOnly + SameSite=Strict
 * desde aquí, y que el navegador no lo vea nunca. Exige cambiar también
 * js/api.js y js/ui.js.
 */
public record SesionRespuesta(String token, long expiraEn, UsuarioDto usuario) { }
