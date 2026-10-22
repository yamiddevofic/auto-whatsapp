import { promptPassword } from './components/ui.jsx';

/**
 * Pide la contraseña actual antes de una operación destructiva
 * (el servidor la exige: ver Docs/02-hallazgos-seguridad.md SEC-025).
 * Devuelve la contraseña, o null si el usuario cancela.
 */
export function askPassword(message, title = 'Confirma esta acción') {
  return promptPassword({ title, message });
}
