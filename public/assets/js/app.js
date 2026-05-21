/**
 * Guinguette Etang Grenetier — app.js
 * Refactorisé : sécurité XSS, fallback, états de chargement,
 * animations Intersection Observer, carousel amélioré.
 */

'use strict';

// === ÉTAT GLOBAL (encapsulé, pas de variable globale brute) ===
const App = {
    db: {},
    currentImgIndex: 0,
    observer: null,
};

// === UTILITAIRES ===

/**
 * Échappe les caractères HTML pour prévenir les injections XSS.
 * Toutes les données venant de Google Sheets passent par ici.
 */
function escHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Texte Sheets : échappe le HTML puis rétablit les <br> saisis dans le tableau.
 */
function formatSheetText(str) {
    if (!str) return '';
    return escHtml(str).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}

/**
 * Convertit une valeur CSS (numérique → px, ou string directe).
 */
function formatSize(val) {
    if (!val) return '';
    if (!isNaN(val)) return val + 'px';
    return val;
}

/**
 * Normalise une couleur venue de Google Sheets (hex, rgb, nom CSS).
 */
function sheetColor(val) {
    if (!val) return '';
    const v = String(val).trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
    if (/^#?[0-9a-f]{3}$/i.test(v)) {
        const h = v.replace('#', '');
        return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (/^[0-9a-f]{6}$/i.test(v)) return '#' + v;
    if (/^[0-9a-z]+$/i.test(v) && !/^[0-9]+$/i.test(v)) return v;
    if (/^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(v)) return v;
    if (/^hsla?\(\s*\d+(?:\.\d+)?(?:deg|rad|grad|turn)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(?:,\s*(0|1|0?\.\d+))?\s*\)$/i.test(v)) return v;
    return '';
}

/**
 * Affiche ou masque un élément.
 */
function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

// === THÈME SOMBRE / CLAIR ===
(function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
})();

function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
}

// Exposer au HTML inline (onclick="...")
window.toggleTheme = toggleTheme;

// === TRADUCTION MULTILINGUE (Google Translate + préférence localStorage) ===
const LANG_STORAGE_KEY = 'site-lang';
let currentLang = 'fr';
const SUPPORTED_LANGUAGES = [
    { code: 'fr', flag: '🇫🇷', label: 'fr', name: 'Français' },
    { code: 'en', flag: '🇬🇧', label: 'en', name: 'English' },
    { code: 'nl', flag: '🇳🇱', label: 'nl', name: 'Nederlands' },
    { code: 'pl', flag: '🇵🇱', label: 'pl', name: 'Polski' },
    { code: 'es', flag: '🇪🇸', label: 'es', name: 'Español' },
];

function normalizeLangCode(lang) {
    if (!lang) return 'fr';
    const code = String(lang).trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.some(l => l.code === code) ? code : 'fr';
}

function getStoredLang() {
    try {
        return normalizeLangCode(localStorage.getItem(LANG_STORAGE_KEY));
    } catch {
        return 'fr';
    }
}

function getSystemLang() {
    try {
        const langs = navigator.languages || [navigator.language || navigator.userLanguage];
        for (const lang of langs) {
            const code = String(lang).trim().toLowerCase().split(/[-_]/)[0];
            if (SUPPORTED_LANGUAGES.some(l => l.code === code)) {
                return code;
            }
        }
    } catch {
        // ignore
    }
    return 'fr';
}

function getNextSupportedLang(current) {
    const index = SUPPORTED_LANGUAGES.findIndex(l => l.code === current);
    const nextIndex = index === -1 ? 0 : (index + 1) % SUPPORTED_LANGUAGES.length;
    return SUPPORTED_LANGUAGES[nextIndex].code;
}

function clearGoogTransCookies() {
    const expired = 'Thu, 01 Jan 1970 00:00:00 UTC';
    const host = window.location.hostname;
    document.cookie = 'googtrans=;expires=' + expired + ';path=/';
    if (host && host !== 'localhost') {
        document.cookie = 'googtrans=;expires=' + expired + ';path=/;domain=' + host;
        document.cookie = 'googtrans=;expires=' + expired + ';path=/;domain=.' + host;
    }
}

function setGoogTransCookie(lang) {
    const host = window.location.hostname;
    if (lang === 'fr') {
        clearGoogTransCookies();
        return;
    }
    document.cookie = 'googtrans=/fr/' + lang + ';path=/;';
    if (host && host !== 'localhost') {
        document.cookie = 'googtrans=/fr/' + lang + ';path=/;domain=.' + host;
    }
}

function applyGoogleTranslateSelect(lang) {
    const select = document.querySelector('select.goog-te-combo');
    if (!select) return false;
    const value = lang === 'fr' ? '' : lang;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function refreshGoogleTranslate() {
    const target = currentLang;
    if (applyGoogleTranslateSelect(target)) return;

    const observer = new MutationObserver(() => {
        if (applyGoogleTranslateSelect(target)) {
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}

function closeLanguageMenus() {
    document.querySelectorAll('.lang-menu').forEach(menu => menu.classList.add('hidden'));
    document.querySelectorAll('.lang-selector-btn').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

function toggleLangMenu(toggleEl) {
    const menuId = toggleEl.getAttribute('aria-controls');
    const menu = menuId ? document.getElementById(menuId) : null;
    if (!menu) return;
    const isOpen = !menu.classList.contains('hidden');
    closeLanguageMenus();
    if (!isOpen) {
        menu.classList.remove('hidden');
        toggleEl.setAttribute('aria-expanded', 'true');
    }
}

function syncLangUi(lang) {
    currentLang = normalizeLangCode(lang);
    const selected = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];
    updateLangButtons(selected.flag);
    document.querySelectorAll('.lang-toggle, .lang-selector-btn').forEach(btn => {
        btn.setAttribute('aria-label', 'Changer la langue du site');
        btn.title = 'Langue actuelle : ' + selected.name;
    });
    document.querySelectorAll('.lang-select').forEach(select => {
        select.value = currentLang;
    });
    document.documentElement.lang = currentLang;
}

function initLanguagePreference() {
    const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
    currentLang = storedLang ? normalizeLangCode(storedLang) : getSystemLang();
    if (currentLang === 'fr') {
        clearGoogTransCookies();
    } else {
        setGoogTransCookie(currentLang);
    }
    syncLangUi(currentLang);
}

document.addEventListener('DOMContentLoaded', initLanguagePreference);

function googleTranslateElementInit() {
    new google.translate.TranslateElement({
        pageLanguage: 'fr',
        includedLanguages: 'fr,en,nl,pl,es',
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
    }, 'google_translate_element');

    const storedLang = localStorage.getItem(LANG_STORAGE_KEY);
    currentLang = storedLang ? normalizeLangCode(storedLang) : getSystemLang();
    syncLangUi(currentLang);
    refreshGoogleTranslate();
}
window.googleTranslateElementInit = googleTranslateElementInit;

function setLanguage(lang) {
    const next = normalizeLangCode(lang);
    closeLanguageMenus();
    if (next === currentLang) return;
    try {
        localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch { /* ignore */ }
    if (next === 'fr') {
        clearGoogTransCookies();
    } else {
        setGoogTransCookie(next);
    }
    // Rechargement propre : Google Translate relit le cookie depuis zéro
    window.location.href = window.location.pathname;
}
window.setLanguage = setLanguage;

function toggleLanguage() {
    setLanguage(getNextSupportedLang(currentLang));
}
window.toggleLanguage = toggleLanguage;

function updateLangButtons(flag) {
    ['pc', 'mobile'].forEach(id => {
        const flagEl = document.getElementById('lang-flag-' + id);
        if (flagEl) flagEl.textContent = flag;
    });
}

// === ACTIONS GLOBALES (résistant à Google Translate) ===
function initGlobalActions() {
    document.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.getAttribute('data-action');
        switch (action) {
            case 'toggle-theme':
                e.preventDefault();
                toggleTheme();
                break;
            case 'toggle-lang':
                e.preventDefault();
                toggleLanguage();
                break;
            case 'toggle-lang-menu':
                e.preventDefault();
                toggleLangMenu(actionEl);
                break;
            case 'select-lang':
                e.preventDefault();
                const lang = actionEl.getAttribute('data-lang');
                if (lang) setLanguage(lang);
                break;
            case 'close-lightbox':
                closeLightbox();
                break;
            case 'prev-img':
                e.preventDefault();
                prevImg();
                break;
            case 'next-img':
                e.preventDefault();
                nextImg();
                break;
            case 'close-legal':
                e.preventDefault();
                closeLegalModal();
                break;
            case 'open-legal':
                e.preventDefault();
                openLegalModal(e);
                break;
            case 'open-contact':
                e.preventDefault();
                openContactModal(e);
                break;
            case 'close-contact':
                e.preventDefault();
                closeContactModal();
                break;
            case 'close-engagement':
                e.preventDefault();
                closeEngagementModal();
                break;
            case 'open-lightbox': {
                const idx = parseInt(actionEl.getAttribute('data-gallery-index'), 10);
                if (!isNaN(idx)) openLightbox(idx);
                break;
            }
            case 'carousel-dot': {
                const idx = parseInt(actionEl.getAttribute('data-carousel-index'), 10);
                if (!isNaN(idx)) scrollCarouselTo(idx);
                break;
            }
            case 'menu-dot': {
                const idx = parseInt(actionEl.getAttribute('data-menu-index'), 10);
                if (!isNaN(idx)) scrollMenuTo(idx);
                break;
            }
            case 'menu-prev': {
                e.preventDefault();
                scrollMenuBy(-1);
                break;
            }
            case 'menu-next': {
                e.preventDefault();
                scrollMenuBy(1);
                break;
            }
            case 'galerie-prev': {
                e.preventDefault();
                scrollGalerieBy(-1);
                break;
            }
            case 'galerie-next': {
                e.preventDefault();
                scrollGalerieBy(1);
                break;
            }
            case 'open-engagement-modal': {
                e.preventDefault();
                const title = actionEl.getAttribute('data-title');
                const icon = actionEl.getAttribute('data-icon');
                const comment = actionEl.getAttribute('data-comment');
                if (title && comment) {
                    openEngagementModal(title, icon, comment);
                }
                break;
            }
            default:
                break;
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.lang-menu') && !e.target.closest('.lang-selector-btn')) {
            closeLanguageMenus();
        }
    });

    document.addEventListener('keydown', (e) => {
        const item = e.target.closest('.carousel-item[data-gallery-index]');
        if (item && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openLightbox(parseInt(item.getAttribute('data-gallery-index'), 10));
        }

        if (e.key === 'Escape') {
            closeLanguageMenus();
        }
    });
}

initGlobalActions();

// === NAVIGATION ANCRES (offset navbar fixe) ===
(function initAnchorNavigation() {
    const NAV_OFFSET = 88;
    const anchors = ['#menu', '#evenements', '#services-activites', '#galerie', '#infos-pratiques'];

    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    const scrollToAnchor = (hash, smooth = false) => {
        const target = document.querySelector(hash);
        if (!target) return;
        const top = target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
        window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    };

    window.addEventListener('load', () => {
        if (location.hash && anchors.includes(location.hash)) {
            scrollToAnchor(location.hash);
        }
    });

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="#"]');
        if (!link || link.getAttribute('href') === '#') return;

        const hash = link.getAttribute('href');
        if (!anchors.includes(hash)) return;

        const target = document.querySelector(hash);
        if (!target) return;

        e.preventDefault();
        scrollToAnchor(hash, true);
        history.pushState(null, '', hash);

        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
            document.getElementById('mobile-menu-btn')?.click();
        }
    });
})();

// === NAVBAR : ombre au scroll ===
(function initNavbarScroll() {
    const nav = document.querySelector('nav.site-nav');
    if (!nav) return;
    const onScroll = () => {
        nav.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
})();

// === MENU MOBILE ===
(function initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    const hamburger = document.getElementById('hamburger-icon');
    const closeIco = document.getElementById('close-icon');

    if (!btn || !menu || !hamburger || !closeIco) return;

    const setMobileMenuState = (isOpen) => {
        menu.classList.toggle('hidden', !isOpen);
        menu.setAttribute('aria-hidden', String(!isOpen));
        hamburger.classList.toggle('hidden', isOpen);
        closeIco.classList.toggle('hidden', !isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
    };

    const closeMobileMenu = () => setMobileMenuState(false);
    const openMobileMenu = () => setMobileMenuState(true);
    const toggleMobileMenu = () => {
        const isOpen = !menu.classList.contains('hidden');
        setMobileMenuState(!isOpen);
    };

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMobileMenu();
    });

    // Fermer au clic hors du menu
    document.addEventListener('click', (e) => {
        if (menu.classList.contains('hidden')) return;
        if (e.target.closest('#mobile-menu') || e.target.closest('#mobile-menu-btn')) return;
        closeMobileMenu();
    });

    // Fermer au clic sur un lien mobile
    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', closeMobileMenu);
    });

    // Fermer avec Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
            closeMobileMenu();
            btn.focus();
        }
    });
})();

// === INTERSECTION OBSERVER : animations d'entrée ===
function initRevealAnimations() {
    App.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                App.observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal').forEach(el => App.observer.observe(el));
}

// === DATES DYNAMIQUES ===
function getDynamicDates() {
    const dates = {};
    const orderedDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const mois = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dayName = jours[d.getDay()];
        const key = dayName.toLowerCase();
        orderedDays.push(key);
        dates[key] = `${dayName} ${d.getDate()} ${mois[d.getMonth()]}`;
    }

    return { dates, orderedDays };
}

function enrichMenusWithDates() {
    const { dates, orderedDays } = getDynamicDates();
    App.db.menus.forEach(m => {
        const j = (m.jour || '').toLowerCase();
        m.jourAffichage = dates[j] || m.jour;
        m.sortIndex = orderedDays.indexOf(j);
    });
    App.db.menus.sort((a, b) => {
        const ia = a.sortIndex !== -1 ? a.sortIndex : 999;
        const ib = b.sortIndex !== -1 ? b.sortIndex : 999;
        return ia - ib;
    });
}

// === PARSEURS TSV ===
function parseTSVToMenus(tsv) {
    const text = String(tsv).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const menus = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        if (!cols[0]) continue;
        const prix = cols[1] || '-';
        const entree1 = cols[2] || '';
        const entree2 = cols[3] || '';
        const plat1 = cols[4] || '';
        const plat2 = cols[5] || '';
        if (!entree1 && !entree2 && !plat1 && !plat2 && (!prix || prix === '-')) continue;
        menus.push({
            jour: cols[0], prix,
            entree1, entree2, plat1, plat2,
            bgColor: cols[6] || '',
            textColor: cols[7] || '',
        });
    }
    return menus;
}

function parseTSVToEvents(tsv) {
    const text = String(tsv).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split('\t').map(c => c.trim().toLowerCase());
    const isNewFormat = header.some(h =>
        h.includes('bulle') || h.includes('panneau') || h.includes('description')
    );

    const events = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());

        if (isNewFormat) {
            if (!cols[0] && !cols[5] && !cols[8]) continue;
            events.push({
                badge: cols[0] || '',
                badgeBg: cols[1] || '',
                badgeText: cols[2] || '',
                badgeFont: cols[3] || '',
                badgeSize: formatSize(cols[4]),
                titre: cols[5] || '',
                titleFont: cols[6] || '',
                titleSize: formatSize(cols[7]),
                desc: cols[8] || '',
                descFont: cols[9] || '',
                descSize: formatSize(cols[10]),
                bgImage: cols[11] || '',
                cardBg: cols[12] || '',
                cardText: cols[13] || '',
            });
        } else {
            if (!cols[0] && !cols[1]) continue;
            events.push({
                badge: cols[0] || '',
                titre: cols[1] || '',
                desc: cols[2] || '',
            });
        }
    }
    return events;
}

function parseTSVToEngagement(tsv) {
    const text = String(tsv).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const panelsMap = {};

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        const panelName = cols[0];
        if (!panelName) continue;
        
        if (!panelsMap[panelName]) panelsMap[panelName] = [];
        
        panelsMap[panelName].push({
            icone: cols[1] || '',
            label: cols[2] || '',
            commentaire: cols[3] || ''
        });
    }

    return Object.keys(panelsMap).map(name => ({
        titre: name,
        items: panelsMap[name]
    }));
}

function parseTSVToInfos(tsv) {
    const text = String(tsv).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const panneaux = [];
    
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        const titre = cols[0];
        if (!titre) continue;
        panneaux.push({
            titre: titre,
            icone: cols[1] || '',
            contenu: cols[2] || ''
        });
    }
    return panneaux;
}

function parseTSVToGalerie(tsv) {
    const text = String(tsv).replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const galerie = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());
        if (cols[0]) galerie.push(cols[0]);
    }
    return galerie;
}

// === RENDU : SECTION MENU ===
function renderMenu() {
    hide('menu-loading');

    if (!App.db.menus || App.db.menus.length === 0) {
        show('menu-error');
        return;
    }

    const container = document.getElementById('menu-content');
    if (!container) return;

    const menus = App.db.menus;

    const itemsHtml = menus.map((m, idx) => {
        const isClosed = (m.entree1 || '').toLowerCase().includes('fermeture');
        const textColor = sheetColor(m.textColor) || '';
        const bgColor = sheetColor(m.bgColor) || '';
        const tc = textColor ? `color: ${textColor};` : 'color: var(--text-primary);';
        const tcMuted = textColor ? `color: ${textColor}; opacity: 0.65;` : 'color: var(--text-muted);';
        const prixHtml = m.prix && m.prix !== '-'
            ? `<span class="prix-tag prix-tag--multiline">${formatSheetText(m.prix)}</span>`
            : '';

        let content = '';

        if (isClosed) {
            content = `
                <div class="h-full flex flex-col items-center justify-center py-10 opacity-70">
                    <div class="text-6xl mb-5" aria-hidden="true">😴</div>
                    <h3 class="text-5xl font-['Great_Vibes'] mb-2" style="${tc}">${escHtml(m.jourAffichage)}</h3>
                    <p class="font-bold uppercase tracking-widest text-xs text-center" style="${tcMuted}">Fermeture Hebdomadaire</p>
                </div>`;
        } else {
            const sep = m.textColor
                ? `background: linear-gradient(to right, transparent, rgba(0,0,0,0.1), transparent);`
                : `background: linear-gradient(to right, transparent, var(--border-color), transparent);`;
            const labelStyle = m.textColor
                ? `${tcMuted} background-color: rgba(0,0,0,0.05);`
                : 'color: var(--text-muted); background-color: var(--bg-secondary);';
            const itemStyle = m.textColor ? tc : 'color: var(--text-primary);';

            content = `
                <div class="grid grid-cols-[1fr_auto] items-center mb-8 pb-6 gap-2" style="border-bottom: 1px solid ${m.textColor ? 'rgba(0,0,0,0.1)' : 'var(--border-color)'};">
                    <div class="flex justify-center w-full">
                        <h3 class="text-4xl md:text-5xl font-['Great_Vibes'] text-center" style="${tc}">${escHtml(m.jourAffichage)}</h3>
                    </div>
                    <div class="flex items-center justify-end">
                        ${prixHtml}
                    </div>
                </div>
                <div class="flex flex-col gap-6 text-center">
                    <div class="space-y-3">
                        <p class="text-[10px] font-bold uppercase tracking-widest inline-block px-4 py-1.5 rounded-full mb-1" style="${labelStyle}">Entrées</p>
                        ${m.entree1 ? `<p class="text-lg font-['Playfair_Display'] italic leading-relaxed" style="${itemStyle}">${escHtml(m.entree1)}</p>` : ''}
                        ${m.entree2 ? `<p class="text-lg font-['Playfair_Display'] italic leading-relaxed" style="${itemStyle}">${escHtml(m.entree2)}</p>` : ''}
                    </div>
                    <div class="w-24 h-px mx-auto my-1" style="${sep}" aria-hidden="true"></div>
                    <div class="space-y-3">
                        <p class="text-[10px] font-bold uppercase tracking-widest inline-block px-4 py-1.5 rounded-full mb-1" style="${labelStyle}">Plats</p>
                        ${m.plat1 ? `<p class="text-lg font-['Playfair_Display'] italic leading-relaxed" style="${itemStyle}">${escHtml(m.plat1)}</p>` : ''}
                        ${m.plat2 ? `<p class="text-lg font-['Playfair_Display'] italic leading-relaxed" style="${itemStyle}">${escHtml(m.plat2)}</p>` : ''}
                    </div>
                </div>`;
        }

        return `
            <div class="carousel-item menu-carousel-item flex-shrink-0 scroll-snap-align-start rounded-[2.5rem] p-6 md:p-10 shadow-lg border border-stone-200/50 dark:border-stone-700/50" style="background-color: ${bgColor || 'var(--bg-card)'};">
                ${content}
            </div>
        `;
    }).join('');

    const dotsHtml = menus.map((_, idx) =>
        `<button type="button" class="carousel-dot menu-dot${idx === 0 ? ' active' : ''}" data-action="menu-dot" data-menu-index="${idx}" aria-label="Menu jour ${idx + 1}"></button>`
    ).join('');

    container.innerHTML = `
        <div class="text-center mb-12 reveal">
            <p class="text-xs uppercase tracking-widest font-semibold mb-3" style="color: var(--text-muted);">Restaurant au bord de l'eau</p>
            <h2 id="menu-title" class="text-4xl md:text-5xl lg:text-6xl font-['Playfair_Display'] italic" style="color: var(--text-primary);">${escHtml(App.db.sections?.menu || "L'Ardoise du Jour")}</h2>
            <div class="section-divider mt-3"></div>
        </div>

        <div class="relative reveal reveal-delay-1 max-w-[100vw] overflow-hidden -mx-4 px-4 md:mx-auto md:px-0">
            <button type="button" data-action="menu-prev" class="notranslate absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-12 h-12 bg-white dark:bg-stone-800 rounded-full shadow-lg border border-stone-200 dark:border-stone-700 text-foret-600 hover:text-white hover:bg-foret-600 transition-colors opacity-0 pointer-events-none" aria-label="Menu précédent">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button type="button" data-action="menu-next" class="notranslate absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-12 h-12 bg-white dark:bg-stone-800 rounded-full shadow-lg border border-stone-200 dark:border-stone-700 text-foret-600 hover:text-white hover:bg-foret-600 transition-colors" aria-label="Menu suivant">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>

            <div class="carousel-track menu-carousel-track" id="menu-carousel-track" role="list" aria-label="Menus de la semaine">
                ${itemsHtml}
            </div>
        </div>
        ${menus.length > 1 ? `<div class="carousel-dots mt-8" role="group" aria-label="Navigation des menus">${dotsHtml}</div>` : ''}
    `;

    show('menu-content');
    initMenuDots();
    observeNewElements();
}

function initMenuDots() {
    const track = document.getElementById('menu-carousel-track');
    const prevBtn = document.querySelector('[data-action="menu-prev"]');
    const nextBtn = document.querySelector('[data-action="menu-next"]');
    if (!track) return;

    const updateBtns = () => {
        if (prevBtn) {
            prevBtn.style.opacity = track.scrollLeft <= 5 ? '0' : '1';
            prevBtn.style.pointerEvents = track.scrollLeft <= 5 ? 'none' : 'auto';
        }
        if (nextBtn) {
            const maxScroll = track.scrollWidth - track.clientWidth;
            nextBtn.style.opacity = track.scrollLeft >= maxScroll - 5 ? '0' : '1';
            nextBtn.style.pointerEvents = track.scrollLeft >= maxScroll - 5 ? 'none' : 'auto';
        }
    };

    track.addEventListener('scroll', () => {
        updateBtns();
        const item = track.querySelector('.menu-carousel-item');
        if (!item) return;
        const itemWidth = item.offsetWidth;
        const style = window.getComputedStyle(track);
        const gap = parseFloat(style.gap) || 0;
        const totalWidth = itemWidth + gap;
        const idx = Math.round(track.scrollLeft / totalWidth);
        document.querySelectorAll('.menu-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === idx);
        });
    }, { passive: true });
    
    requestAnimationFrame(updateBtns);
}

function scrollMenuTo(idx) {
    const track = document.getElementById('menu-carousel-track');
    if (!track) return;
    const item = track.querySelectorAll('.menu-carousel-item')[idx];
    if (!item) return;
    const trackRect = track.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    // Aligne le début de l'item avec le début du track (scroll-snap-align: start)
    const offset = track.scrollLeft + itemRect.left - trackRect.left;
    track.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
}

function scrollMenuBy(direction) {
    const track = document.getElementById('menu-carousel-track');
    if (!track) return;
    const item = track.querySelector('.menu-carousel-item');
    if (!item) return;
    const itemWidth = item.offsetWidth;
    const style = window.getComputedStyle(track);
    const gap = parseFloat(style.gap) || 0;
    const totalWidth = itemWidth + gap;
    const currentScroll = track.scrollLeft;
    const currentIndex = Math.round(currentScroll / totalWidth);
    const newIndex = Math.max(0, currentIndex + direction);
    scrollMenuTo(newIndex);
}

window.scrollMenuTo = scrollMenuTo;
window.scrollMenuBy = scrollMenuBy;

// === RENDU : ÉVÉNEMENTS ===
function renderEvenements() {
    hide('evenements-loading');
    const container = document.getElementById('evenements-content');
    if (!container) return;

    const events = App.db.evenements || [];

    const title = `
        <div class="text-center mb-14 reveal">
            <p class="text-xs uppercase tracking-widest font-semibold mb-3 text-white/50">Agenda</p>
            <h2 id="evenements-title" class="text-4xl md:text-5xl lg:text-6xl font-['Playfair_Display'] italic text-white">${escHtml(App.db.sections?.evenements || 'Prochainement')}</h2>
            <div class="w-12 h-0.5 bg-gradient-to-r from-emerald-400 to-transparent mx-auto mt-3 rounded"></div>
        </div>`;

    if (events.length === 0) {
        container.innerHTML = title + `
            <div class="text-center text-white/50 py-8">
                <div class="text-5xl mb-4" aria-hidden="true">🎵</div>
                <p class="font-['Playfair_Display'] italic text-xl">Prochains événements bientôt annoncés</p>
                <p class="text-sm mt-2 text-white/30">Suivez notre page Facebook pour ne rien manquer</p>
            </div>`;
        show('evenements-content');
        observeNewElements();
        return;
    }

    const cardsHtml = events.map((ev, idx) => {
        const panelBg = sheetColor(ev.cardBg);
        const panelText = sheetColor(ev.cardText);
        const hasCustomPanel = !!(panelBg || panelText || ev.bgImage);
        const cardClasses = `event-card rounded-[2rem] p-8 md:p-10 reveal reveal-delay-${Math.min(idx + 1, 5)}${hasCustomPanel ? ' event-card-custom' : ''}`;

        const cssVars = [];
        if (panelBg) cssVars.push(`--event-panel-bg: ${escHtml(panelBg)}`);
        if (panelText) cssVars.push(`--event-panel-text: ${escHtml(panelText)}`);
        const cardStyle = cssVars.length ? cssVars.join('; ') + ';' : '';

        const textColor = panelText ? escHtml(panelText) : 'white';

        const bgImageLayer = ev.bgImage
            ? `<div class="event-card-media" style="background-image: url('${escHtml(ev.bgImage)}');" aria-hidden="true"></div>`
            : '';

        const badgeStyle = [
            ev.badgeBg ? `background-color: ${escHtml(sheetColor(ev.badgeBg) || ev.badgeBg)};` : 'background-color: rgba(52,211,153,0.2);',
            ev.badgeText ? `color: ${escHtml(sheetColor(ev.badgeText) || ev.badgeText)};` : 'color: #6ee7b7;',
            ev.badgeFont ? `font-family: ${escHtml(ev.badgeFont)};` : '',
            ev.badgeSize ? `font-size: ${escHtml(ev.badgeSize)};` : '',
        ].join(' ');

        const titleStyle = [
            ev.titleFont ? `font-family: ${escHtml(ev.titleFont)};` : '',
            ev.titleSize ? `font-size: ${escHtml(ev.titleSize)};` : '',
            `color: ${textColor};`,
        ].join(' ');

        const descStyle = [
            ev.descFont ? `font-family: ${escHtml(ev.descFont)};` : '',
            ev.descSize ? `font-size: ${escHtml(ev.descSize)};` : '',
            `color: ${textColor}; opacity: 0.85;`,
        ].join(' ');

        return `
            <article class="${cardClasses} h-full flex flex-col min-h-[300px] relative overflow-hidden" style="${cardStyle}" aria-label="${escHtml(ev.titre)}">
                ${bgImageLayer}
                <div class="event-card-inner relative z-[1] flex flex-col flex-grow">
                    ${ev.badge ? `<span class="event-badge" style="${badgeStyle}">${escHtml(ev.badge)}</span>` : ''}
                    ${ev.titre ? `<h3 class="text-2xl md:text-3xl font-['Playfair_Display'] italic mb-3 drop-shadow-sm" style="${titleStyle}">${escHtml(ev.titre)}</h3>` : ''}
                    ${ev.desc ? `<p class="flex-grow drop-shadow-sm" style="${descStyle}">${formatSheetText(ev.desc)}</p>` : ''}
                </div>
            </article>`;
    }).join('');

    container.innerHTML = title + `<div class="events-grid grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch">${cardsHtml}</div>`;
    show('evenements-content');
    observeNewElements();
}

// === RENDU : SERVICES & ACTIVITÉS (Panneaux Style Agenda) ===
function renderServicesActivites() {
    const container = document.getElementById('services-activites-content');
    if (!container) return;

    const engagement = App.db.engagement || [];
    const mainTitle = App.db.sections?.servicesActivites || 'Services & Activités';

    if (!engagement.length) return;

    const renderGrid = (panel, delayIdx) => `
        <article class="event-card rounded-[2rem] p-8 md:p-10 flex flex-col relative overflow-hidden reveal reveal-delay-${delayIdx}">
            <div class="event-card-inner relative z-[1] flex flex-col flex-grow">
                <div class="flex justify-center mb-8">
                    <span class="event-badge" style="background-color: rgba(255,255,255,0.15); color: #fff; font-size: 0.9rem; padding: 0.5rem 1.5rem;">${escHtml(panel.titre)}</span>
                </div>
                <div class="grid grid-cols-2 gap-4 md:gap-6">
                    ${panel.items.map((item, idx) => {
                        const hasComment = item.commentaire && item.commentaire.trim() !== '';
                        const actionAttr = hasComment 
                            ? `data-action="open-engagement-modal" data-title="${escHtml(item.label)}" data-icon="${escHtml(item.icone)}" data-comment="${escHtml(item.commentaire)}"` 
                            : '';
                        const cursorClass = hasComment ? 'cursor-pointer hover:bg-white/20' : 'bg-white/5 hover:bg-white/10';
                        const ringClass = hasComment ? 'ring-2 ring-emerald-400/30' : '';
                        
                        return `
                        <div ${actionAttr} class="flex flex-col items-center justify-center p-4 md:p-6 rounded-2xl ${cursorClass} hover:-translate-y-1 transition-all ${ringClass} relative group">
                            <span class="text-4xl md:text-5xl mb-3 block drop-shadow-sm" aria-hidden="true">${escHtml(item.icone)}</span>
                            <span class="font-bold text-sm md:text-base text-center leading-tight text-white drop-shadow-sm">${escHtml(item.label)}</span>
                            ${hasComment ? `<span class="absolute top-2 right-2 flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>` : ''}
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </article>
    `;

    container.innerHTML = `
        <div class="text-center mb-14 reveal">
            <p class="text-xs uppercase tracking-widest font-semibold mb-3" style="color: var(--text-muted);">Notre engagement</p>
            <h2 class="text-4xl md:text-5xl lg:text-6xl font-['Playfair_Display'] italic" style="color: var(--text-primary);">${escHtml(mainTitle)}</h2>
            <div class="section-divider mt-3"></div>
            <p class="text-sm mt-4 italic opacity-70" style="color: var(--text-primary);">Cliquez sur les éléments animés pour plus d'informations</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-stretch max-w-6xl mx-auto">
            ${engagement.map((panel, idx) => renderGrid(panel, Math.min(idx + 1, 5))).join('')}
        </div>
    `;

    show('services-activites-content');
    observeNewElements();
}

// === RENDU : GALERIE ===
function renderGalerie() {
    hide('galerie-loading');
    const container = document.getElementById('galerie-content');
    if (!container) return;

    const galerie = App.db.galerie || [];

    const itemsHtml = galerie.map((src, idx) => `
        <div class="carousel-item" role="button" tabindex="0" data-action="open-lightbox" data-gallery-index="${idx}"
             aria-label="Voir la photo ${idx + 1} en grand">
            <img src="${escHtml(src)}" alt="Photo de la guinguette ${idx + 1}" loading="lazy" width="340" height="240">
            <div class="overlay" aria-hidden="true">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
            </div>
        </div>`
    ).join('');

    const dotsHtml = galerie.map((_, idx) =>
        `<button type="button" class="carousel-dot${idx === 0 ? ' active' : ''}" data-action="carousel-dot" data-carousel-index="${idx}" aria-label="Image ${idx + 1}"></button>`
    ).join('');

    container.innerHTML = `
        <div class="text-center mb-12 reveal">
            <p class="text-xs uppercase tracking-widest font-semibold mb-3" style="color: var(--text-muted);">Photos</p>
            <h2 id="galerie-title" class="text-4xl md:text-5xl lg:text-6xl font-['Playfair_Display'] italic" style="color: var(--text-primary);">${escHtml(App.db.sections?.galerie || 'Galerie Photos')}</h2>
            <div class="section-divider mt-3"></div>
        </div>
        <div class="relative reveal reveal-delay-1">
            <button type="button" data-action="galerie-prev" class="notranslate absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-12 h-12 bg-white dark:bg-stone-800 rounded-full shadow-lg border border-stone-200 dark:border-stone-700 text-foret-600 hover:text-white hover:bg-foret-600 transition-colors opacity-0 pointer-events-none" aria-label="Photo précédente">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button type="button" data-action="galerie-next" class="notranslate absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-12 h-12 bg-white dark:bg-stone-800 rounded-full shadow-lg border border-stone-200 dark:border-stone-700 text-foret-600 hover:text-white hover:bg-foret-600 transition-colors" aria-label="Photo suivante">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div class="carousel-fade-left absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none" aria-hidden="true"></div>
            <div class="carousel-fade-right absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none" aria-hidden="true"></div>
            <div class="carousel-track" id="carousel-track" role="list" aria-label="Galerie photos">${itemsHtml}</div>
        </div>
        ${galerie.length > 1 ? `<div class="carousel-dots" role="group" aria-label="Navigation galerie">${dotsHtml}</div>` : ''}`;

    show('galerie-content');
    initCarouselDots();
    initGalerieBtns();
    observeNewElements();
}

function initCarouselDots() {
    const track = document.getElementById('carousel-track');
    if (!track) return;

    track.addEventListener('scroll', () => {
        const itemWidth = track.querySelector('.carousel-item')?.offsetWidth || 300;
        const gap = parseFloat(window.getComputedStyle(track).gap) || 16;
        const idx = Math.round(track.scrollLeft / (itemWidth + gap));
        document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === idx);
        });
    }, { passive: true });
}

function initGalerieBtns() {
    const track = document.getElementById('carousel-track');
    const prevBtn = document.querySelector('[data-action="galerie-prev"]');
    const nextBtn = document.querySelector('[data-action="galerie-next"]');
    if (!track) return;

    const updateBtns = () => {
        if (prevBtn) {
            prevBtn.style.opacity = track.scrollLeft <= 5 ? '0' : '1';
            prevBtn.style.pointerEvents = track.scrollLeft <= 5 ? 'none' : 'auto';
        }
        if (nextBtn) {
            const maxScroll = track.scrollWidth - track.clientWidth;
            nextBtn.style.opacity = track.scrollLeft >= maxScroll - 5 ? '0' : '1';
            nextBtn.style.pointerEvents = track.scrollLeft >= maxScroll - 5 ? 'none' : 'auto';
        }
    };

    track.addEventListener('scroll', updateBtns, { passive: true });
    requestAnimationFrame(updateBtns);
}

function scrollCarouselTo(idx) {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    const item = track.querySelectorAll('.carousel-item')[idx];
    if (!item) return;
    const trackRect = track.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offset = track.scrollLeft + itemRect.left - trackRect.left;
    track.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
}

window.scrollCarouselTo = scrollCarouselTo;

function scrollGalerieBy(direction) {
    const track = document.getElementById('carousel-track');
    if (!track) return;
    const item = track.querySelector('.carousel-item');
    if (!item) return;
    const itemWidth = item.offsetWidth;
    const gap = parseFloat(window.getComputedStyle(track).gap) || 16;
    const currentIndex = Math.round(track.scrollLeft / (itemWidth + gap));
    const maxIndex = track.querySelectorAll('.carousel-item').length - 1;
    const newIndex = Math.max(0, Math.min(maxIndex, currentIndex + direction));
    scrollCarouselTo(newIndex);
}

window.scrollGalerieBy = scrollGalerieBy;

// === RENDU : INFOS PRATIQUES ===
function renderInfos() {
    const container = document.getElementById('infos-content');
    if (!container || !App.db.infos) return;

    const infos = App.db.infos;

    container.innerHTML = `
        <div class="text-center mb-14 reveal">
            <p class="text-xs uppercase tracking-widest font-semibold mb-3" style="color: var(--text-muted);">Nous trouver</p>
            <h2 id="infos-title" class="text-4xl md:text-5xl lg:text-6xl font-['Playfair_Display'] italic" style="color: var(--text-primary);">${escHtml(App.db.sections?.infos || 'Infos Pratiques')}</h2>
            <div class="section-divider mt-3"></div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">

            <!-- Colonne gauche : Panneaux dynamiques -->
            <div class="space-y-6 reveal">
                ${(infos.panneaux || []).map((p, idx) => `
                <div class="infos-card rounded-[2.5rem] p-8 md:p-10">
                    <h3 class="text-xs font-bold uppercase tracking-widest mb-6 flex items-center gap-2" style="color: var(--text-muted);">
                        <span aria-hidden="true">${escHtml(p.icone)}</span> ${escHtml(p.titre)}
                    </h3>
                    <div class="space-y-3 text-sm leading-relaxed" style="color: var(--text-primary);">
                        ${formatSheetText(p.contenu)}
                    </div>
                </div>
                `).join('')}
            </div>

            <!-- Colonne droite : carte -->
            <div class="relative group h-full reveal reveal-delay-2">
                <div class="absolute -inset-4 bg-gradient-to-r from-foret-200 to-etang-200 rounded-[3rem] opacity-20 blur-2xl group-hover:opacity-40 transition duration-700 pointer-events-none" aria-hidden="true"></div>
                <div class="relative infos-card rounded-[2.5rem] p-4 h-full flex flex-col">
                    <iframe
                        src="${escHtml(infos.map?.mapUrl || '')}"
                        class="w-full flex-grow rounded-[2rem] grayscale contrast-125 group-hover:grayscale-0 transition duration-700"
                        style="border: 0; min-height: 380px;"
                        allowfullscreen
                        loading="lazy"
                        title="Carte de la Guinguette Etang Grenetier"
                        referrerpolicy="no-referrer-when-downgrade"
                    ></iframe>
                    <div class="mt-6 text-center pb-4">
                        <p class="text-xs font-semibold mb-1 uppercase tracking-wider" style="color: var(--text-muted);">Adresse</p>
                        <p class="text-sm font-bold mb-5" style="color: var(--text-primary);">${escHtml(infos.map?.adresse || '')}</p>
                        <a
                            href="${escHtml(infos.map?.itineraire || '')}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-block bg-gradient-to-r from-foret-700 to-foret-800 hover:from-foret-800 hover:to-foret-900 text-white px-8 py-4 rounded-full font-bold uppercase text-xs tracking-widest shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            Créer un itinéraire Google Maps
                            <span class="sr-only">(ouvre dans un nouvel onglet)</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>`;

    observeNewElements();
}

// === RENDU : FOOTER ===
function renderFooter() {
    const footer = document.getElementById('main-footer');
    const cfg = App.db.config;
    if (!footer || !cfg) return;

    const ryleEmail = escHtml(cfg.ryleEmail || 'Rylewebdesign@proton.me');
    const facebookUrl = escHtml(cfg.facebookUrl || '#');
    const year = new Date().getFullYear();

    footer.innerHTML = `
        <div class="footer-block">
            <p class="footer-line">Guinguette Etang Grenetier</p>
            <p class="footer-line">Route Industrielle du Pré Charpin, 58260 La Machine</p>
            <p class="footer-line">Tél : <a href="tel:+33743282658">07 43 28 26 58</a></p>
            <p class="footer-links">
                <a href="${facebookUrl}" target="_blank" rel="noopener noreferrer">Notre page Facebook</a>
                <span class="footer-sep" aria-hidden="true">·</span>
                <a href="#" data-action="open-legal">Mentions légales</a>
            </p>
        </div>
        <p class="footer-credit">&copy; ${year} — Site conçu par <a href="#" data-action="open-contact" title="Contacter Ryle Web &amp; Design">Ryle Web &amp; Design</a></p>`;

}

// === RENDU : HERO BANNER ===
function renderHero() {
    const img = document.getElementById('hero-img');
    const logo = document.getElementById('nav-logo');
    const skeleton = document.getElementById('hero-skeleton');

    if (img && App.db.config?.banniere) {
        const fallback = (App.db.galerie || []).find(u => /^https?:\/\//i.test(u))
            || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

        img.onerror = () => {
            if (img.dataset.fallbackUsed) {
                if (skeleton) skeleton.classList.add('hero-error');
                return;
            }
            img.dataset.fallbackUsed = '1';
            img.src = fallback;
        };

        img.onload = () => {
            img.classList.remove('hidden');
            skeleton?.remove();
        };

        img.src = App.db.config.banniere;
    }

    if (logo && App.db.config?.nom) {
        logo.textContent = App.db.config.nom;
    }
}

// === OBSERVER pour nouveaux éléments .reveal ===
function observeNewElements() {
    if (!App.observer) return;
    document.querySelectorAll('.reveal:not([data-observed])').forEach(el => {
        el.setAttribute('data-observed', '1');
        App.observer.observe(el);
    });
}

// === LIGHTBOX ===
function openLightbox(idx) {
    const galerie = App.db.galerie || [];
    if (idx < 0 || idx >= galerie.length) return;

    App.currentImgIndex = idx;
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    const lb = document.getElementById('lightbox');

    if (img) {
        img.src = galerie[idx];
        img.alt = `Photo de la guinguette ${idx + 1} sur ${galerie.length}`;
    }
    if (counter) counter.textContent = `${idx + 1} / ${galerie.length}`;
    if (lb) {
        lb.classList.remove('hidden');
        lb.classList.add('flex');
        lb.focus();
    }
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleLightboxKeydown);
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) {
        lb.classList.add('hidden');
        lb.classList.remove('flex');
    }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleLightboxKeydown);
}

function handleLightboxKeydown(e) {
    if (e.key === 'ArrowRight') nextImg();
    else if (e.key === 'ArrowLeft') prevImg();
    else if (e.key === 'Escape') closeLightbox();
}

function nextImg() {
    const len = (App.db.galerie || []).length;
    openLightbox((App.currentImgIndex + 1) % len);
}

function prevImg() {
    const len = (App.db.galerie || []).length;
    openLightbox((App.currentImgIndex - 1 + len) % len);
}

// Fermer au clic sur le fond de la lightbox
document.getElementById('lightbox')?.addEventListener('click', function (e) {
    if (e.target === this) closeLightbox();
});

// Exposer les fonctions globales (appelées depuis onclick dans le HTML)
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.nextImg = nextImg;
window.prevImg = prevImg;

// === MODAL MENTIONS LÉGALES ===
function openLegalModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('legal-modal');
    const content = document.getElementById('legal-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        content.classList.replace('scale-95', 'scale-100');
        content.focus();
    });
}

function closeLegalModal() {
    const modal = document.getElementById('legal-modal');
    const content = document.getElementById('legal-modal-content');
    if (!modal || !content) return;

    modal.style.opacity = '0';
    content.classList.replace('scale-100', 'scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }, 300);
}

// Fermer la modal au clic sur le fond
document.getElementById('legal-modal')?.addEventListener('click', function (e) {
    if (e.target === this) closeLegalModal();
});

function openContactModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById('contact-modal');
    const content = document.getElementById('contact-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        content.classList.replace('scale-95', 'scale-100');
        content.focus();
    });
}

function closeContactModal() {
    const modal = document.getElementById('contact-modal');
    const content = document.getElementById('contact-modal-content');
    if (!modal || !content) return;

    modal.style.opacity = '0';
    content.classList.replace('scale-100', 'scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }, 300);
}

// Fermer la modal contact au clic sur le fond
document.getElementById('contact-modal')?.addEventListener('click', function (e) {
    if (e.target === this) closeContactModal();
});

// === MODAL ENGAGEMENT ===
function openEngagementModal(title, icon, comment) {
    const modal = document.getElementById('engagement-modal');
    if (!modal) return;
    
    document.getElementById('engagement-modal-icon').textContent = icon;
    document.getElementById('engagement-modal-title').textContent = title;
    document.getElementById('engagement-modal-comment').textContent = comment;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        const content = document.getElementById('engagement-modal-content');
        if (content) content.classList.replace('scale-95', 'scale-100');
    });
}

function closeEngagementModal() {
    const modal = document.getElementById('engagement-modal');
    const content = document.getElementById('engagement-modal-content');
    if (!modal) return;

    modal.style.opacity = '0';
    if (content) content.classList.replace('scale-100', 'scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }, 300);
}

document.getElementById('engagement-modal')?.addEventListener('click', function(e) {
    if (e.target === this) closeEngagementModal();
});

window.openLegalModal = openLegalModal;
window.closeLegalModal = closeLegalModal;
window.openContactModal = openContactModal;
window.closeContactModal = closeContactModal;
window.openEngagementModal = openEngagementModal;
window.closeEngagementModal = closeEngagementModal;

// === CHARGEMENT PRINCIPAL ===
function fetchWithTimeout(url, timeout = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(id));
}

function hideAllLoaders() {
    hide('menu-loading');
    hide('evenements-loading');
    hide('galerie-loading');
}

async function loadData() {
    let dataLoaded = false;

    try {
        const response = await fetchWithTimeout('assets/data/db.json', 5000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        App.db = await response.json();
        dataLoaded = true;
    } catch (err) {
        console.error('[Guinguette] Erreur chargement db.json :', err);
    }

    if (!dataLoaded) {
        hideAllLoaders();
        show('menu-error');
        return;
    }

    // Affichage immédiat (Stale)
    if (App.db.menus?.length) enrichMenusWithDates();
    hideAllLoaders();
    renderHero();
    renderMenu();
    renderEvenements();
    renderServicesActivites();
    renderGalerie();
    renderInfos();
    renderFooter();
    initRevealAnimations();
    observeNewElements();
    refreshGoogleTranslate();

    // Revalidation asynchrone (Google Sheets)
    const { config } = App.db;
    const sheetPromises = [];

    if (config?.sheetUrl?.trim()) {
        sheetPromises.push(
            fetchWithTimeout(config.sheetUrl)
                .then(r => { if (!r.ok) throw new Error('Menu sheet error'); return r.text(); })
                .then(tsv => {
                    const parsed = parseTSVToMenus(tsv);
                    if (parsed.length > 0) App.db.menus = parsed;
                })
                .catch(err => console.warn('[Guinguette] Menu fallback :', err))
        );
    }

    if (config?.eventSheetUrl?.trim()) {
        sheetPromises.push(
            fetchWithTimeout(config.eventSheetUrl)
                .then(r => { if (!r.ok) throw new Error('Events sheet error'); return r.text(); })
                .then(tsv => {
                    const parsed = parseTSVToEvents(tsv);
                    if (parsed.length > 0) App.db.evenements = parsed;
                })
                .catch(err => console.warn('[Guinguette] Events fallback :', err))
        );
    }

    if (config?.engagementSheetUrl?.trim()) {
        sheetPromises.push(
            fetchWithTimeout(config.engagementSheetUrl)
                .then(r => { if (!r.ok) throw new Error('Engagement sheet error'); return r.text(); })
                .then(tsv => {
                    const parsed = parseTSVToEngagement(tsv);
                    if (parsed.length > 0) App.db.engagement = parsed;
                })
                .catch(err => console.warn('[Guinguette] Engagement fallback :', err))
        );
    }

    if (config?.infosSheetUrl?.trim()) {
        sheetPromises.push(
            fetchWithTimeout(config.infosSheetUrl)
                .then(r => { if (!r.ok) throw new Error('Infos sheet error'); return r.text(); })
                .then(tsv => {
                    const parsed = parseTSVToInfos(tsv);
                    if (parsed.length > 0) {
                        App.db.infos = App.db.infos || {};
                        App.db.infos.panneaux = parsed;
                    }
                })
                .catch(err => console.warn('[Guinguette] Infos fallback :', err))
        );
    }

    if (config?.galerieSheetUrl?.trim()) {
        sheetPromises.push(
            fetchWithTimeout(config.galerieSheetUrl)
                .then(r => { if (!r.ok) throw new Error('Galerie sheet error'); return r.text(); })
                .then(tsv => {
                    const parsed = parseTSVToGalerie(tsv);
                    if (parsed.length > 0) App.db.galerie = parsed;
                })
                .catch(err => console.warn('[Guinguette] Galerie fallback :', err))
        );
    }

    Promise.allSettled(sheetPromises).then(() => {
        if (sheetPromises.length > 0) {
            if (App.db.menus?.length) enrichMenusWithDates();
            renderMenu();
            renderEvenements();
            renderServicesActivites();
            renderGalerie();
            renderInfos();
        }
    });
}

// === LANCEMENT ===
document.addEventListener('DOMContentLoaded', loadData);

// === FORMULAIRE FORMSPREE (AJAX — évite la navigation hors de la page) ===
(function initContactForm() {
    document.addEventListener('submit', async function (e) {
        const form = e.target.closest('#contact-form');
        if (!form) return;
        e.preventDefault();

        const submitBtn = form.querySelector('[type="submit"]');
        const originalText = submitBtn ? submitBtn.textContent : '';

        // Retirer les anciens messages
        form.querySelectorAll('.form-feedback').forEach(el => el.remove());

        // État de chargement
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Envoi en cours…';
        }

        try {
            const data = new FormData(form);
            const response = await fetch(form.action, {
                method: 'POST',
                body: data,
                headers: { Accept: 'application/json' },
            });

            if (response.ok) {
                // Succès
                form.reset();
                const msg = document.createElement('p');
                msg.className = 'form-feedback mt-4 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400';
                msg.textContent = '✅ Message envoyé ! Nous vous répondrons rapidement.';
                form.appendChild(msg);
            } else {
                const json = await response.json().catch(() => ({}));
                const errMsg = json?.errors?.map(err => err.message).join(', ') || 'Erreur lors de l\'envoi.';
                throw new Error(errMsg);
            }
        } catch (err) {
            const msg = document.createElement('p');
            msg.className = 'form-feedback mt-4 text-center text-sm font-semibold text-red-600 dark:text-red-400';
            msg.textContent = '❌ ' + (err.message || 'Une erreur est survenue. Veuillez réessayer.');
            form.appendChild(msg);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        }
    });
})();
