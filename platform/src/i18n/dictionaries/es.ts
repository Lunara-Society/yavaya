/**
 * Spanish dictionary — the reference locale.
 *
 * Keys are grouped by area. When a key is added here it must be added to every
 * other locale; the `Dictionary` type makes a missing key a compile error, and
 * a test checks that interpolation placeholders match across locales.
 */
export const es = {
  // --- Brand ---------------------------------------------------------------
  'brand.name': 'Yavaya',
  'brand.tagline': 'La infraestructura digital de Centroamérica',
  'brand.description':
    'Una identidad. Una reputación. Múltiples distritos. Yavaya conecta el comercio diario, los servicios, el trabajo profesional, las entregas y el apoyo comunitario en una sola plataforma.',

  // --- Navigation ----------------------------------------------------------
  'nav.primary': 'Navegación principal',
  'nav.home': 'Inicio',
  'nav.districts': 'Distritos',
  'nav.settings': 'Ajustes',
  'nav.status': 'Estado',
  'nav.sign_in': 'Entrar',
  'nav.member_area': 'Área de miembro',
  'nav.tokens': 'Mis tokens',
  'nav.notifications': 'Avisos',
  'nav.location': 'Ubicación y privacidad',
  'nav.security': 'Cuenta y seguridad',
  'nav.skip_to_content': 'Saltar al contenido',

  // --- Global controls ------------------------------------------------------
  'controls.title': 'Ajustes',
  'controls.open': 'Abrir ajustes rápidos',
  'controls.shortcuts': 'Accesos directos',

  // --- Districts -----------------------------------------------------------
  'districts.title': 'Distritos de Yavaya',
  'districts.subtitle': 'Ocho experiencias distintas, una sola identidad y una sola reputación.',
  'district.services.name': 'Servicios',
  'district.services.tagline': 'Pide o ofrece cualquier servicio legítimo cerca de ti.',
  'district.mercadito.name': 'Mercadito',
  'district.mercadito.tagline': 'El mercado regional, más claro y más confiable.',
  'district.yavayago.name': 'YavayaGo',
  'district.yavayago.tagline': 'Entregas y logística local.',
  'district.works.name': 'Works',
  'district.works.tagline': 'Trabajo profesional sin guerras de precios.',
  'district.community.name': 'Comunidad',
  'district.community.tagline': 'Apoyo humano, cercano y respetuoso.',
  'district.impact.name': 'Impacto',
  'district.impact.tagline': 'Causas verificadas y transparencia total.',
  'district.animals.name': 'Animales',
  'district.animals.tagline': 'Adopción, rescate y bienestar animal.',
  'district.tavern.name': 'Taberna',
  'district.tavern.tagline': 'Juegos y retos ligeros de la comunidad.',

  'district.status.available': 'Disponible',
  'district.status.in_development': 'En desarrollo',
  'district.status.planned': 'Planificado',
  'district.status.planned_note': 'Este distrito todavía no está construido.',
  'district.phase': 'Fase {phase}',

  // --- Trust ---------------------------------------------------------------
  'trust.shield': 'Escudo de Confianza',
  'trust.identity_verified': 'Identidad verificada',
  'trust.email_verified': 'Correo verificado',
  'trust.phone_verified': 'Teléfono verificado',
  'trust.account_age': 'Antigüedad de la cuenta',
  'trust.account_age_days': '{days} días',
  'trust.score': 'Puntaje de confianza',
  'trust.transactions': 'Transacciones exitosas',
  'trust.status.trusted': 'Miembro de confianza',
  'trust.status.established': 'Miembro establecido',
  'trust.status.new': 'Miembro nuevo',
  'trust.status.new_member': 'Miembro nuevo',
  'trust.status.restricted': 'Cuenta restringida',
  'trust.status.suspended': 'Cuenta suspendida',
  'trust.status.removed': 'Cuenta retirada',
  'trust.status.unverified': 'Sin verificar',
  'trust.caution.new_account': 'Cuenta reciente: toma precauciones normales.',
  'trust.caution.restricted': 'Esta cuenta está restringida mientras se revisa.',

  // --- Identity / authentication -------------------------------------------
  'auth.register.title': 'Crear tu cuenta Yavaya',
  'auth.register.subtitle': 'Una persona, una cuenta. Tu YAY ID es permanente.',
  'auth.login.title': 'Entrar a Yavaya',
  'auth.email': 'Correo electrónico',
  'auth.password': 'Contraseña',
  'auth.display_name': 'Nombre para mostrar',
  'auth.accept_terms': 'Acepto los términos de uso de Yavaya.',
  'auth.read_terms': 'Leer los términos de uso',
  'auth.submit_register': 'Crear cuenta',
  'auth.submit_login': 'Entrar',
  'auth.sign_out': 'Salir',
  'auth.member_prompt': 'Entra o crea tu cuenta para usar todo Yavaya.',
  'auth.have_account': '¿Ya tienes cuenta?',
  'auth.no_account': '¿No tienes cuenta?',
  'auth.yay_id_explained': 'Tu YAY ID identifica tu cuenta públicamente y no cambia nunca.',
  'auth.registered.title': 'Cuenta creada',
  'auth.registered.body': 'Tu YAY ID es {yayId}. Verifica tu correo para activar la cuenta.',
  'auth.monitoring_notice':
    'Las cuentas nuevas pasan por un período de supervisión de {hours} horas antes de alcanzar el estado estándar.',
  'auth.verification_undeliverable':
    'El envío de correo no está configurado, así que el código no se pudo entregar. Configúralo antes de abrir el registro al público.',
  'auth.verify.title': 'Verifica tu correo',
  'auth.verify.subtitle': 'Enviamos un código de 6 dígitos a {email}.',
  'auth.verify.code': 'Código de verificación',
  'auth.verify.code_hint': 'El código vence en {minutes} minutos.',
  'auth.verify.submit': 'Verificar cuenta',
  'auth.verify.resend': 'Enviar un código nuevo',
  'auth.verify.resend_hint':
    '¿No te llegó? Revisa la carpeta de spam. Un código nuevo anula el anterior.',
  'auth.verify.resent': 'Enviamos un código nuevo. El anterior ya no sirve.',
  'auth.verify.already_verified': 'Tu correo ya está verificado.',
  'auth.verify.continue': 'Verificar mi correo',
  'auth.verify.error_format': 'El código tiene 6 dígitos.',
  'auth.verify.error_mismatch': 'Ese código no es correcto. Revísalo e inténtalo de nuevo.',
  'auth.verify.error_expired': 'Ese código venció. Pide uno nuevo.',
  'auth.verify.error_no_challenge': 'No hay ningún código pendiente. Pide uno nuevo.',
  'auth.verify.error_too_many_attempts':
    'Demasiados intentos con este código. Pide uno nuevo.',
  'auth.verify.error_cooldown': 'Espera {seconds} segundos antes de pedir otro código.',
  'auth.verify.error_daily_limit':
    'Alcanzaste el máximo de códigos por hoy. Inténtalo mañana o escribe a soporte.',

  // --- Email ----------------------------------------------------------------
  'email.verify.subject': 'Tu código de verificación de Yavaya',
  'email.verify.greeting': 'Hola,',
  'email.verify.body':
    'Usa este código para verificar tu cuenta de Yavaya. Vence en {minutes} minutos.',
  'email.verify.ignore': 'Si no creaste esta cuenta, puedes ignorar este mensaje.',

  // --- Settings -------------------------------------------------------------
  'settings.title': 'Ajustes',
  'settings.subtitle': 'Idioma, apariencia, avisos y privacidad.',
  'settings.notifications': 'Avisos',
  'settings.location': 'Ubicación y privacidad',
  'settings.location.explain':
    'Elige con cuánta precisión se muestra tu ubicación a otras personas.',
  'settings.location.gps_note':
    'Dar permiso de GPS nunca aumenta esta precisión. Solo tú la cambias aquí.',
  'settings.location.country': 'País',
  'settings.location.city': 'Ciudad',
  'settings.location.neighborhood': 'Barrio',
  'settings.location.exact': 'Exacta',
  'settings.security': 'Cuenta y seguridad',
  'settings.sign_in_required': 'Entra a tu cuenta para cambiar esto.',
  'settings.status_pointer': '¿Quieres saber qué funciona hoy?',
  'settings.notify.account': 'Mi cuenta',
  'settings.notify.account_detail': 'Verificación, seguridad y cambios importantes.',
  'settings.notify.orders': 'Pedidos y entregas',
  'settings.notify.orders_detail': 'Estado de tus pedidos y solicitudes.',
  'settings.notify.moderation': 'Reportes',
  'settings.notify.moderation_detail': 'Respuestas a los reportes que envías.',
  'settings.notify.tokens': 'Tokens',
  'settings.notify.tokens_detail': 'Movimientos de tu saldo.',
  'settings.notify.live_activity': 'Actividad cercana',
  'settings.notify.live_activity_detail': 'Solo eventos reales de tu zona.',
  'settings.notify.marketing': 'Novedades por correo',
  'settings.notify.marketing_detail': 'Desactivado por defecto.',

  // --- Member area ----------------------------------------------------------
  'account.subtitle': 'Tu identidad, tu reputación y tu saldo.',
  'account.shortcuts': 'Accesos directos',
  'account.activity': 'Actividad reciente',
  'account.activity_empty':
    'Todavía no hay actividad real que mostrar. Yavaya nunca inventa eventos para llenar este espacio.',

  // --- Tokens --------------------------------------------------------------
  'tokens.name': 'Tokens Yavaya',
  'tokens.balance': 'Saldo',
  'tokens.description':
    'Los Tokens Yavaya son créditos de uso de la plataforma. No son criptomoneda, no representan participación ni depósitos, y no son una inversión.',
  'tokens.starter_grant': 'Las cuentas nuevas reciben {perDay} tokens cada 24 horas durante {days} días, hasta {max}.',
  'tokens.cost_publish': 'Publicar contenido que califica cuesta {cost} token.',
  'tokens.view_history': 'Ver mi historial',
  'tokens.history': 'Historial',
  'tokens.packages': 'Paquetes',
  'tokens.purchase_unavailable':
    'La compra de tokens no está disponible: todavía no hay un proveedor de pagos configurado. Los paquetes se muestran solo como información.',
  'tokens.purchase_limit': 'La compra máxima es de {limit} tokens por transacción.',
  'tokens.reason.starter_grant': 'Tokens de bienvenida',
  'tokens.reason.purchase': 'Compra',
  'tokens.reason.admin_grant': 'Otorgado por administración',
  'tokens.reason.admin_revoke': 'Retirado por administración',
  'tokens.reason.admin_correction': 'Corrección administrativa',
  'tokens.reason.reward': 'Recompensa',
  'tokens.reason.referral': 'Referido',
  'tokens.reason.tavern_reward': 'Premio de la Taberna',
  'tokens.reason.action_charge': 'Publicación',
  'tokens.reason.action_refund': 'Reembolso',
  'tokens.reason.transfer_in': 'Transferencia recibida',
  'tokens.reason.transfer_out': 'Transferencia enviada',

  // --- Live activity --------------------------------------------------------
  'activity.listing_published': 'Nueva publicación en {place}',
  'activity.service_request_published': 'Nueva solicitud de servicio en {place}',
  'activity.restaurant_joined': 'Un restaurante se unió a YavayaGo en {place}',
  'activity.animal_adopted': 'Un animal fue adoptado en {place}',
  'activity.project_published': 'Nuevo proyecto publicado en {place}',
  'activity.cause_goal_reached': 'Una causa alcanzó su meta en {place}',
  'activity.member_joined': 'Un nuevo miembro se unió en {place}',

  // --- Capability states ----------------------------------------------------
  'capability.state.REAL': 'Real',
  'capability.state.DEMO': 'Demo',
  'capability.state.MOCK': 'Simulado',
  'capability.state.REQUIRES_CONFIGURATION': 'Requiere configuración',
  'capability.state.REAL.explain': 'Implementado y funcionando de verdad ahora mismo.',
  'capability.state.DEMO.explain':
    'Contenido de muestra, marcado como tal. No cuenta en ninguna estadística y expira.',
  'capability.state.MOCK.explain':
    'Un sustituto sin comportamiento real detrás. Nunca aparece en un flujo que dé a entender que funciona.',
  'capability.state.REQUIRES_CONFIGURATION.explain':
    'Implementado, pero inactivo hasta tener credenciales, un proveedor externo o una decisión regulatoria.',

  // --- Capabilities ---------------------------------------------------------
  'capability.identity.name': 'Identidad y YAY ID',
  'capability.identity.detail': 'Registro, identificador permanente de 8 dígitos y verificación.',
  'capability.authentication.name': 'Autenticación y sesiones',
  'capability.authentication.detail': 'Contraseñas con scrypt, sesiones con rotación y revocación.',
  'capability.email_verification.name': 'Verificación de correo',
  'capability.email_verification.detail':
    'Código de 6 dígitos con vencimiento, límite de intentos y reenvío controlado.',
  'capability.authorization.name': 'Permisos',
  'capability.authorization.detail': 'Roles y permisos verificados en el servidor.',
  'capability.geography.name': 'Geografía',
  'capability.geography.detail': 'Jerarquía de región a barrio; siete países iniciales.',
  'capability.language.name': 'Idioma',
  'capability.language.detail': 'Español e inglés, con detección automática del dispositivo.',
  'capability.appearance.name': 'Apariencia',
  'capability.appearance.detail': 'Tema claro, oscuro o el del sistema.',
  'capability.notification_preferences.name': 'Preferencias de avisos',
  'capability.notification_preferences.detail': 'Control por categoría y canal.',
  'capability.location_privacy.name': 'Privacidad de ubicación',
  'capability.location_privacy.detail': 'Precisión elegida por la persona, nunca por el GPS.',
  'capability.anti_duplication.name': 'Una persona, una cuenta',
  'capability.anti_duplication.detail': 'Señales combinadas y revisión humana; nunca una sola señal.',
  'capability.new_user_monitoring.name': 'Supervisión de cuentas nuevas',
  'capability.new_user_monitoring.detail': 'Período reforzado de 72 horas.',
  'capability.audit.name': 'Registro de auditoría',
  'capability.audit.detail': 'Solo escritura, encadenado por hash y verificable.',
  'capability.tokens.name': 'Tokens',
  'capability.tokens.detail': 'Libro contable atómico, exactamente una vez por acción.',
  'capability.reputation.name': 'Reputación',
  'capability.reputation.detail': 'Reglas configurables con eventos idempotentes.',
  'capability.trust_shield.name': 'Escudo de Confianza',
  'capability.trust_shield.detail': 'Resumen público con límite estricto de privacidad.',
  'capability.rate_limiting.name': 'Límites de uso',
  'capability.rate_limiting.detail': 'Contadores del lado del servidor.',
  'capability.moderation.name': 'Moderación',
  'capability.moderation.detail': 'Reportes, tickets y sanciones.',
  'capability.live_activity.name': 'Actividad en vivo',
  'capability.live_activity.detail': 'Solo eventos reales; nunca se rellena.',
  'capability.districts.name': 'Distritos',
  'capability.districts.detail': 'Las ocho experiencias de distrito.',
  'capability.email_delivery.name': 'Envío de correo',
  'capability.email_delivery.detail': 'Códigos de verificación y comprobantes.',
  'capability.sms_delivery.name': 'Envío de SMS',
  'capability.sms_delivery.detail': 'Verificación de teléfono.',
  'capability.kyc.name': 'Verificación de identidad',
  'capability.kyc.detail': 'Documentos para conductores y verificación personal.',
  'capability.media_storage.name': 'Almacenamiento de imágenes',
  'capability.media_storage.detail': 'Fotos de publicaciones y perfiles.',
  'capability.geoip.name': 'Ubicación aproximada por IP',
  'capability.geoip.detail': 'Sugerencia inicial de país y ciudad.',
  'capability.payments.name': 'Pagos',
  'capability.payments.detail': 'Compra de tokens y suscripciones.',

  // --- Platform status ------------------------------------------------------
  'status.title': 'Estado de la plataforma',
  'status.subtitle': 'Lo que funciona hoy, sin adornos.',
  'status.legend': 'Qué significa cada estado',
  'status.group.platform': 'Plataforma',
  'status.group.trust': 'Confianza y seguridad',
  'status.group.district': 'Distritos',
  'status.group.integration': 'Integraciones externas',
  'status.integration_note':
    'Las integraciones sin configurar se reportan como no disponibles. Yavaya nunca simula un resultado exitoso.',

  // --- Demo ----------------------------------------------------------------
  'demo.badge': 'DEMO',
  'demo.explanation': 'Contenido de demostración. No es real y no cuenta en ninguna estadística.',

  // --- Common --------------------------------------------------------------
  'common.loading': 'Cargando',
  'common.empty': 'Todavía no hay nada aquí.',
  'common.retry': 'Reintentar',
  'common.on': 'Activado',
  'common.off': 'Desactivado',
  'common.language': 'Idioma',
  'common.language.auto': 'Automático',
  'common.language.auto_hint': 'Sigue el idioma de tu dispositivo.',
  'common.language.es': 'Español',
  'common.language.en': 'English',
  'common.theme': 'Tema',
  'common.theme.light': 'Claro',
  'common.theme.dark': 'Oscuro',
  'common.theme.system': 'Sistema',
  'common.theme.system_hint': 'Sigue la apariencia de tu dispositivo.',

  // --- Errors --------------------------------------------------------------
  'error.unauthenticated': 'Necesitas iniciar sesión.',
  'error.forbidden': 'No tienes permiso para hacer esto.',
  'error.not_found': 'No se encontró.',
  'error.validation_failed': 'Revisa los datos e inténtalo de nuevo.',
  'error.rate_limited': 'Demasiados intentos. Intenta de nuevo en {retryAfterSeconds} segundos.',
  'error.risk_blocked': 'No podemos completar esta acción ahora. Un revisor la evaluará.',
  'error.insufficient_tokens': 'No tienes tokens suficientes. Necesitas {required} y tienes {available}.',
  'error.action_not_billable': 'Esta acción no está disponible.',
  'error.integration_unconfigured': 'Esta función todavía no está configurada.',
  'error.internal': 'Algo salió mal. Inténtalo de nuevo.',
  'error.page.title': 'Esta página no existe',
  'error.page.body': 'El enlace puede estar mal escrito o la página ya no está disponible.',
  'error.boundary.title': 'Algo falló de nuestro lado',
  'error.boundary.body': 'No es culpa tuya. Puedes reintentar o volver al inicio.',
  'error.boundary.retry': 'Reintentar',
  'error.boundary.reference': 'Referencia: {digest}',
  'error.password.too_short': 'La contraseña debe tener al menos 10 caracteres.',
  'error.registration.email_unavailable': 'No pudimos crear la cuenta con ese correo.',
  'error.tokens.invalid_amount': 'Cantidad de tokens inválida.',
  'error.tokens.purchase_limit_exceeded': 'La compra máxima es de {limit} tokens.',
} as const;

/**
 * `es` is the key authority. `Dictionary` maps those keys to plain strings, so
 * other locales are checked for key completeness without being forced to
 * repeat the Spanish text.
 */
export type MessageKey = keyof typeof es;
export type Dictionary = Record<MessageKey, string>;
