/* Clavoris app — links to the General Terms and Conditions and the Privacy Policy in the page footer.
   Pages with an .app-foot get the links added to it; pages without one (sign-in, password reset) get a
   small footer line. The language follows the app language (ClavorisI18n), else the browser. */
(function () {
  var W = {
    en: ['General Terms and Conditions', 'Privacy Policy'],
    nl: ['Algemene voorwaarden', 'Privacybeleid'],
    fr: ['Conditions générales', 'Politique de confidentialité'],
    de: ['Allgemeine Geschäftsbedingungen', 'Datenschutz'],
    es: ['Condiciones generales', 'Política de privacidad'],
    it: ['Condizioni generali', 'Informativa sulla privacy']
  };
  function run() {
    var I = window.ClavorisI18n, lang = (I && I.lang) || String(navigator.language || 'en').slice(0, 2), w = W[lang] || W.en;
    var ql = '?lang=' + encodeURIComponent(lang);
    var html = '<a href="../terms.html' + ql + '" target="_blank" rel="noopener" style="color:inherit">' + w[0] + '</a> · <a href="../privacy.html' + ql + '" target="_blank" rel="noopener" style="color:inherit">' + w[1] + '</a>';
    var old = document.getElementById('legalLinks'); if (old) { old.innerHTML = html; return; }
    var span = document.createElement('span'); span.id = 'legalLinks'; span.style.fontSize = '11.5px'; span.innerHTML = html;
    var foot = document.querySelector('.app-foot');
    if (foot) { foot.appendChild(span); return; }
    // Sign-in card: a line under the card's own footer note.
    var note = document.querySelector('.foot');
    if (note) { span.style.cssText = 'display:block;margin-top:8px;font-size:11.5px;text-align:center;color:var(--fg-3)'; note.parentNode.insertBefore(span, note.nextSibling); return; }
    var f = document.createElement('footer'); f.className = 'app-foot'; f.style.justifyContent = 'center'; f.appendChild(span); document.body.appendChild(f);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  // Re-label after the app language is set from the profile.
  window.addEventListener('load', function () { setTimeout(run, 800); });
})();
