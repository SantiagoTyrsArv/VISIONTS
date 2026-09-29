// Textos de UI. Todas las pantallas leen de aquí vía `t()`, de modo que añadir
// otro idioma consiste en crear otro diccionario con las mismas claves.
export const es = {
  'app.name': 'SeñaVoz',

  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.displayName': 'Nombre',
  'auth.login.title': 'Iniciar sesión',
  'auth.login.submit': 'Entrar',
  'auth.login.toRegister': '¿No tienes cuenta? Regístrate',
  'auth.register.title': 'Crear cuenta',
  'auth.register.submit': 'Registrarme',
  'auth.register.toLogin': '¿Ya tienes cuenta? Inicia sesión',
  'auth.loading': 'Un momento…',

  'validation.emailRequired': 'Ingresa tu correo electrónico',
  'validation.emailInvalid': 'El correo electrónico no es válido',
  'validation.passwordRequired': 'Ingresa tu contraseña',
  'validation.passwordMin': 'La contraseña debe tener al menos 8 caracteres',
  'validation.passwordFormat': 'La contraseña debe incluir al menos una letra y un número',
  'validation.nameRequired': 'Ingresa tu nombre',

  'error.network': 'No se pudo conectar con el servidor. Revisa tu conexión.',
  'error.generic': 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  'error.invalidCredentials': 'Correo o contraseña incorrectos',
  'error.emailTaken': 'Este correo ya está registrado',
  'error.tooManyRequests': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',

  'tabs.home': 'Frases',
  'tabs.camera': 'Cámara',
  'tabs.settings': 'Ajustes',

  'home.title': 'Frases rápidas',
  'home.hint': 'Toca una frase para reproducirla en voz alta',
  'home.loading': 'Cargando frases…',
  'home.error': 'No se pudieron cargar las frases',
  'home.retry': 'Reintentar',
  'home.speakA11y': 'Reproducir en voz alta: {text}',

  'camera.permissionTitle': 'Necesitamos acceso a la cámara',
  'camera.permissionBody': 'La cámara frontal se usará para reconocer tus señas.',
  'camera.permissionGrant': 'Permitir cámara',
  'camera.permissionDenied':
    'El permiso de cámara fue denegado. Actívalo desde los ajustes del sistema.',
  'camera.openSettings': 'Abrir ajustes',
  'camera.comingSoon': 'Reconocimiento de señas: próximamente',
  'camera.debugTitle': 'Depuración',
  'camera.debugSimulate': 'Simular seña: {text}',
  'camera.signDetected': 'Seña detectada: {text}',

  'settings.title': 'Ajustes',
  'settings.profile': 'Perfil',
  'settings.voice': 'Voz',
  'settings.volume': 'Volumen',
  'settings.rate': 'Velocidad',
  'settings.test': 'Probar voz',
  'settings.testPhrase': 'Hola, así sonará mi voz',
  'settings.logout': 'Cerrar sesión',
  'settings.loggingOut': 'Cerrando sesión…',
} as const;

export type TranslationKey = keyof typeof es;
