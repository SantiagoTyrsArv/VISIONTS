// Textos de UI. Todas las pantallas leen de aquí vía `t()`, de modo que añadir
// otro idioma consiste en crear otro diccionario con las mismas claves.
export const es = {
  'app.name': 'SeñaVoz',
  'app.loading': 'Cargando…',

  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.confirmPassword': 'Confirmar contraseña',
  'auth.displayName': 'Nombre',
  'auth.login.title': 'Iniciar sesión',
  'auth.login.submit': 'Entrar',
  'auth.login.toRegister': '¿No tienes cuenta? Regístrate',
  'auth.login.forgotPassword': '¿Olvidaste tu contraseña?',
  'auth.register.title': 'Crear cuenta',
  'auth.register.submit': 'Registrarme',
  'auth.register.toLogin': '¿Ya tienes cuenta? Inicia sesión',
  'auth.forgot.title': 'Recuperar contraseña',
  'auth.forgot.hint':
    'Escribe tu correo y te enviaremos instrucciones para restablecer tu contraseña.',
  'auth.forgot.submit': 'Enviar instrucciones',
  'auth.forgot.sentTitle': 'Revisa tu correo',
  'auth.forgot.sentBody':
    'Si hay una cuenta asociada a este correo, recibirás un enlace para restablecer tu contraseña en:',
  'auth.forgot.backToLogin': 'Volver al inicio de sesión',
  'auth.loading': 'Un momento…',

  'validation.emailRequired': 'Ingresa tu correo electrónico',
  'validation.emailInvalid': 'El correo electrónico no es válido',
  'validation.passwordRequired': 'Ingresa tu contraseña',
  'validation.passwordMin': 'La contraseña debe tener al menos 8 caracteres',
  'validation.passwordFormat': 'La contraseña debe incluir al menos una letra y un número',
  'validation.nameRequired': 'Ingresa tu nombre',
  'validation.confirmPasswordRequired': 'Confirma tu contraseña',
  'validation.passwordMismatch': 'Las contraseñas no coinciden',

  'error.network': 'No se pudo conectar con el servidor. Revisa tu conexión.',
  'error.generic': 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  'error.invalidCredentials': 'Correo o contraseña incorrectos',
  'error.emailTaken': 'Este correo ya está registrado',
  'error.tooManyRequests': 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',

  'nav.label': 'Navegación principal',
  'nav.home': 'Frases',
  'nav.camera': 'Cámara',
  'nav.settings': 'Ajustes',

  'home.title': 'Frases rápidas',
  'home.hint': 'Haz clic en una frase para reproducirla. Atajos: teclas 1–9',
  'home.loading': 'Cargando frases…',
  'home.error': 'No se pudieron cargar las frases',
  'home.retry': 'Reintentar',
  'home.speakA11y': 'Reproducir en voz alta: {text}',

  'camera.permissionDenied':
    'Windows bloqueó el acceso a la cámara. Actívalo en Configuración › Privacidad › Cámara y vuelve a intentarlo.',
  'camera.starting': 'Iniciando cámara…',
  'camera.noCamera': 'No se encontró ninguna cámara. Conecta una webcam y vuelve a intentarlo.',
  'camera.inUse': 'La cámara está en uso por otra aplicación. Ciérrala y vuelve a intentarlo.',
  'camera.error': 'No se pudo iniciar la cámara.',
  'camera.retry': 'Reintentar',
  'camera.select': 'Cámara',
  'camera.visionStarting': 'Iniciando detección de manos…',
  'camera.searchingHands': 'Buscando manos…',
  'camera.handsDetected': 'Manos detectadas',
  'camera.modelUnavailable': 'Detector activo. Falta un modelo entrenado para reconocer señas.',
  'camera.handsWithoutModel':
    'Manos detectadas. Falta un modelo entrenado para reconocer las señas.',
  'camera.visionError': 'No se pudo iniciar la detección de manos.',
  'camera.signDetected': 'Seña detectada: {text}',

  'settings.title': 'Ajustes',
  'settings.profile': 'Perfil',
  'settings.voice': 'Voz',
  'settings.voiceName': 'Voz del sistema',
  'settings.voiceDefault': 'Predeterminada del sistema',
  'settings.noSpanishVoice':
    'No hay voces en español instaladas. Añade una en Configuración › Hora e idioma › Voz.',
  'settings.volume': 'Volumen',
  'settings.rate': 'Velocidad',
  'settings.test': 'Probar voz',
  'settings.testPhrase': 'Hola, así sonará mi voz',
  'settings.camera': 'Cámara preferida',
  'settings.cameraDefault': 'Predeterminada',
  'settings.logout': 'Cerrar sesión',
  'settings.loggingOut': 'Cerrando sesión…',
} as const;

export type TranslationKey = keyof typeof es;
