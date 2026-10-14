/* Clavoris app — interface languages (en / nl / fr).
   Resolution order: ?lang= in the URL (invitation links) → the signed-in user's profile
   language (set at invitation, changeable under Account) → last choice on this device →
   browser language → English. Static text carries data-i18n="key"; scripts call I.t(key, vars).
   Exposes window.ClavorisI18n = { lang, t, apply, set, add, langs }.
   The dictionaries live in app/i18n/*.js and are loaded synchronously right after this file. */
(function () {
  'use strict';
  var LANGS = ['en', 'nl', 'fr'];
  var D = { en: {}, nl: {}, fr: {} };
  var V = (document.currentScript && (document.currentScript.src.split('?')[1] || '')) || '';
  var lang = 'en';
  function norm(l) { l = String(l || '').toLowerCase().slice(0, 2); return LANGS.indexOf(l) >= 0 ? l : null; }
  function detect() {
    var fromUrl = null; try { fromUrl = norm(new URLSearchParams(location.search).get('lang')); } catch (e) {}
    var stored = null; try { stored = norm(localStorage.getItem('clv_lang')); } catch (e) {}
    var nav = norm((navigator.languages && navigator.languages[0]) || navigator.language);
    return fromUrl || stored || nav || 'en';
  }
  function set(l, persist, skipApply) {
    l = norm(l) || 'en'; lang = l; document.documentElement.lang = l;
    if (persist !== false) { try { localStorage.setItem('clv_lang', l); } catch (e) {} }
    if (!skipApply) apply(document);
  }
  function t(key, vars) {
    var s = (D[lang] && D[lang][key]) || D.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : String(vars[k]); });
    return s;
  }
  function apply(root) {
    root = root || document;
    [].forEach.call(root.querySelectorAll('[data-i18n]'), function (el) { var k = el.getAttribute('data-i18n'); if (/<br>/.test(D.en[k] || '')) el.innerHTML = t(k); else el.textContent = t(k); });
    [].forEach.call(root.querySelectorAll('[data-i18n-placeholder]'), function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
    [].forEach.call(root.querySelectorAll('[data-i18n-title]'), function (el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    document.title = (root.querySelector && root.querySelector('[data-i18n-doctitle]') ? t(root.querySelector('[data-i18n-doctitle]').getAttribute('data-i18n-doctitle')) + ' — Clavoris' : document.title);
  }
  function add(l, dict) { if (D[l]) { for (var k in dict) D[l][k] = dict[k]; } }
  window.ClavorisI18n = { get lang() { return lang; }, t: t, apply: apply, set: set, add: add, langs: LANGS };
  set(detect(), false, true);
  // Dictionaries (same cache-bust version as this file), executed before the next script tag.
  ['en', 'nl', 'fr', 'ext', 'access', 'profile'].forEach(function (f) { document.write('<script src="i18n/' + f + '.js' + (V ? '?' + V : '') + '"><\/script>'); });
  // The signed-in user's profile language wins once the session is known.
  document.addEventListener('DOMContentLoaded', function () { apply(document); });
})();
