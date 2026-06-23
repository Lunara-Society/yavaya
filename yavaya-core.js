/* ═══════════════════════════════════════════════════════
   YAVAYA CORE — Shared JS for all pages
   • i18n (ES/EN) with data-i18n attributes
   • Theme (dark/light)
   • WhatsApp helpers
   • Nav mobile
   • Toast system
   • Reveal / countup observers
═══════════════════════════════════════════════════════ */

// ── TRANSLATIONS ──
const YV_TRANSLATIONS = {
  es: {
    nav_home: 'Inicio', nav_mercadito: 'Mercadito', nav_yavayago: 'YavayaGo',
    nav_church: 'Santuario', nav_animals: 'Animales', nav_work: 'Trabaja',
    nav_tokens: 'Tokens', nav_ayuda: 'Ayuda',
    nav_login: 'Ingresar', nav_subscribe: 'Suscribirse',
    hero_badge: 'La plataforma #1 de Centroamérica',
    hero_h1: 'Todo lo que', hero_h2: 'necesitas,',
    hero_sub: 'Compra, vende, trabaja, ordena comida y conecta con tu comunidad — construido para Centroamérica.',
    hero_cta1: 'Explorar Mercadito', hero_cta2: 'Pedir Comida', hero_cta3: 'Buscar Trabajo',
    stat_listings: 'Anuncios activos', stat_countries: 'Países', stat_sellers: 'Vendedores', stat_support: 'Soporte',
    sec_platforms: 'Plataformas', sec_platforms_h: 'Tres mundos, un solo lugar',
    sec_features: 'Todo lo que Yavaya es', sec_features_h: 'Para cada parte de tu vida',
    sec_territory: 'Territorio', sec_territory_h: 'Centroamérica es nuestra casa',
    sec_community: 'Comunidad', sec_community_h: 'Lo que dice nuestra gente',
    footer_desc: 'La plataforma digital de Centroamérica.',
    footer_platforms: 'Plataformas', footer_community: 'Comunidad', footer_legal: 'Legal',
    footer_terms: 'Términos de Uso', footer_privacy: 'Privacidad', footer_contact: 'Contacto',
    footer_copy: '© 2026 Yavaya. Hecho con ❤️ para Centroamérica.',
    demo_badge: '⚡ DEMO',
    wa_contact: 'Contactar por WhatsApp',
    wa_order: 'Pedir por WhatsApp',
    listing_publish: '+ Publicar', listing_search: '¿Qué estás buscando?',
    btn_adopt: 'Adoptar ahora', btn_pray: '🙏 Orar', btn_donate: 'Donar',
    btn_subscribe: 'Suscribirse', btn_buy_tokens: '⚡ Comprar tokens',
    sub_weekly: '7 días', sub_monthly: '30 días · -25%',
    work_no_bid: 'Sin licitaciones', work_subscription: 'Suscripción de 1 semana',
    work_payment: 'Tokens o efectivo',
  },
  en: {
    nav_home: 'Home', nav_mercadito: 'Marketplace', nav_yavayago: 'YavayaGo',
    nav_church: 'Sanctuary', nav_animals: 'Animals', nav_work: 'Work',
    nav_tokens: 'Tokens', nav_ayuda: 'Help',
    nav_login: 'Sign in', nav_subscribe: 'Subscribe',
    hero_badge: 'Central America\'s #1 Platform',
    hero_h1: 'Everything you', hero_h2: 'need,',
    hero_sub: 'Buy, sell, work, order food and connect with your community — built for Central America.',
    hero_cta1: 'Explore Marketplace', hero_cta2: 'Order Food', hero_cta3: 'Find Work',
    stat_listings: 'Active listings', stat_countries: 'Countries', stat_sellers: 'Sellers', stat_support: 'Support',
    sec_platforms: 'Platforms', sec_platforms_h: 'Three worlds, one place',
    sec_features: 'Everything Yavaya is', sec_features_h: 'For every part of your life',
    sec_territory: 'Territory', sec_territory_h: 'Central America is our home',
    sec_community: 'Community', sec_community_h: 'What our people say',
    footer_desc: 'Central America\'s digital platform.',
    footer_platforms: 'Platforms', footer_community: 'Community', footer_legal: 'Legal',
    footer_terms: 'Terms of Use', footer_privacy: 'Privacy', footer_contact: 'Contact',
    footer_copy: '© 2026 Yavaya. Made with ❤️ for Central America.',
    demo_badge: '⚡ DEMO',
    wa_contact: 'Contact via WhatsApp',
    wa_order: 'Order via WhatsApp',
    listing_publish: '+ Publish', listing_search: 'What are you looking for?',
    btn_adopt: 'Adopt now', btn_pray: '🙏 Pray', btn_donate: 'Donate',
    btn_subscribe: 'Subscribe', btn_buy_tokens: '⚡ Buy tokens',
    sub_weekly: '7 days', sub_monthly: '30 days · -25%',
    work_no_bid: 'No bidding', work_subscription: '1-week subscription',
    work_payment: 'Tokens or cash',
  }
};

let YV_LANG = localStorage.getItem('yavaya_lang') || 'es';
let YV_THEME = localStorage.getItem('yavaya_theme') || 'dark';

function yvSetLang(lang) {
  YV_LANG = lang;
  localStorage.setItem('yavaya_lang', lang);
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('on', b.dataset.l === lang));
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const val = YV_TRANSLATIONS[lang][key];
    if (val !== undefined) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = val;
      else el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    const val = YV_TRANSLATIONS[lang][key];
    if (val !== undefined) el.placeholder = val;
  });
}

function yvToggleTheme() {
  YV_THEME = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', YV_THEME);
  localStorage.setItem('yavaya_theme', YV_THEME);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = YV_THEME === 'dark' ? '🌙' : '☀️';
}

function yvToggleMob() {
  const mob = document.getElementById('navMob');
  if (mob) mob.classList.toggle('open');
}

// ── WHATSAPP ──
function yvWhatsApp(phone, message) {
  const clean = phone.replace(/\D/g, '');
  const encoded = encodeURIComponent(message || 'Hola, vi tu anuncio en Yavaya 👋');
  window.open(`https://wa.me/${clean}?text=${encoded}`, '_blank');
}

function yvWhatsAppListing(title, price, sellerPhone) {
  const msg = YV_LANG === 'es'
    ? `Hola! Vi tu anuncio en Yavaya: "${title}" por $${price}. ¿Está disponible?`
    : `Hi! I saw your listing on Yavaya: "${title}" for $${price}. Is it available?`;
  yvWhatsApp(sellerPhone, msg);
}

function yvWhatsAppOrder(restaurant) {
  const msg = YV_LANG === 'es'
    ? `Hola ${restaurant}! Quiero hacer un pedido por YavayaGo 🛵`
    : `Hi ${restaurant}! I want to place an order via YavayaGo 🛵`;
  yvWhatsApp('50600000000', msg);
}

// ── TOAST ──
function yvToast(msg, dur = 3000) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── REVEAL ON SCROLL ──
function yvInitReveal() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis'); });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal, .reveal-l, .reveal-r, .reveal-scale').forEach(el => obs.observe(el));
}

// ── COUNTUP ──
function yvCountUp(el, target, suffix = '', duration = 1600) {
  let start = 0;
  const step = target / (duration / 16);
  const timer = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = Math.floor(start).toLocaleString() + suffix;
    if (start >= target) clearInterval(timer);
  }, 16);
}

function yvInitCountUp() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      const el = e.target;
      yvCountUp(el, parseInt(el.dataset.target || 0), el.dataset.suffix || '');
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-target]').forEach(el => obs.observe(el));
}

// ── MAGNETIC BUTTONS ──
function yvInitMagnetic() {
  document.querySelectorAll('.btn-primary, .btn-outline').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r = btn.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.12;
      const y = (e.clientY - r.top - r.height / 2) * 0.12;
      btn.style.transform = `translate(${x}px,${y}px) translateY(-2px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ── DEMO BADGE HELPER ──
function yvMarkDemo(selector, label) {
  const el = document.querySelector(selector);
  if (!el) return;
  const badge = document.createElement('span');
  badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;background:rgba(251,146,60,.15);color:#fb923c;border:1px solid rgba(251,146,60,.3);margin-left:8px;vertical-align:middle';
  badge.textContent = 'DEMO';
  el.appendChild(badge);
}

// ── INIT ALL ──
function yvInit() {
  // Set theme
  document.documentElement.setAttribute('data-theme', YV_THEME);
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.textContent = YV_THEME === 'dark' ? '🌙' : '☀️';

  // Set lang buttons
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('on', b.dataset.l === YV_LANG);
    b.onclick = () => yvSetLang(b.dataset.l);
  });

  // Apply current lang
  yvSetLang(YV_LANG);

  // Observers
  yvInitReveal();
  yvInitCountUp();

  // Magnetic on desktop only
  if (window.innerWidth > 768) yvInitMagnetic();

  // Token balance in nav
  const tokN = document.getElementById('tokN');
  const tokBtn = document.getElementById('tokBtn');
  const toks = parseInt(localStorage.getItem('yavaya_tokens') || '0');
  if (tokN) tokN.textContent = toks;
  if (tokBtn && toks > 0) tokBtn.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', yvInit);
