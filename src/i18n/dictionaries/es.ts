/**
 * Spanish dictionary — the reference locale.
 *
 * Keys are grouped by area. When a key is added here it must be added to every
 * other locale; the `Dictionary` type makes a missing key a compile error.
 */
export const es = {
  // --- Brand ---------------------------------------------------------------
  'brand.name': 'Yavaya',
  'brand.tagline': 'La infraestructura digital de Centroamérica',
  'brand.description':
    'Una identidad. Una reputación. Múltiples distritos. Yavaya conecta el comercio diario, los servicios, el trabajo profesional, las entregas y el apoyo comunitario en una sola plataforma.',

  // --- Navigation ----------------------------------------------------------
  'nav.home': 'Inicio',
  'nav.districts': 'Distritos',
  'nav.search': 'Buscar',
  'nav.notifications': 'Avisos',
  'nav.account': 'Mi cuenta',
  'nav.status': 'Estado',
  'nav.skip_to_content': 'Saltar al contenido',

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
  'auth.submit_register': 'Crear cuenta',
  'auth.submit_login': 'Entrar',
  'auth.have_account': '¿Ya tienes cuenta?',
  'auth.no_account': '¿No tienes cuenta?',
  'auth.yay_id_explained': 'Tu YAY ID identifica tu cuenta públicamente y no cambia nunca.',
  'auth.registered.title': 'Cuenta creada',
  'auth.registered.body': 'Tu YAY ID es {yayId}. Verifica tu correo para activar la cuenta.',
  'auth.monitoring_notice':
    'Las cuentas nuevas pasan por un período de supervisión de {hours} horas antes de alcanzar el estado estándar.',
  'auth.verification_undeliverable':
    'El envío de correo no está configurado, así que el código no se pudo entregar. Configúralo antes de abrir el registro al público.',

  // --- Tokens --------------------------------------------------------------
  'tokens.name': 'Tokens Yavaya',
  'tokens.balance': 'Saldo',
  'tokens.description':
    'Los Tokens Yavaya son créditos de uso de la plataforma. No son criptomoneda, no representan participación ni depósitos, y no son una inversión.',
  'tokens.starter_grant': 'Las cuentas nuevas reciben {perDay} tokens cada 24 horas durante {days} días, hasta {max}.',
  'tokens.cost_publish': 'Publicar contenido que califica cuesta {cost} token.',

  // --- Platform status ------------------------------------------------------
  'status.title': 'Estado de la plataforma',
  'status.subtitle': 'Lo que está construido hoy y lo que falta configurar.',
  'status.built': 'Construido',
  'status.not_built': 'Todavía no',
  'status.configured': 'Configurado',
  'status.unconfigured': 'Sin configurar',
  'status.integration_note':
    'Las integraciones sin configurar se reportan como no disponibles. Yavaya nunca simula un resultado exitoso.',

  // --- Demo ----------------------------------------------------------------
  'demo.badge': 'DEMO',
  'demo.explanation': 'Contenido de demostración. No es real y no cuenta en ninguna estadística.',

  // --- Common --------------------------------------------------------------
  'common.loading': 'Cargando',
  'common.empty': 'Todavía no hay nada aquí.',
  'common.retry': 'Reintentar',
  'common.language': 'Idioma',
  'common.theme': 'Tema',
  'common.theme.light': 'Claro',
  'common.theme.dark': 'Oscuro',
  'common.theme.system': 'Sistema',

  // --- Errors --------------------------------------------------------------
  'error.unauthenticated': 'Necesitas iniciar sesión.',
  'error.forbidden': 'No tienes permiso para hacer esto.',
  'error.not_found': 'No se encontró.',
  'error.rate_limited': 'Demasiados intentos. Intenta de nuevo en {retryAfterSeconds} segundos.',
  'error.risk_blocked': 'No podemos completar esta acción ahora. Un revisor la evaluará.',
  'error.insufficient_tokens': 'No tienes tokens suficientes. Necesitas {required} y tienes {available}.',
  'error.action_not_billable': 'Esta acción no está disponible.',
  'error.integration_unconfigured': 'Esta función todavía no está configurada.',
  'error.internal': 'Algo salió mal. Inténtalo de nuevo.',
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
