export function googleAuthError(error) {
  switch (error?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return '';
    case 'auth/popup-blocked': return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio y vuelve a intentarlo.';
    case 'auth/unauthorized-domain': return 'Google no autoriza este dominio. Debe añadirse a los dominios autorizados de Firebase antes de iniciar sesión.';
    case 'auth/network-request-failed': return 'No pudimos conectar con Google. Revisa tu conexión y vuelve a intentarlo.';
    case 'auth/operation-not-supported-in-this-environment': return 'Abre esta misma dirección en Chrome o Edge para continuar con Google.';
    default:
      if (error?.status >= 500) return 'El servidor no pudo completar el acceso. No es necesario cambiar de correo; inténtalo nuevamente cuando se restablezca la conexión con el hotel.';
      if (error?.status !== undefined) return error.message || 'No pudimos completar el acceso con el hotel.';
      return `No pudimos completar Google${error?.code ? ` (${error.code})` : ''}. Inténtalo nuevamente.`;
  }
}
