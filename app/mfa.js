/* Clavoris — two-factor sign-in (screens).
   Sign-in page: after the password, a 6-digit code e-mailed to the user (or, once activated, the code from
   Google Authenticator), then the reminder to activate the authenticator app (every 10 sign-ins or 30 days;
   "don't remind me again" pauses it for 6 months). Account page: activate / deactivate Google Authenticator.
   The server (edge function clv-mfa + database rules) enforces the second factor; these screens only guide.
   Exposes window.ClavorisMfa.start(next). Loaded after clavoris-access.js on login.html and account.html. */
(function () {
  'use strict';
  var A = window.ClavorisAccess, I = window.ClavorisI18n;
  if (!A || !I) return;

  I.add('en', {
    'mfa.slow.title': 'Code not received yet?', 'mfa.slow.body': 'Check your spam folder. If the code does not arrive, your mail server may be refusing our e-mails.',
    'mfa.rej.title': 'Your code could not be delivered', 'mfa.rej.body': 'Your mail server rejected our e-mail to {email}, so the code did not reach you.', 'mfa.rej.totp': 'Use Google Authenticator instead', 'mfa.rej.provider': 'Ask your IT department or e-mail provider to accept e-mail from noreply@clavoris.com, then tap “Send a new code”.',
    'mfa.pw.title': 'Confirm it is you', 'mfa.pw.email': 'To change your password, enter the 6-digit code we sent to {email}.', 'mfa.pw.totp': 'To change your password, enter the code from Google Authenticator.', 'mfa.pw.cancel': 'Cancel', 'mfa.pw.go': 'Confirm',
    'mfa.eyebrow': 'Two-step sign-in', 'mfa.title': 'Enter your sign-in code',
    'mfa.email.lead': 'We sent a 6-digit code to {email}. It is valid for 10 minutes.',
    'mfa.email.sending': 'Sending your code…', 'mfa.code': 'Code', 'mfa.verify': 'Confirm',
    'mfa.resend': 'Send a new code', 'mfa.resend_in': 'New code possible in {s} s',
    'mfa.totp.lead': 'Open Google Authenticator on your phone and enter the 6-digit code shown for Clavoris.',
    'mfa.use_email': 'I don\'t have my phone: send a code by e-mail', 'mfa.use_totp': 'Use Google Authenticator instead',
    'mfa.other': 'Sign in with another account',
    'mfa.err.wrong': 'This code is not correct.', 'mfa.err.wrong_left': 'This code is not correct ({n} attempts left).',
    'mfa.err.expired': 'This code has expired. Send a new code.', 'mfa.err.attempts': 'Too many wrong attempts. Send a new code.',
    'mfa.err.wait': 'Please wait a moment before requesting a new code.', 'mfa.err.too_many': 'Too many codes requested. Try again in an hour or contact access@clavoris.com.',
    'mfa.err.mail': 'The code could not be sent. Try again or contact access@clavoris.com.', 'mfa.err.generic': 'Something went wrong. Please try again.',
    'mfa.ok': 'Confirmed. Opening your portal…',
    'mfa.rem.eyebrow': 'Account security', 'mfa.rem.title': 'Protect your account with Google Authenticator',
    'mfa.rem.body': 'Instead of a code by e-mail, sign in with a code from the Google Authenticator app on your phone. It is more secure: it keeps working even if someone gains access to your mailbox. Activation takes one minute on your account page.',
    'mfa.rem.never': 'Don\'t remind me again', 'mfa.rem.later': 'Later', 'mfa.rem.go': 'Activate now',
    'mfa.acc.title': 'Two-step sign-in', 'mfa.acc.email_only': 'Active: a 6-digit code by e-mail at every sign-in.',
    'mfa.acc.totp_on': 'Active: Google Authenticator. At sign-in you enter the code from the app; a code by e-mail remains available if you don\'t have your phone.',
    'mfa.acc.offer': 'More secure: use the Google Authenticator app on your phone instead of a code by e-mail.',
    'mfa.acc.activate': 'Activate Google Authenticator', 'mfa.acc.deactivate': 'Deactivate Google Authenticator',
    'mfa.acc.step1': '1. Install Google Authenticator (App Store or Google Play) and tap “+” › “Scan a QR code”.',
    'mfa.acc.step2': '2. Scan this code. Can\'t scan? Enter this key in the app instead:',
    'mfa.acc.manual': 'Entering the key by hand? In Google Authenticator tap + and "Enter a setup key", then fill in:', 'mfa.acc.m_name': 'Account name', 'mfa.acc.m_key': 'Your key', 'mfa.acc.m_keyv': 'the key above (copy it with the button)', 'mfa.acc.m_type': 'Type of key', 'mfa.acc.m_typev': 'Time based', 'mfa.acc.copy': 'Copy key', 'mfa.acc.copied': 'Copied',
    'mfa.acc.step3': '3. Enter the 6-digit code the app now shows for Clavoris:', 'mfa.acc.confirm': 'Confirm and activate', 'mfa.acc.cancel': 'Cancel',
    'mfa.acc.done': 'Google Authenticator is active. From your next sign-in you enter the code from the app.',
    'mfa.acc.off_lead': 'To deactivate, enter the current code from Google Authenticator:', 'mfa.acc.off_done': 'Google Authenticator is deactivated. You sign in with a code by e-mail.',
    'mfa.acc.err': 'This did not work: {e}'
  });
  I.add('nl', {
    'mfa.slow.title': 'Nog geen code ontvangen?', 'mfa.slow.body': 'Kijk in uw map met ongewenste e-mail. Komt de code niet aan, dan weigert uw mailserver mogelijk onze e-mails.',
    'mfa.rej.title': 'Uw code kon niet bezorgd worden', 'mfa.rej.body': 'Uw mailserver weigerde onze e-mail naar {email}, waardoor de code u niet bereikte.', 'mfa.rej.totp': 'Gebruik Google Authenticator', 'mfa.rej.provider': 'Vraag uw IT-afdeling of e-mailprovider om e-mail van noreply@clavoris.com te aanvaarden en tik daarna op “Stuur een nieuwe code”.',
    'mfa.pw.title': 'Bevestig dat u het bent', 'mfa.pw.email': 'Vul om uw wachtwoord te wijzigen de code van 6 cijfers in die we naar {email} stuurden.', 'mfa.pw.totp': 'Vul om uw wachtwoord te wijzigen de code uit Google Authenticator in.', 'mfa.pw.cancel': 'Annuleren', 'mfa.pw.go': 'Bevestigen',
    'mfa.eyebrow': 'Aanmelden in twee stappen', 'mfa.title': 'Vul uw aanmeldcode in',
    'mfa.email.lead': 'We stuurden een code van 6 cijfers naar {email}. Ze is 10 minuten geldig.',
    'mfa.email.sending': 'Uw code wordt verstuurd…', 'mfa.code': 'Code', 'mfa.verify': 'Bevestigen',
    'mfa.resend': 'Stuur een nieuwe code', 'mfa.resend_in': 'Nieuwe code mogelijk over {s} s',
    'mfa.totp.lead': 'Open Google Authenticator op uw telefoon en vul de code van 6 cijfers in die bij Clavoris staat.',
    'mfa.use_email': 'Ik heb mijn telefoon niet bij: stuur een code per e-mail', 'mfa.use_totp': 'Gebruik Google Authenticator',
    'mfa.other': 'Aanmelden met een ander account',
    'mfa.err.wrong': 'Deze code is niet correct.', 'mfa.err.wrong_left': 'Deze code is niet correct (nog {n} pogingen).',
    'mfa.err.expired': 'Deze code is verlopen. Vraag een nieuwe code aan.', 'mfa.err.attempts': 'Te veel foute pogingen. Vraag een nieuwe code aan.',
    'mfa.err.wait': 'Wacht even voor u een nieuwe code aanvraagt.', 'mfa.err.too_many': 'Te veel codes aangevraagd. Probeer het over een uur opnieuw of contacteer access@clavoris.com.',
    'mfa.err.mail': 'De code kon niet verstuurd worden. Probeer opnieuw of contacteer access@clavoris.com.', 'mfa.err.generic': 'Er ging iets mis. Probeer het opnieuw.',
    'mfa.ok': 'Bevestigd. Uw portaal wordt geopend…',
    'mfa.rem.eyebrow': 'Beveiliging van uw account', 'mfa.rem.title': 'Beveilig uw account met Google Authenticator',
    'mfa.rem.body': 'Meld u aan met een code uit de app Google Authenticator op uw telefoon in plaats van een code per e-mail. Dat is veiliger: het blijft werken, ook als iemand toegang krijgt tot uw mailbox. Activeren duurt één minuut op uw accountpagina.',
    'mfa.rem.never': 'Herinner me hier niet meer aan', 'mfa.rem.later': 'Later', 'mfa.rem.go': 'Nu activeren',
    'mfa.acc.title': 'Aanmelden in twee stappen', 'mfa.acc.email_only': 'Actief: bij elke aanmelding een code van 6 cijfers per e-mail.',
    'mfa.acc.totp_on': 'Actief: Google Authenticator. Bij het aanmelden vult u de code uit de app in; een code per e-mail blijft mogelijk als u uw telefoon niet bij hebt.',
    'mfa.acc.offer': 'Veiliger: gebruik de app Google Authenticator op uw telefoon in plaats van een code per e-mail.',
    'mfa.acc.activate': 'Google Authenticator activeren', 'mfa.acc.deactivate': 'Google Authenticator uitschakelen',
    'mfa.acc.step1': '1. Installeer Google Authenticator (App Store of Google Play) en tik op “+” › “QR-code scannen”.',
    'mfa.acc.step2': '2. Scan deze code. Lukt scannen niet? Vul dan deze sleutel in de app in:',
    'mfa.acc.manual': 'De sleutel met de hand invoeren? Tik in Google Authenticator op + en "Een configuratiesleutel invoeren", en vul in:', 'mfa.acc.m_name': 'Accountnaam', 'mfa.acc.m_key': 'Uw sleutel', 'mfa.acc.m_keyv': 'de sleutel hierboven (kopieer hem met de knop)', 'mfa.acc.m_type': 'Type sleutel', 'mfa.acc.m_typev': 'Op tijd gebaseerd', 'mfa.acc.copy': 'Sleutel kopiëren', 'mfa.acc.copied': 'Gekopieerd',
    'mfa.acc.step3': '3. Vul de code van 6 cijfers in die de app nu bij Clavoris toont:', 'mfa.acc.confirm': 'Bevestigen en activeren', 'mfa.acc.cancel': 'Annuleren',
    'mfa.acc.done': 'Google Authenticator is actief. Vanaf uw volgende aanmelding vult u de code uit de app in.',
    'mfa.acc.off_lead': 'Vul om uit te schakelen de huidige code uit Google Authenticator in:', 'mfa.acc.off_done': 'Google Authenticator is uitgeschakeld. U meldt zich aan met een code per e-mail.',
    'mfa.acc.err': 'Dit lukte niet: {e}'
  });
  I.add('fr', {
    'mfa.slow.title': 'Code toujours pas reçu ?', 'mfa.slow.body': 'Vérifiez votre dossier de courrier indésirable. Si le code n\'arrive pas, votre serveur de messagerie refuse peut-être nos e-mails.',
    'mfa.rej.title': 'Votre code n\'a pas pu être remis', 'mfa.rej.body': 'Votre serveur de messagerie a refusé notre e-mail à {email} : le code ne vous est pas parvenu.', 'mfa.rej.totp': 'Utiliser Google Authenticator', 'mfa.rej.provider': 'Demandez à votre service informatique ou à votre fournisseur de messagerie d\'accepter les e-mails de noreply@clavoris.com, puis touchez « Envoyer un nouveau code ».',
    'mfa.pw.title': 'Confirmez votre identité', 'mfa.pw.email': 'Pour changer votre mot de passe, saisissez le code à 6 chiffres envoyé à {email}.', 'mfa.pw.totp': 'Pour changer votre mot de passe, saisissez le code de Google Authenticator.', 'mfa.pw.cancel': 'Annuler', 'mfa.pw.go': 'Confirmer',
    'mfa.eyebrow': 'Connexion en deux étapes', 'mfa.title': 'Saisissez votre code de connexion',
    'mfa.email.lead': 'Nous avons envoyé un code à 6 chiffres à {email}. Il est valable 10 minutes.',
    'mfa.email.sending': 'Envoi de votre code…', 'mfa.code': 'Code', 'mfa.verify': 'Confirmer',
    'mfa.resend': 'Envoyer un nouveau code', 'mfa.resend_in': 'Nouveau code possible dans {s} s',
    'mfa.totp.lead': 'Ouvrez Google Authenticator sur votre téléphone et saisissez le code à 6 chiffres affiché pour Clavoris.',
    'mfa.use_email': 'Je n\'ai pas mon téléphone : envoyer un code par e-mail', 'mfa.use_totp': 'Utiliser Google Authenticator',
    'mfa.other': 'Se connecter avec un autre compte',
    'mfa.err.wrong': 'Ce code n\'est pas correct.', 'mfa.err.wrong_left': 'Ce code n\'est pas correct (encore {n} essais).',
    'mfa.err.expired': 'Ce code a expiré. Demandez un nouveau code.', 'mfa.err.attempts': 'Trop d\'essais erronés. Demandez un nouveau code.',
    'mfa.err.wait': 'Patientez un instant avant de demander un nouveau code.', 'mfa.err.too_many': 'Trop de codes demandés. Réessayez dans une heure ou contactez access@clavoris.com.',
    'mfa.err.mail': 'Le code n\'a pas pu être envoyé. Réessayez ou contactez access@clavoris.com.', 'mfa.err.generic': 'Une erreur s\'est produite. Veuillez réessayer.',
    'mfa.ok': 'Confirmé. Ouverture de votre portail…',
    'mfa.rem.eyebrow': 'Sécurité du compte', 'mfa.rem.title': 'Protégez votre compte avec Google Authenticator',
    'mfa.rem.body': 'Au lieu d\'un code par e-mail, connectez-vous avec un code de l\'application Google Authenticator sur votre téléphone. C\'est plus sûr : cela reste efficace même si quelqu\'un accède à votre boîte mail. L\'activation prend une minute sur votre page de compte.',
    'mfa.rem.never': 'Ne plus me le rappeler', 'mfa.rem.later': 'Plus tard', 'mfa.rem.go': 'Activer maintenant',
    'mfa.acc.title': 'Connexion en deux étapes', 'mfa.acc.email_only': 'Active : un code à 6 chiffres par e-mail à chaque connexion.',
    'mfa.acc.totp_on': 'Active : Google Authenticator. À la connexion, vous saisissez le code de l\'application ; un code par e-mail reste possible si vous n\'avez pas votre téléphone.',
    'mfa.acc.offer': 'Plus sûr : utilisez l\'application Google Authenticator sur votre téléphone au lieu d\'un code par e-mail.',
    'mfa.acc.activate': 'Activer Google Authenticator', 'mfa.acc.deactivate': 'Désactiver Google Authenticator',
    'mfa.acc.step1': '1. Installez Google Authenticator (App Store ou Google Play) et touchez « + » › « Scanner un code QR ».',
    'mfa.acc.step2': '2. Scannez ce code. Impossible de scanner ? Saisissez cette clé dans l\'application :',
    'mfa.acc.manual': 'Vous saisissez la clé à la main ? Dans Google Authenticator, touchez + puis « Saisir une clé de configuration », et remplissez :', 'mfa.acc.m_name': 'Nom du compte', 'mfa.acc.m_key': 'Votre clé', 'mfa.acc.m_keyv': 'la clé ci-dessus (copiez-la avec le bouton)', 'mfa.acc.m_type': 'Type de clé', 'mfa.acc.m_typev': 'Basée sur l\'heure', 'mfa.acc.copy': 'Copier la clé', 'mfa.acc.copied': 'Copiée',
    'mfa.acc.step3': '3. Saisissez le code à 6 chiffres que l\'application affiche maintenant pour Clavoris :', 'mfa.acc.confirm': 'Confirmer et activer', 'mfa.acc.cancel': 'Annuler',
    'mfa.acc.done': 'Google Authenticator est actif. Dès votre prochaine connexion, vous saisissez le code de l\'application.',
    'mfa.acc.off_lead': 'Pour désactiver, saisissez le code actuel de Google Authenticator :', 'mfa.acc.off_done': 'Google Authenticator est désactivé. Vous vous connectez avec un code par e-mail.',
    'mfa.acc.err': 'Cela n\'a pas fonctionné : {e}'
  });

  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function t(k, v) { return I.t(k, v); }
  function sb() { return A.client(); }
  // Six separate, large boxes for the 6-digit code. Typing moves to the next box, Backspace goes back, and a
  // pasted or auto-filled code (SMS / e-mail one-time-code suggestion) is spread over the boxes.
  var CSS = '.otp{display:flex;gap:8px;justify-content:center;margin-top:6px}'
    + '.otp input{width:min(50px,13vw);height:60px;padding:0;text-align:center;font-family:var(--font-data);font-size:28px;font-weight:600;color:var(--clavis-navy);'
    + 'background:var(--bg-raised);border:1.5px solid var(--border-strong);border-radius:10px;outline:none;caret-color:var(--seal-gold);transition:border-color .12s,box-shadow .12s}'
    + '.otp input:focus{border-color:var(--clavis-navy);box-shadow:0 0 0 3px rgba(184,134,11,.30)}'
    + '.otp input.filled{border-color:var(--clavis-navy)}'
    + '.otp.err input{border-color:var(--status-alert)}';
  (function () { if (document.getElementById('otpCss')) return; var st = document.createElement('style'); st.id = 'otpCss'; st.textContent = CSS; document.head.appendChild(st); })();
  function codeInput(id) {
    var h = '<div class="otp" id="' + id + '" role="group" aria-label="' + esc(t('mfa.code')) + '">';
    for (var i = 0; i < 6; i++) h += '<input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="' + (i ? 'off' : 'one-time-code') + '" aria-label="' + esc(t('mfa.code')) + ' ' + (i + 1) + '" data-i="' + i + '">';
    return h + '</div>';
  }
  // The six boxes behave like one field: .value, .focus(), .select() (clear and start again), and 'input' events.
  function otpBox(id) {
    var wrap = q(id), ins = [].slice.call(wrap.querySelectorAll('input')), subs = [];
    function val() { return ins.map(function (x) { return x.value; }).join(''); }
    function paint() { ins.forEach(function (x) { x.classList.toggle('filled', !!x.value); }); wrap.classList.remove('err'); }
    function fire() { paint(); subs.forEach(function (fn) { try { fn(); } catch (e) {} }); }
    function spread(from, str) {
      var d = digits(str).split(''), i = from;
      d.forEach(function (c) { if (i < 6) ins[i++].value = c; });
      return Math.min(i, 5);
    }
    ins.forEach(function (inp, i) {
      inp.addEventListener('input', function () {
        var raw = inp.value.replace(/\D/g, '');
        if (raw.length > 1) { var last = spread(i, raw); ins[last].focus(); }
        else { inp.value = raw; if (raw && i < 5) ins[i + 1].focus(); }
        fire();
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !inp.value && i > 0) { ins[i - 1].value = ''; ins[i - 1].focus(); fire(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && i > 0) { ins[i - 1].focus(); e.preventDefault(); }
        else if (e.key === 'ArrowRight' && i < 5) { ins[i + 1].focus(); e.preventDefault(); }
      });
      inp.addEventListener('paste', function (e) {
        var txt = (e.clipboardData || window.clipboardData).getData('text'); if (!digits(txt)) return;
        e.preventDefault(); ins.forEach(function (x) { x.value = ''; }); var last = spread(0, txt); ins[last].focus(); fire();
      });
      inp.addEventListener('focus', function () { try { inp.select(); } catch (e) {} });
    });
    return {
      get value() { return val(); },
      set value(v) { var d = digits(v); ins.forEach(function (x, k) { x.value = d[k] || ''; }); paint(); },
      focus: function () { var k = val().length; (ins[Math.min(k, 5)] || ins[0]).focus(); },
      select: function () { ins.forEach(function (x) { x.value = ''; }); paint(); wrap.classList.add('err'); ins[0].focus(); },
      addEventListener: function (ev, fn) { if (ev === 'input') subs.push(fn); }
    };
  }
  function digits(v) { return String(v || '').replace(/\D/g, '').slice(0, 6); }
  function totpFactor() {
    return sb().auth.mfa.listFactors().then(function (r) { var f = (r && r.data && r.data.totp) || []; return f.filter(function (x) { return x.status === 'verified'; })[0] || null; });
  }

  /* ---------------- sign-in page: second step ---------------- */
  function start(next) {
    var host = (q('loginForm') || {}).parentNode; if (!host) return;
    // From here on the user is known: the second step speaks the profile language, not the browser's.
    var pf = A.profile && A.profile();
    if (pf && pf.lang && pf.lang !== I.lang) {
      I.set(pf.lang);
      [].forEach.call(document.querySelectorAll('#langSw [data-lang]'), function (b) { b.classList.toggle('active', b.getAttribute('data-lang') === I.lang); });
    }
    ['loginForm', 'forgotForm'].forEach(function (id) { if (q(id)) q(id).hidden = true; });
    var box = q('mfaForm');
    if (!box) {
      box = document.createElement('form'); box.id = 'mfaForm'; box.setAttribute('autocomplete', 'off'); box.setAttribute('onsubmit', 'return false;');
      host.appendChild(box);
    }
    box.hidden = false;
    box.innerHTML = '<p class="eyebrow" data-i18n="mfa.eyebrow">' + esc(t('mfa.eyebrow')) + '</p><h2 data-i18n="mfa.title">' + esc(t('mfa.title')) + '</h2>'
      + '<p class="lead" id="mfaLead">' + esc(t('mfa.email.sending')) + '</p>'
      + '<div class="field"><label data-i18n="mfa.code">' + esc(t('mfa.code')) + '</label>' + codeInput('mfaCode') + '</div>'
      + '<p class="msg" id="mfaMsg" role="status"></p>'
      + '<div id="mfaRej" role="alert" hidden style="margin:4px 0 14px;padding:14px 16px;border:1px solid var(--status-alert);border-left-width:4px;border-radius:8px;background:rgba(179,38,30,.06);font-size:13.5px;line-height:1.6"></div>'
      + '<button class="btn btn-primary btn-block" type="submit" id="mfaBtn" disabled>' + esc(t('mfa.verify')) + '</button>'
      + '<div style="text-align:center;margin-top:12px;display:flex;flex-direction:column;gap:6px;align-items:center">'
      + '<button type="button" class="btn-text" id="mfaResend" hidden></button><button type="button" class="btn-text" id="mfaSwitch" hidden></button>'
      + '<button type="button" class="btn-text" id="mfaOther">' + esc(t('mfa.other')) + '</button></div>';
    var mode = 'email', timer = null, busy = false, hasTotp = false, watch = null, slow = null;
    // After an e-mailed code is sent, its delivery is checked every 4 s. The user never waits more than 20 s for
    // feedback: if delivery is not confirmed by then, a notice explains what to check; when the recipient's mail
    // server is known to have rejected the code (HTML and plain-text retry), the notice says so. Checking stops
    // after 16 minutes (a server that greylists can take ~10 minutes to answer).
    function hideRej() { clearTimeout(slow); var r = q('mfaRej'); if (r) { r.hidden = true; r.innerHTML = ''; } }
    function showRej(email, rejected) {
      var r = q('mfaRej'); if (!r) return;
      r.innerHTML = '<strong style="display:block;margin-bottom:4px">' + esc(t(rejected ? 'mfa.rej.title' : 'mfa.slow.title')) + '</strong>'
        + esc(rejected ? t('mfa.rej.body', { email: email || '' }) : t('mfa.slow.body'))
        + (hasTotp ? '<div style="margin-top:8px"><button type="button" class="btn-text" id="mfaRejTotp">' + esc(t('mfa.rej.totp')) + '</button></div>' : '')
        + '<div style="margin-top:8px">' + esc(t('mfa.rej.provider')) + '</div>';
      r.style.borderColor = rejected ? 'var(--status-alert)' : 'var(--border-strong)';
      r.style.background = rejected ? 'rgba(179,38,30,.06)' : 'var(--bg-raised)';
      r.hidden = false;
      var b = q('mfaRejTotp'); if (b) b.addEventListener('click', function () { hideRej(); useTotp(); });
    }
    function watchDelivery() {
      clearInterval(watch); hideRej();
      var started = Date.now(), email = '';
      slow = setTimeout(function () { if (mode === 'email') showRej(email, false); }, 20000);
      function check() {
        if (mode !== 'email' || !document.body.contains(box) || Date.now() - started > 16 * 60000) { clearInterval(watch); return; }
        A.callFn('clv-mfa', { action: 'delivery' }).then(function (r) {
          if (!r || !r.ok || mode !== 'email') return;
          if (r.email) email = r.email;
          if (r.state === 'delivered') { clearInterval(watch); hideRej(); }
          else if (r.state === 'rejected') { clearInterval(watch); clearTimeout(slow); showRej(email, true); }
        });
      }
      watch = setInterval(check, 4000);
    }
    var code = otpBox('mfaCode'), btn = q('mfaBtn'), msg = q('mfaMsg');
    function say(k, v, kind) { msg.className = 'msg' + (kind ? ' ' + kind : ''); msg.textContent = k ? t(k, v) : ''; }
    code.addEventListener('input', function () { btn.disabled = code.value.length !== 6 || busy; if (code.value.length === 6 && !busy) submit(); });
    q('mfaOther').addEventListener('click', function () { A.signOut().then(function () { location.replace('login.html' + (next ? '?next=' + encodeURIComponent(next) : '')); }); });
    function countdown(sec) {
      var b = q('mfaResend'); b.hidden = false; b.disabled = true; clearInterval(timer);
      var left = sec;
      function tick() { if (left <= 0) { clearInterval(timer); b.disabled = false; b.textContent = t('mfa.resend'); return; } b.textContent = t('mfa.resend_in', { s: left }); left -= 1; }
      tick(); timer = setInterval(tick, 1000);
    }
    function sendEmail() {
      mode = 'email'; q('mfaLead').textContent = t('mfa.email.sending'); say(''); hideRej();
      A.callFn('clv-mfa', { action: 'send' }).then(function (r) {
        if (r && r.ok) { q('mfaLead').textContent = t('mfa.email.lead', { email: r.sent_to }); countdown(30); code.focus(); watchDelivery(); return; }
        if (r && r.error === 'wait') { q('mfaLead').textContent = t('mfa.email.lead', { email: '' }).replace(/\s+\./, '.'); countdown(r.retry_in || 30); say('mfa.err.wait', null, 'err'); return; }
        say(r && r.error === 'too-many' ? 'mfa.err.too_many' : r && r.error === 'mail-failed' ? 'mfa.err.mail' : 'mfa.err.generic', null, 'err');
        countdown(30);
      });
    }
    function useTotp() {
      mode = 'totp'; q('mfaLead').textContent = t('mfa.totp.lead'); say(''); q('mfaResend').hidden = true; clearInterval(timer); clearInterval(watch); hideRej();
      var s = q('mfaSwitch'); s.hidden = false; s.textContent = t('mfa.use_email'); s.onclick = function () { s.textContent = t('mfa.use_totp'); s.onclick = useTotp; sendEmail(); };
      code.focus();
    }
    q('mfaResend').addEventListener('click', sendEmail);
    function done(r) {
      A.markMfa().then(function () {
        say('mfa.ok', null, 'ok');
        var target = next || A.homeFor();
        if (r && r.remind) { remind(target); return; }
        setTimeout(function () { location.href = target; }, 500);
      });
    }
    function fail(r) {
      busy = false; btn.disabled = false; code.select();
      var e = r && r.error;
      if (e === 'wrong-code') say(typeof r.attempts_left === 'number' ? 'mfa.err.wrong_left' : 'mfa.err.wrong', { n: r.attempts_left }, 'err');
      else if (e === 'expired') say('mfa.err.expired', null, 'err');
      else if (e === 'too-many-attempts') say('mfa.err.attempts', null, 'err');
      else say('mfa.err.generic', null, 'err');
    }
    function submit() {
      var c = digits(code.value); if (c.length !== 6 || busy) return;
      busy = true; btn.disabled = true; say('');
      if (mode === 'email') { A.callFn('clv-mfa', { action: 'verify', code: c }).then(function (r) { if (r && r.ok) done(r); else fail(r); }); return; }
      totpFactor().then(function (f) {
        if (!f) return fail({ error: 'generic' });
        return sb().auth.mfa.challengeAndVerify({ factorId: f.id, code: c }).then(function (res) {
          if (res.error) return fail({ error: 'wrong-code' });
          return A.callFn('clv-mfa', { action: 'totp_done' }).then(function (r) { if (r && r.ok) done(r); else fail(r); });
        });
      }).catch(function () { fail({ error: 'generic' }); });
    }
    box.addEventListener('submit', submit); btn.addEventListener('click', submit);
    A.callFn('clv-mfa', { action: 'status' }).then(function (r) {
      if (r && r.verified) { A.markMfa().then(function () { location.replace(next || A.homeFor()); }); return; }
      hasTotp = !!(r && r.totp);
      if (r && r.totp) useTotp(); else sendEmail();
    });
  }

  /* ---------------- reminder: activate Google Authenticator ---------------- */
  function remind(target) {
    var d = document.createElement('div'); d.className = 'scrim'; d.id = 'mfaRemind';
    d.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="e">' + esc(t('mfa.rem.eyebrow')) + '</div><div class="t">' + esc(t('mfa.rem.title')) + '</div></div></div>'
      + '<div class="modal-body"><p style="font-size:14px;line-height:1.65">' + esc(t('mfa.rem.body')) + '</p>'
      + '<label class="check" style="margin-top:14px"><input type="checkbox" id="remNever"> <span>' + esc(t('mfa.rem.never')) + '</span></label>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" id="remLater">' + esc(t('mfa.rem.later')) + '</button><button class="btn btn-primary" type="button" id="remGo">' + esc(t('mfa.rem.go')) + '</button></div></div></div>';
    document.body.appendChild(d);
    function answer(dest) {
      q('remLater').disabled = true; q('remGo').disabled = true;
      var never = q('remNever').checked;
      (never ? A.callFn('clv-mfa', { action: 'remind', never: true }) : Promise.resolve()).then(function () { location.href = dest; }, function () { location.href = dest; });
    }
    q('remLater').addEventListener('click', function () { answer(target); });
    q('remGo').addEventListener('click', function () { answer('account.html#mfa'); });
  }

  /* ---------------- account page: Google Authenticator ---------------- */
  function accountBlock() {
    var anchor = q('idv'); if (!anchor || q('mfa')) return;
    var sec = document.createElement('section'); sec.className = 'card'; sec.id = 'mfa'; sec.style.cssText = 'padding:22px;margin-top:24px';
    anchor.parentNode.insertBefore(sec, anchor);
    function render() {
      totpFactor().then(function (f) {
        sec.innerHTML = '<h2 style="font-family:var(--font-display);font-size:20px;color:var(--clavis-navy)">' + esc(t('mfa.acc.title')) + '</h2>'
          + '<p style="font-size:13px;color:var(--fg-2);margin-top:8px;line-height:1.6">' + esc(t(f ? 'mfa.acc.totp_on' : 'mfa.acc.email_only')) + '</p>'
          + (f ? '' : '<p style="font-size:13px;color:var(--fg-2);margin-top:6px;line-height:1.6">' + esc(t('mfa.acc.offer')) + '</p>')
          + '<div id="mfaAct" style="margin-top:14px"><button class="btn ' + (f ? '' : 'btn-primary') + '" type="button" id="mfaToggle">' + esc(t(f ? 'mfa.acc.deactivate' : 'mfa.acc.activate')) + '</button></div>'
          + '<p class="msg" id="mfaAccMsg" role="status" style="margin-top:10px"></p>';
        q('mfaToggle').addEventListener('click', function () { if (f) deactivate(f); else activate(); });
      });
    }
    function msg(k, v, kind) { var m = q('mfaAccMsg'); if (!m) return; m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = k ? t(k, v) : ''; }
    function activate() {
      var client = sb();
      // Leftovers of an earlier, unfinished activation are removed first.
      client.auth.mfa.listFactors().then(function (r) {
        var stale = ((r && r.data && r.data.all) || []).filter(function (x) { return x.factor_type === 'totp' && x.status !== 'verified'; });
        return Promise.all(stale.map(function (x) { return client.auth.mfa.unenroll({ factorId: x.id }); }));
      }).then(function () {
        return client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Clavoris ' + new Date().toISOString().slice(0, 10), issuer: 'Clavoris' });
      }).then(function (res) {
        if (res.error) { msg('mfa.acc.err', { e: res.error.message }, 'err'); return; }
        var fid = res.data.id, qr = res.data.totp.qr_code, secret = res.data.totp.secret;
        q('mfaAct').innerHTML = '<p style="font-size:13px;line-height:1.6">' + esc(t('mfa.acc.step1')) + '</p>'
          + '<p style="font-size:13px;line-height:1.6;margin-top:10px">' + esc(t('mfa.acc.step2')) + '</p>'
          + '<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:8px"><img src="' + esc(qr) + '" alt="QR" width="176" height="176" style="background:#fff;padding:8px;border:1px solid var(--line)">'
          + '<div><code class="mono" style="font-size:13px;word-break:break-all;max-width:260px;display:block">' + esc(secret) + '</code><button type="button" class="btn-text" id="mfaCopy" style="margin-top:6px;font-size:12.5px">' + esc(t('mfa.acc.copy')) + '</button></div></div>'
          // Manual entry: the three fields of Google Authenticator's "Enter a setup key" screen, filled in for the user.
          + '<p style="font-size:12.5px;line-height:1.6;margin-top:10px;color:var(--fg-2)">' + esc(t('mfa.acc.manual')) + '</p>'
          + '<table style="font-size:12.5px;margin-top:4px;border-collapse:collapse"><tr><td style="padding:2px 14px 2px 0;color:var(--fg-3)">' + esc(t('mfa.acc.m_name')) + '</td><td><b>Clavoris</b></td></tr>'
          + '<tr><td style="padding:2px 14px 2px 0;color:var(--fg-3)">' + esc(t('mfa.acc.m_key')) + '</td><td>' + esc(t('mfa.acc.m_keyv')) + '</td></tr>'
          + '<tr><td style="padding:2px 14px 2px 0;color:var(--fg-3)">' + esc(t('mfa.acc.m_type')) + '</td><td><b>' + esc(t('mfa.acc.m_typev')) + '</b></td></tr></table>'
          + '<p style="font-size:13px;line-height:1.6;margin-top:12px">' + esc(t('mfa.acc.step3')) + '</p>'
          + '<div class="field" style="max-width:380px">' + codeInput('mfaNew') + '</div>'
          + '<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn btn-primary" type="button" id="mfaConfirm">' + esc(t('mfa.acc.confirm')) + '</button><button class="btn btn-ghost" type="button" id="mfaCancel">' + esc(t('mfa.acc.cancel')) + '</button></div>';
        var cp = q('mfaCopy'); if (cp) cp.addEventListener('click', function () { try { navigator.clipboard.writeText(secret).then(function () { cp.textContent = t('mfa.acc.copied'); setTimeout(function () { cp.textContent = t('mfa.acc.copy'); }, 2000); }); } catch (e) {} });
        var newCode = otpBox('mfaNew'); newCode.focus();
        q('mfaCancel').addEventListener('click', function () { client.auth.mfa.unenroll({ factorId: fid }).then(render, render); });
        q('mfaConfirm').addEventListener('click', function () {
          var c = digits(newCode.value); if (c.length !== 6) return;
          q('mfaConfirm').disabled = true;
          client.auth.mfa.challengeAndVerify({ factorId: fid, code: c }).then(function (v) {
            if (v.error) { q('mfaConfirm').disabled = false; msg('mfa.err.wrong', null, 'err'); return; }
            A.markMfa().then(function () { render(); setTimeout(function () { msg('mfa.acc.done', null, 'ok'); }, 300); });
          });
        });
      }).catch(function (e) { msg('mfa.acc.err', { e: (e && e.message) || '' }, 'err'); });
    }
    function deactivate(f) {
      var client = sb();
      q('mfaAct').innerHTML = '<p style="font-size:13px;line-height:1.6">' + esc(t('mfa.acc.off_lead')) + '</p><div class="field" style="max-width:380px">' + codeInput('mfaOff') + '</div>'
        + '<div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn" type="button" id="mfaOffGo">' + esc(t('mfa.acc.deactivate')) + '</button><button class="btn btn-ghost" type="button" id="mfaOffCancel">' + esc(t('mfa.acc.cancel')) + '</button></div>';
      var offCode = otpBox('mfaOff'); offCode.focus();
      q('mfaOffCancel').addEventListener('click', render);
      q('mfaOffGo').addEventListener('click', function () {
        var c = digits(offCode.value); if (c.length !== 6) return;
        q('mfaOffGo').disabled = true;
        // Removing the app needs a fresh code from it (the session is raised to aal2 first).
        client.auth.mfa.challengeAndVerify({ factorId: f.id, code: c }).then(function (v) {
          if (v.error) { q('mfaOffGo').disabled = false; msg('mfa.err.wrong', null, 'err'); return; }
          return client.auth.mfa.unenroll({ factorId: f.id }).then(function (u) {
            if (u.error) { q('mfaOffGo').disabled = false; msg('mfa.acc.err', { e: u.error.message }, 'err'); return; }
            render(); setTimeout(function () { msg('mfa.acc.off_done', null, 'ok'); }, 300);
          });
        });
      });
    }
    render();
    if (location.hash === '#mfa') setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
  }

  /* ---------------- confirming a password change ----------------
     Resolves { code } (e-mailed code for purpose "password"), { totp: true } (authenticator code just
     entered: the session now carries a fresh totp entry) or null when cancelled. The server checks it again. */
  function confirmPassword() {
    return new Promise(function (resolve) {
      var old = q('mfaPw'); if (old) old.remove();
      var d = document.createElement('div'); d.className = 'scrim'; d.id = 'mfaPw';
      d.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="e">' + esc(t('mfa.eyebrow')) + '</div><div class="t">' + esc(t('mfa.pw.title')) + '</div></div></div>'
        + '<form class="modal-body" id="mfaPwForm" onsubmit="return false;"><p style="font-size:14px;line-height:1.6" id="mfaPwLead">' + esc(t('mfa.email.sending')) + '</p>'
        + '<div class="field">' + codeInput('mfaPwCode') + '</div><p class="msg" id="mfaPwMsg" role="status"></p>'
        + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" id="mfaPwCancel">' + esc(t('mfa.pw.cancel')) + '</button><button class="btn btn-primary" type="submit" id="mfaPwGo" disabled>' + esc(t('mfa.pw.go')) + '</button></div>'
        + '<div style="text-align:center;margin-top:10px;display:flex;flex-direction:column;gap:6px;align-items:center"><button type="button" class="btn-text" id="mfaPwResend" hidden></button><button type="button" class="btn-text" id="mfaPwSwitch" hidden></button></div></form></div>';
      document.body.appendChild(d);
      var mode = 'email', timer = null, code = otpBox('mfaPwCode'), go = q('mfaPwGo'), factor = null;
      function say(k, v, kind) { var m = q('mfaPwMsg'); m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = k ? t(k, v) : ''; }
      function finish(v) { clearInterval(timer); d.remove(); resolve(v); }
      function countdown(sec) {
        var b = q('mfaPwResend'); b.hidden = false; b.disabled = true; clearInterval(timer); var left = sec;
        function tick() { if (left <= 0) { clearInterval(timer); b.disabled = false; b.textContent = t('mfa.resend'); return; } b.textContent = t('mfa.resend_in', { s: left }); left -= 1; }
        tick(); timer = setInterval(tick, 1000);
      }
      function sendEmail() {
        mode = 'email'; q('mfaPwLead').textContent = t('mfa.email.sending'); say('');
        A.callFn('clv-mfa', { action: 'send', purpose: 'password' }).then(function (r) {
          if (r && r.ok) { q('mfaPwLead').textContent = t('mfa.pw.email', { email: r.sent_to }); countdown(30); code.focus(); return; }
          say(r && r.error === 'wait' ? 'mfa.err.wait' : r && r.error === 'too-many' ? 'mfa.err.too_many' : r && r.error === 'mail-failed' ? 'mfa.err.mail' : 'mfa.err.generic', null, 'err');
          countdown((r && r.retry_in) || 30);
        });
      }
      function useTotp() {
        mode = 'totp'; q('mfaPwLead').textContent = t('mfa.pw.totp'); say(''); q('mfaPwResend').hidden = true; clearInterval(timer);
        var s = q('mfaPwSwitch'); s.hidden = false; s.textContent = t('mfa.use_email'); s.onclick = function () { s.textContent = t('mfa.use_totp'); s.onclick = useTotp; sendEmail(); };
        code.focus();
      }
      code.addEventListener('input', function () { go.disabled = code.value.length !== 6; if (code.value.length === 6) q('mfaPwGo').click(); });
      q('mfaPwCancel').addEventListener('click', function () { finish(null); });
      q('mfaPwResend').addEventListener('click', sendEmail);
      q('mfaPwForm').addEventListener('submit', function () {
        var c = digits(code.value); if (c.length !== 6) return;
        if (mode === 'email') { finish({ code: c }); return; }
        go.disabled = true;
        sb().auth.mfa.challengeAndVerify({ factorId: factor.id, code: c }).then(function (res) {
          if (res.error) { go.disabled = false; say('mfa.err.wrong', null, 'err'); code.select(); return; }
          finish({ totp: true });
        }, function () { go.disabled = false; say('mfa.err.generic', null, 'err'); });
      });
      totpFactor().then(function (f) { factor = f; if (f) useTotp(); else sendEmail(); }, sendEmail);
    });
  }
  // Error message key for a failed change_password answer.
  function passwordError(e) {
    return { 'wrong-code': 'mfa.err.wrong', 'expired': 'mfa.err.expired', 'too-many-attempts': 'mfa.err.attempts', 'no-code': 'mfa.err.expired', 'code-required': 'mfa.err.expired', 'mfa-required': 'mfa.err.generic' }[e] || null;
  }

  window.ClavorisMfa = { start: start, confirmPassword: confirmPassword, passwordError: passwordError };
  if (q('idv')) A.ready(function () { if (A.clears('full')) accountBlock(); });
})();
