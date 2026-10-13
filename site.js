/* ============================================================
   CLAVORIS — site engine
   Header + key-mark menu, i18n, sticky shrink, countdown, reveals.
   ============================================================ */
(function () {
  "use strict";

  var LANGS = [
    { code: "en", name: "English" }, { code: "nl", name: "Nederlands" },
    { code: "de", name: "Deutsch" }, { code: "fr", name: "Français" },
    { code: "es", name: "Español" }, { code: "ca", name: "Català" },
    { code: "it", name: "Italiano" }, { code: "pt", name: "Português" },
    { code: "ja", name: "日本語" }, { code: "zh", name: "中文" }
  ];
  var MENU_WORD = { en: "Menu", nl: "Menu", de: "Menü", fr: "Menu", es: "Menú",
    ca: "Menú", it: "Menu", pt: "Menu", ja: "メニュー", zh: "菜单" };

  var ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4"/><path d="m10.5 12.5 8-8M16 5l3 3M18 7l2-2"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z"/></svg>'
  };

  var LS_LANG = "clavoris_lang";
  var LS_LAUNCH = "clavoris_launch";

  function dict(lang) { return (window.I18N && window.I18N[lang]) || window.I18N.en; }
  function getLang() {
    var s = localStorage.getItem(LS_LANG);
    if (s && window.I18N && window.I18N[s]) return s;
    var n = (navigator.language || "en").slice(0, 2).toLowerCase();
    return (window.I18N && window.I18N[n]) ? n : "en";
  }
  function t(key) { var d = dict(getLang()); return (key in d) ? d[key] : (window.I18N.en[key] || key); }
  function render(str) {
    return String(str)
      .replace(/\{g\}/g, '<span class="g">').replace(/\{\/g\}/g, "</span>")
      .replace(/\n/g, "<br>");
  }

  /* ---- apply translations to the DOM ---- */
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.innerHTML = render(t(el.getAttribute("data-i18n")));
    });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph")));
    });
    document.documentElement.lang = getLang();
    // burger label
    var bl = document.querySelector(".burger-label");
    if (bl) bl.textContent = MENU_WORD[getLang()] || "Menu";
    // active lang chip
    document.querySelectorAll(".lang-opt").forEach(function (o) {
      o.classList.toggle("active", o.getAttribute("data-lang") === getLang());
    });
    document.dispatchEvent(new CustomEvent("cl:lang", { detail: getLang() }));
  }
  function setLang(code) {
    localStorage.setItem(LS_LANG, code);
    applyI18n();
  }

  /* ---- header + menu markup ---- */
  function buildChrome() {
    var page = document.body.getAttribute("data-page") || "";
    var navItems = [
      { key: "about", href: "about.html", t: "nav_about", s: "nav_about_s" },
      { key: "tech", href: "technology.html", t: "nav_tech", s: "nav_tech_s" },
      { key: "why", href: "why-clavoris.html", t: "nav_why", s: "nav_why_s" }
    ];

    var header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML =
      '<div class="header-inner">' +
        '<a class="brand" href="index.html" aria-label="Clavoris home">' +
          '<img class="brand-mark brand-mark--dark" src="assets/clavoris-mark.png" alt="">' +
          '<img class="brand-mark brand-mark--rev" src="assets/clavoris-mark-reversed.png" alt="">' +
          '<span class="brand-wm">Clavori<span class="g">s</span></span>' +
        "</a>" +
        '<button class="burger" id="clBurger" aria-label="Open menu" aria-expanded="false">' +
          '<span class="burger-lines"><span></span><span></span><span></span></span>' +
        "</button>" +
      "</div>";

    var scrim = document.createElement("div");
    scrim.className = "menu-scrim";
    scrim.id = "clScrim";

    var navHtml = navItems.map(function (it, i) {
      var active = page === it.key ? " active" : "";
      return '<a class="menu-link' + active + '" href="' + it.href + '">' +
        '<span class="idx">0' + (i + 1) + "</span>" +
        '<span class="ml-main"><span class="ml-title" data-i18n="' + it.t + '"></span></span>' +
        '<span class="ml-arrow">' + ICON.arrow + "</span></a>";
    }).join("");

    var langHtml = LANGS.map(function (l) {
      return '<button class="lang-opt" data-lang="' + l.code + '">' + l.name + "</button>";
    }).join("");

    var panel = document.createElement("nav");
    panel.className = "menu-panel";
    panel.id = "clMenu";
    panel.setAttribute("aria-label", "Main menu");
    panel.innerHTML =
      '<div class="menu-head">' +
        '<button class="menu-close" id="clClose" aria-label="Close menu">' + ICON.close + "</button></div>" +
      '<div class="menu-nav">' + navHtml + "</div>" +
      '<div class="menu-div"></div>' +
      '<div class="menu-actions">' +
        '<a class="menu-login" href="app/login.html">' + ICON.key + '<span data-i18n="cta_login"></span></a>' +
      "</div>" +
      '<div class="menu-lang"><div class="menu-lang-head">' + ICON.globe +
        '<span class="eyebrow" data-i18n="menu_lang"></span></div>' +
        '<div class="lang-grid">' + langHtml + "</div></div>" +
      '<div class="menu-foot"><div class="menu-tag" data-i18n="brand_tag"></div>' +
        '<div class="menu-loc" data-i18n="loc"></div></div>';

    document.body.insertBefore(header, document.body.firstChild);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    buildFooter();
    wireMenu();
    wireSticky(header);
  }

  function buildFooter() {
    var f = document.createElement("footer");
    f.className = "site-footer";
    f.innerHTML =
      '<div class="wrap"><div class="footer-inner">' +
        '<div class="footer-brand">' +
          '<span class="brand-wm" style="font-size:28px">Clavori<span class="g">s</span></span>' +
          '<div class="footer-tag" data-i18n="brand_tag"></div>' +
          '<a class="social-li" href="https://www.linkedin.com/company/van-beirs" target="_blank" rel="noopener" aria-label="LinkedIn">' + ICON.linkedin + '</a>' +
        "</div>" +
        '<div class="footer-col"><h4 data-i18n="foot_platform"></h4>' +
          '<a href="app/login.html" data-i18n="foot_f1"></a>' +
          '<a href="app/login.html" data-i18n="foot_f2"></a>' +
          '<a href="technology.html" data-i18n="foot_f3"></a>' +
          '<a href="technology.html" data-i18n="foot_f4"></a></div>' +
        '<div class="footer-col"><h4 data-i18n="foot_company"></h4>' +
          '<a href="about.html" data-i18n="foot_c1"></a>' +
          '<a href="technology.html" data-i18n="foot_c2"></a>' +
          '<a href="why-clavoris.html" data-i18n="foot_c3"></a>' +
          '<a href="app/login.html" data-i18n="foot_c4"></a></div>' +
        '<div class="footer-col"><h4 data-i18n="foot_legal_h"></h4>' +
          '<a href="privacy.html" data-i18n="foot_privacy"></a>' +
          '<a href="terms.html" data-i18n="foot_terms"></a>' +
          '<a class="mono" href="mailto:legal@clavoris.com">legal@clavoris.com</a></div>' +
      "</div>" +
      '<div class="footer-bar"><div class="loc-row"><span class="lbl" data-i18n="foot_loc_h"></span>' +
        '<span data-i18n="foot_loc"></span></div></div>' +
      '<div class="footer-bar"><p data-i18n="foot_legal"></p></div>' +
      '<div class="footer-bar"><p data-i18n="foot_rights"></p>' +
        '<p class="vbv-line">Clavoris BV <span data-i18n="entity_status"></span> · <a class="vbv" href="https://www.vanbeirsventures.com" target="_blank" rel="noopener">Van Beirs Ventures</a></p></div></div>';
    document.body.appendChild(f);
  }

  /* ---- menu open/close ---- */
  function openMenu() {
    document.body.classList.add("menu-open");
    var b = document.getElementById("clBurger");
    if (b) { b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-label", "Close menu"); }
  }
  function closeMenu() {
    document.body.classList.remove("menu-open");
    var b = document.getElementById("clBurger");
    if (b) { b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-label", "Open menu"); }
  }
  function wireMenu() {
    var burger = document.getElementById("clBurger");
    burger.addEventListener("click", function () {
      document.body.classList.contains("menu-open") ? closeMenu() : openMenu();
    });
    document.getElementById("clClose").addEventListener("click", closeMenu);
    document.getElementById("clScrim").addEventListener("click", closeMenu);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
    document.querySelectorAll(".lang-opt").forEach(function (o) {
      o.addEventListener("click", function () { setLang(o.getAttribute("data-lang")); });
    });
  }

  /* ---- sticky shrink ---- */
  function wireSticky(header) {
    var on = false;
    function check() {
      var s = window.scrollY > 24;
      if (s !== on) { on = s; header.classList.toggle("scrolled", s); }
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
  }

  /* ---- countdown (fixed launch date — same on every device) ---- */
  function startCountdown() {
    var root = document.getElementById("clCountdown");
    if (!root) return;
    // Fixed launch instant — 01 September 2027, 09:00 CEST (Europe/Brussels, UTC+2).
    // Absolute UTC timestamp: identical countdown on every device and timezone.
    var target = Date.UTC(2027, 8, 1, 7, 0, 0);
    var els = {
      d: root.querySelector('[data-cd="d"]'), h: root.querySelector('[data-cd="h"]'),
      m: root.querySelector('[data-cd="m"]'), s: root.querySelector('[data-cd="s"]')
    };
    function pad(n, l) { n = String(Math.max(0, n)); while (n.length < (l || 2)) n = "0" + n; return n; }
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var sec = Math.floor(diff / 1000);
      var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
          m = Math.floor((sec % 3600) / 60), s = sec % 60;
      if (els.d) els.d.textContent = pad(d, 3);
      if (els.h) els.h.textContent = pad(h);
      if (els.m) els.m.textContent = pad(m);
      if (els.s) els.s.textContent = pad(s);
    }
    tick(); setInterval(tick, 1000);
  }

  /* ---- reveal on scroll (manual, IO-independent) ---- */
  function wireReveal() {
    var els = [].slice.call(document.querySelectorAll("[data-reveal]"));
    if (!els.length) return;
    function check() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = els.length - 1; i >= 0; i--) {
        var e = els[i];
        var r = e.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) {
          e.classList.add("in");
          els.splice(i, 1);
        }
      }
    }
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    window.addEventListener("load", check);
    setTimeout(check, 120);
    setTimeout(check, 600);
    // ultimate safety net — force visible, cancelling the keyframe animation
    // (a running/pending animation outranks inline styles; some throttled
    //  iframes never paint frames, leaving it stuck at the hidden first frame).
    setTimeout(function () {
      document.querySelectorAll("[data-reveal]").forEach(function (e) {
        var cs = getComputedStyle(e);
        if (parseFloat(cs.opacity) < 0.99) {
          e.classList.add("in");
          e.style.animation = "none";
          e.style.opacity = "1";
          e.style.transform = "none";
        }
      });
    }, 1500);
  }

  function init() {
    if (document.body.getAttribute("data-chrome") !== "off") buildChrome();
    applyI18n();
    startCountdown();
    wireReveal();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.CL = { t: t, render: render, getLang: getLang, setLang: setLang, applyI18n: applyI18n, LANGS: LANGS };
})();
