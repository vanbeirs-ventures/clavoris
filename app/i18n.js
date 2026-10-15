/* Clavoris app — interface languages (en / nl / fr).
   Resolution order: ?lang= in the URL (invitation links) → the signed-in user's profile
   language (set at invitation, changeable under Account) → last choice on this device →
   browser language → English. Static text carries data-i18n="key"; scripts call I.t(key, vars).
   Exposes window.ClavorisI18n = { lang, t, err, apply, set, add, langs }; err(code) turns a server error code
   into a readable sentence, and t() does so automatically for {err} and {e} placeholders.
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
  // Readable texts for the error codes the server returns (e.g. "storage-failed"), so that messages built as
  // I.t('…', { err: code }) never show a raw code. Unknown codes get a generic sentence that keeps the code.
  var E = {
    en: { _: 'The request could not be completed ({c}). Please try again; if it persists, contact access@clavoris.com.', _net: 'Clavoris could not be reached. Check your connection and try again in a moment.',
      forbidden: 'You do not have access to this.', unauthorized: 'Your session has ended. Please sign in again.', 'mfa-required': 'Please complete the second sign-in step first.', 'not-found': 'This item no longer exists or is no longer available.', expired: 'Your access has ended.',
      'nda-required': 'Sign the non-disclosure agreement first.', 'kyc-required': 'Verify your identity first.', 'profile-incomplete': 'Complete your profile first.', 'name-mismatch': 'The name does not match the name on your profile.', 'terms-required': 'Accept the general terms and conditions first.',
      'download-not-allowed': 'Downloading is not allowed in this data room.', 'pdf-only': 'This file type is not accepted.', 'too-large': 'The file is too large.', 'file-unavailable': 'The document is temporarily unavailable.', 'file-unreadable': 'The document could not be read.', 'no-nda': 'No signed NDA was found.',
      'storage-not-configured': 'Document storage is not connected yet.', 'storage-failed': 'The document storage did not respond. Please try again.', 'storage-unavailable': 'The document storage is temporarily unavailable.',
      'too-many': 'Too many attempts. Please wait a moment and try again.', wait: 'Please wait a few seconds before trying again.', 'mail-failed': 'The e-mail could not be sent. Please try again.', 'mail-not-configured': 'Sending e-mail is not configured yet.',
      'kyc-not-configured': 'Identity verification is not available right now.', 'kyc-sync-failed': 'The verification status could not be retrieved. Please try again.', 'provider-unavailable': 'The external service is temporarily unavailable.', 'provider-request-failed': 'The external service returned an error. Please try again.',
      'plan-limit': 'Your subscription does not allow more of these.', 'feature-off': 'This feature is not enabled for your account.', 'email-invalid': 'The e-mail address is not valid.', 'already-pending': 'A request is already pending.', empty: 'Please enter some text.', 'bad-date': 'The date is not valid.', 'not-open': 'This is not open at the moment.' },
    nl: { _: 'Het verzoek kon niet worden uitgevoerd ({c}). Probeer het opnieuw; blijft het probleem bestaan, mail dan naar access@clavoris.com.', _net: 'Clavoris is niet bereikbaar. Controleer uw verbinding en probeer het zo meteen opnieuw.',
      forbidden: 'U hebt hier geen toegang toe.', unauthorized: 'Uw sessie is beëindigd. Meld u opnieuw aan.', 'mfa-required': 'Voltooi eerst de tweede aanmeldstap.', 'not-found': 'Dit item bestaat niet meer of is niet meer beschikbaar.', expired: 'Uw toegang is beëindigd.',
      'nda-required': 'Onderteken eerst de geheimhoudingsovereenkomst.', 'kyc-required': 'Verifieer eerst uw identiteit.', 'profile-incomplete': 'Vervolledig eerst uw profiel.', 'name-mismatch': 'De naam komt niet overeen met de naam op uw profiel.', 'terms-required': 'Aanvaard eerst de algemene voorwaarden.',
      'download-not-allowed': 'Downloaden is in deze dataroom niet toegestaan.', 'pdf-only': 'Dit bestandstype wordt niet aanvaard.', 'too-large': 'Het bestand is te groot.', 'file-unavailable': 'Het document is tijdelijk niet beschikbaar.', 'file-unreadable': 'Het document kon niet worden gelezen.', 'no-nda': 'Er werd geen ondertekende NDA gevonden.',
      'storage-not-configured': 'De documentopslag is nog niet gekoppeld.', 'storage-failed': 'De documentopslag reageerde niet. Probeer het opnieuw.', 'storage-unavailable': 'De documentopslag is tijdelijk niet beschikbaar.',
      'too-many': 'Te veel pogingen. Wacht even en probeer het opnieuw.', wait: 'Wacht enkele seconden voor u het opnieuw probeert.', 'mail-failed': 'De e-mail kon niet worden verstuurd. Probeer het opnieuw.', 'mail-not-configured': 'Het versturen van e-mail is nog niet ingesteld.',
      'kyc-not-configured': 'De identiteitsverificatie is momenteel niet beschikbaar.', 'kyc-sync-failed': 'De verificatiestatus kon niet worden opgehaald. Probeer het opnieuw.', 'provider-unavailable': 'De externe dienst is tijdelijk niet beschikbaar.', 'provider-request-failed': 'De externe dienst gaf een fout. Probeer het opnieuw.',
      'plan-limit': 'Uw abonnement laat er niet meer van toe.', 'feature-off': 'Deze functie is niet geactiveerd voor uw account.', 'email-invalid': 'Het e-mailadres is niet geldig.', 'already-pending': 'Er loopt al een aanvraag.', empty: 'Vul een tekst in.', 'bad-date': 'De datum is niet geldig.', 'not-open': 'Dit is momenteel niet open.' },
    fr: { _: 'La demande n\'a pas pu aboutir ({c}). Veuillez réessayer ; si le problème persiste, écrivez à access@clavoris.com.', _net: 'Clavoris est injoignable. Vérifiez votre connexion et réessayez dans un instant.',
      forbidden: 'Vous n\'avez pas accès à cet élément.', unauthorized: 'Votre session a pris fin. Veuillez vous reconnecter.', 'mfa-required': 'Terminez d\'abord la deuxième étape de connexion.', 'not-found': 'Cet élément n\'existe plus ou n\'est plus disponible.', expired: 'Votre accès a pris fin.',
      'nda-required': 'Signez d\'abord l\'accord de confidentialité.', 'kyc-required': 'Vérifiez d\'abord votre identité.', 'profile-incomplete': 'Complétez d\'abord votre profil.', 'name-mismatch': 'Le nom ne correspond pas au nom de votre profil.', 'terms-required': 'Acceptez d\'abord les conditions générales.',
      'download-not-allowed': 'Le téléchargement n\'est pas autorisé dans cette data room.', 'pdf-only': 'Ce type de fichier n\'est pas accepté.', 'too-large': 'Le fichier est trop volumineux.', 'file-unavailable': 'Le document est temporairement indisponible.', 'file-unreadable': 'Le document n\'a pas pu être lu.', 'no-nda': 'Aucun NDA signé n\'a été trouvé.',
      'storage-not-configured': 'Le stockage des documents n\'est pas encore connecté.', 'storage-failed': 'Le stockage des documents n\'a pas répondu. Veuillez réessayer.', 'storage-unavailable': 'Le stockage des documents est temporairement indisponible.',
      'too-many': 'Trop de tentatives. Patientez un instant puis réessayez.', wait: 'Patientez quelques secondes avant de réessayer.', 'mail-failed': 'L\'e-mail n\'a pas pu être envoyé. Veuillez réessayer.', 'mail-not-configured': 'L\'envoi d\'e-mails n\'est pas encore configuré.',
      'kyc-not-configured': 'La vérification d\'identité n\'est pas disponible pour le moment.', 'kyc-sync-failed': 'Le statut de la vérification n\'a pas pu être récupéré. Veuillez réessayer.', 'provider-unavailable': 'Le service externe est temporairement indisponible.', 'provider-request-failed': 'Le service externe a renvoyé une erreur. Veuillez réessayer.',
      'plan-limit': 'Votre abonnement n\'en permet pas davantage.', 'feature-off': 'Cette fonction n\'est pas activée pour votre compte.', 'email-invalid': 'L\'adresse e-mail n\'est pas valide.', 'already-pending': 'Une demande est déjà en cours.', empty: 'Veuillez saisir un texte.', 'bad-date': 'La date n\'est pas valide.', 'not-open': 'Ceci n\'est pas ouvert pour le moment.' }
  };
  function err(code) {
    var c = String(code == null ? '' : code), T = E[lang] || E.en;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(c)) return c; // already a sentence (or empty)
    if (T[c] || E.en[c]) return T[c] || E.en[c];
    if (/^http-(0|5\d\d)$/.test(c) || c === 'unavailable' || c === 'network' || c === 'timeout') return T._net;
    return T._.replace('{c}', c);
  }
  function t(key, vars) {
    var s = (D[lang] && D[lang][key]) || D.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { var v = vars[k]; if (v == null) return ''; return (k === 'err' || k === 'e') ? err(v) : String(v); });
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
  window.ClavorisI18n = { get lang() { return lang; }, t: t, err: err, apply: apply, set: set, add: add, langs: LANGS };
  set(detect(), false, true);
  // Dictionaries (same cache-bust version as this file), executed before the next script tag.
  ['en', 'nl', 'fr', 'ext', 'access', 'profile', 'account2'].forEach(function (f) { document.write('<script src="i18n/' + f + '.js' + (V ? '?' + V : '') + '"><\/script>'); });
  // The signed-in user's profile language wins once the session is known.
  document.addEventListener('DOMContentLoaded', function () { apply(document); });
})();
