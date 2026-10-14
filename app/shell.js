/* Clavoris app shell — renders the top band for signed-in pages.
   Requires window.ClavorisAccess (session resolved).
   Investors see Data rooms, Marketplace, Portfolio and Contracts (Account is behind the avatar);
   staff also see Admin. Labels come from ClavorisI18n; the profile language wins once known. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function render(active) {
    var A = window.ClavorisAccess, I = window.ClavorisI18n; var nav = document.getElementById('nav'); if (!nav || !A) return;
    var p = A.profile && A.profile();
    if (I && p && p.lang && p.lang !== I.lang) I.set(p.lang);
    var t = I ? I.t : function (k) { return k; };
    var links = [
      { id: 'rooms', label: t('nav.rooms'), href: 'portal.html' },
      { id: 'market', label: t('nav.market'), href: 'marketplace.html' },
      { id: 'portfolio', label: t('nav.portfolio'), href: 'portfolio.html' },
      { id: 'contracts', label: t('nav.contracts'), href: 'contracts.html' }
    ];
    if (A.isAdmin()) links.push({ id: 'admin', label: t('nav.admin'), href: 'admin.html' });
    var status = A.status() || 'registered';
    var chip = status === 'verified' ? '<span class="chip verified"><span class="dot"></span>' + esc(t('nav.kyc_verified')) + '</span>'
      : '<a class="chip ' + esc(status) + '" href="kyc.html" title="' + esc(t('nav.kyc_title')) + '"><span class="dot"></span>' + esc(t('status.' + status)) + '</a>';
    nav.innerHTML = '<a class="nav-brand" href="portal.html"><img src="../assets/clavoris-mark.png" alt=""><span class="nav-wm">Clavori<span class="g">s</span></span></a>'
      + '<button class="nav-burger" id="navBurger" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>'
      + '<div class="nav-links" id="navLinks">' + links.map(function (l) { return '<a class="nav-lk' + (l.id === active ? ' active' : '') + '" href="' + l.href + '">' + esc(l.label) + '</a>'; }).join('') + '</div>'
      + '<div class="nav-right">' + chip + '<a class="nav-av' + (active === 'account' ? ' active' : '') + '" href="account.html" title="' + esc(A.displayName()) + ' — ' + esc(t('nav.account')) + '">' + esc(A.initials()) + '</a>'
      + '<button class="btn-text" id="signOut" type="button">' + esc(t('nav.signout')) + '</button></div>';
    var so = document.getElementById('signOut');
    if (so) so.addEventListener('click', function () { A.signOut().then(function () { location.href = 'login.html'; }); });
    var bg = document.getElementById('navBurger');
    if (bg) bg.addEventListener('click', function () { var open = nav.classList.toggle('open'); bg.setAttribute('aria-expanded', open ? 'true' : 'false'); });
    if (I) I.apply(document);
    unsubscribePrompt();
  }
  // After following the "unsubscribe / manage notifications" link in a mail: offer the settings once signed in.
  var UNSUB = {
    en: { t: 'E-mail notifications', b: 'You followed the unsubscribe link in a Clavoris e-mail. Choose which automated messages you receive under Account › E-mail notifications. Messages about your own actions (invitations, signatures, settlements) are always sent.', o: 'Open notification settings', l: 'Later' },
    nl: { t: 'E-mailmeldingen', b: 'U volgde de uitschrijflink in een Clavoris-e-mail. Kies onder Account › E-mailmeldingen welke automatische berichten u ontvangt. Berichten over uw eigen acties (uitnodigingen, handtekeningen, afwikkelingen) worden altijd verstuurd.', o: 'Meldingsinstellingen openen', l: 'Later' },
    fr: { t: 'Notifications par e-mail', b: 'Vous avez suivi le lien de désinscription d\'un e-mail Clavoris. Choisissez sous Compte › Notifications par e-mail les messages automatiques que vous recevez. Les messages relatifs à vos propres actions (invitations, signatures, règlements) sont toujours envoyés.', o: 'Ouvrir les paramètres de notification', l: 'Plus tard' }
  };
  function unsubscribePrompt() {
    var flag = null; try { flag = sessionStorage.getItem('clv_unsub'); } catch (e) {}
    if (flag !== '1' || document.getElementById('unsubScrim')) return;
    try { sessionStorage.removeItem('clv_unsub'); } catch (e) {}
    var I = window.ClavorisI18n, L = UNSUB[I && I.lang] || UNSUB.en;
    var el = document.createElement('div'); el.className = 'scrim'; el.id = 'unsubScrim';
    el.innerHTML = '<div class="modal" role="dialog" aria-labelledby="unsubTitle"><div class="modal-head"><div><div class="e">Clavoris</div><div class="t" id="unsubTitle">' + esc(L.t) + '</div></div><button type="button" id="unsubClose" aria-label="Close">×</button></div>'
      + '<div class="modal-body"><p style="font-size:13.5px;color:var(--fg-2);line-height:1.6">' + esc(L.b) + '</p>'
      + '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn btn-ghost" type="button" id="unsubLater" style="flex:1">' + esc(L.l) + '</button><a class="btn btn-primary" href="account.html#notif" style="flex:1.4">' + esc(L.o) + '</a></div></div></div>';
    document.body.appendChild(el);
    function close() { el.remove(); }
    el.querySelector('#unsubClose').addEventListener('click', close); el.querySelector('#unsubLater').addEventListener('click', close);
  }
  function fmtMoney(n, ccy) { try { return new Intl.NumberFormat((window.ClavorisI18n && window.ClavorisI18n.lang) === 'en' ? 'en-GB' : (window.ClavorisI18n ? window.ClavorisI18n.lang + '-BE' : 'en-GB'), { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 2 }).format(Number(n || 0)); } catch (e) { return (ccy || 'EUR') + ' ' + Number(n || 0).toFixed(2); } }
  function fmtDate(ts) { if (!ts) return '—'; try { var l = window.ClavorisI18n ? window.ClavorisI18n.lang : 'en'; return new Date(ts).toLocaleDateString(l === 'en' ? 'en-GB' : l + '-BE', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return String(ts).slice(0, 10); } }
  function fmtSize(n) { n = Number(n || 0); if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  // Download a file served by an edge function (binary response) and hand it to the browser.
  function downloadFn(name, body, fallbackName) {
    var A = window.ClavorisAccess, CFG = window.CLAVORIS_SUPABASE || {};
    return A.client().auth.getSession().then(function (r) {
      var token = r && r.data && r.data.session ? r.data.session.access_token : CFG.anonKey;
      return fetch(CFG.url + '/functions/v1/' + name, { method: 'POST', headers: { 'content-type': 'application/json', 'apikey': CFG.anonKey, 'authorization': 'Bearer ' + token }, body: JSON.stringify(body || {}) });
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (b) { return { ok: false, error: b.error || ('http-' + res.status) }; });
      var cd = res.headers.get('content-disposition') || ''; var m = cd.match(/filename="?([^";]+)"?/);
      return res.blob().then(function (blob) {
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (m && m[1]) || fallbackName || 'download';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return { ok: true };
      });
    });
  }
  // Access end date: "ends in 12 days" / "ends today" / "ended on …" plus a request-extension link.
  function accessLeft(expiresAt) {
    if (!expiresAt) return { state: 'none', days: null };
    var ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return { state: 'ended', days: 0 };
    var days = Math.ceil(ms / 86400000);
    return { state: ms <= 24 * 3600000 ? 'today' : days <= 7 ? 'soon' : 'ok', days: days, hours: Math.ceil(ms / 3600000) };
  }
  function accessText(expiresAt) {
    var I = window.ClavorisI18n, t = I ? I.t : function (k) { return k; };
    var x = accessLeft(expiresAt);
    if (x.state === 'none') return '';
    if (x.state === 'ended') return t('access.ended', { date: fmtDate(expiresAt) });
    if (x.state === 'today') return t('access.hours', { n: x.hours, date: fmtDate(expiresAt) });
    return t('access.days', { n: x.days, date: fmtDate(expiresAt) });
  }
  // Modal: pick a new end date and send the request to the company admins.
  function extensionDialog(roomId, roomName, currentExpiry, onDone) {
    var A = window.ClavorisAccess, I = window.ClavorisI18n, t = I.t;
    var old = document.getElementById('extScrim'); if (old) old.remove();
    var base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date();
    var def = new Date(base.getTime() + 30 * 86400000).toISOString().slice(0, 10), min = new Date().toISOString().slice(0, 10);
    var el = document.createElement('div'); el.className = 'scrim'; el.id = 'extScrim';
    el.innerHTML = '<div class="modal" role="dialog" aria-labelledby="extTitle"><div class="modal-head"><div><div class="e">' + esc(roomName) + '</div><div class="t" id="extTitle">' + esc(t('access.ext.title')) + '</div></div><button type="button" id="extClose" aria-label="Close">×</button></div>'
      + '<form class="modal-body" id="extForm" onsubmit="return false;"><p style="font-size:13.5px;color:var(--fg-2);line-height:1.6">' + esc(t('access.ext.body')) + '</p>'
      + '<div class="field"><label for="extUntil">' + esc(t('access.ext.until')) + '</label><input id="extUntil" type="date" class="mono" min="' + min + '" value="' + def + '"></div>'
      + '<div class="field"><label for="extMsg">' + esc(t('access.ext.msg')) + '</label><textarea id="extMsg" rows="3" maxlength="1000"></textarea></div>'
      + '<p class="msg" id="extMsgOut" role="status"></p><div style="display:flex;gap:10px;margin-top:16px"><button class="btn btn-ghost" type="button" id="extCancel" style="flex:1">' + esc(t('access.ext.cancel')) + '</button><button class="btn btn-primary" type="submit" id="extSend" style="flex:1.2">' + esc(t('access.ext.send')) + '</button></div></form></div>';
    document.body.appendChild(el);
    function close() { el.remove(); }
    el.querySelector('#extClose').addEventListener('click', close); el.querySelector('#extCancel').addEventListener('click', close);
    el.querySelector('#extForm').addEventListener('submit', function () {
      var m = el.querySelector('#extMsgOut'), b = el.querySelector('#extSend'); m.className = 'msg'; m.textContent = ''; b.disabled = true;
      A.callFn('clv-room', { room_id: roomId, action: 'extend_request', until: el.querySelector('#extUntil').value, message: el.querySelector('#extMsg').value.trim() }).then(function (r) {
        b.disabled = false;
        if (r.error) { m.className = 'msg err'; m.textContent = r.error === 'already-pending' ? t('access.ext.pending') : r.error === 'bad-date' ? t('access.ext.bad_date') : r.error; return; }
        m.className = 'msg ok'; m.textContent = t('access.ext.sent');
        setTimeout(function () { close(); if (onDone) onDone(); }, 1400);
      });
    });
  }
  window.ClavorisShell = { render: render, esc: esc, fmtDate: fmtDate, fmtSize: fmtSize, fmtMoney: fmtMoney, downloadFn: downloadFn, accessLeft: accessLeft, accessText: accessText, extensionDialog: extensionDialog };
})();
