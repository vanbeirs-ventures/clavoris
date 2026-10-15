/* Clavoris app shell — renders the top band for signed-in pages.
   Requires window.ClavorisAccess (session resolved).
   Investors see Data rooms, Marketplace, Portfolio and Contracts (Account is behind the avatar);
   staff also see Admin. Labels come from ClavorisI18n; the profile language wins once known. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  // Top-band menu. Desktop: tabs in the middle, KYC chip / avatar / sign out on the right.
  // Phones (<= 860 px): a hamburger button opens one panel with the tabs, then the account block
  // (avatar + name -> account page, KYC status, sign out).
  function menu(links, active, chip, name, initials, t, placeholder) {
    return '<button class="nav-burger" id="navBurger" type="button" aria-label="Menu" aria-controls="navMenu" aria-expanded="false"><span></span><span></span><span></span></button>'
      + '<div class="nav-menu" id="navMenu">'
      + '<div class="nav-links" id="navLinks">' + links.map(function (l) { return '<a class="nav-lk' + (l.id === active ? ' active' : '') + '" href="' + l.href + '">' + esc(l.label) + '</a>'; }).join('') + '</div>'
      + '<div class="nav-right">' + chip
      + '<a class="nav-acct' + (active === 'account' ? ' active' : '') + '" href="account.html" title="' + esc(name) + ' — ' + esc(t('nav.account')) + '"><span class="nav-av">' + esc(initials) + '</span><span class="nav-name"><b>' + esc(name) + '</b><small>' + esc(t('nav.account')) + '</small></span></a>'
      + '<button class="btn-text nav-out"' + (placeholder ? ' disabled' : ' id="signOut"') + ' type="button">' + esc(t('nav.signout')) + '</button></div>'
      + '</div>';
  }
  // One handler for the hamburger (works for the instant band and the real one): toggle, close on
  // a tap outside the band, on Escape and when a menu link is followed.
  function setOpen(nav, open) { nav.classList.toggle('open', open); var b = document.getElementById('navBurger'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  document.addEventListener('click', function (ev) {
    var nav = document.getElementById('nav'); if (!nav) return;
    if (ev.target.closest && ev.target.closest('#navBurger')) { setOpen(nav, !nav.classList.contains('open')); return; }
    if (!nav.classList.contains('open')) return;
    if (!nav.contains(ev.target) || (ev.target.closest && ev.target.closest('#navMenu a'))) setOpen(nav, false);
  });
  document.addEventListener('keydown', function (ev) { var nav = document.getElementById('nav'); if (ev.key === 'Escape' && nav && nav.classList.contains('open')) setOpen(nav, false); });
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
      + menu(links, active, chip, A.displayName(), A.initials(), t, false);
    try { sessionStorage.setItem('clv_nav', JSON.stringify({ role: p && p.role, status: status, name: A.displayName(), initials: A.initials(), lang: I && I.lang })); } catch (e) {}
    // The current page's own item does not reload the page.
    [].forEach.call(nav.querySelectorAll('.nav-lk.active'), function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); }); });
    var so = document.getElementById('signOut');
    if (so) so.addEventListener('click', function () { try { sessionStorage.removeItem('clv_nav'); } catch (e) {} A.signOut().then(function () { location.href = 'login.html'; }); });

    if (I) I.apply(document);
    unsubscribePrompt(); idleGuard();
  }
  // Instant top band from the last known session (cached per tab), replaced by the real one as soon as
  // the session is resolved — avoids the empty band / flicker on every page change.
  function prerender() {
    var nav = document.getElementById('nav'), I = window.ClavorisI18n; if (!nav || nav.children.length) return;
    var c = null; try { c = JSON.parse(sessionStorage.getItem('clv_nav') || 'null'); } catch (e) {}
    if (!c || !c.role) return;
    if (I && c.lang && c.lang !== I.lang) I.set(c.lang);
    var t = I ? I.t : function (k) { return k; };
    var page = location.pathname.split('/').pop();
    var active = { 'portal.html': 'rooms', 'room.html': 'rooms', 'marketplace.html': 'market', 'product.html': 'market', 'portfolio.html': 'portfolio', 'contracts.html': 'contracts', 'contract.html': 'contracts', 'admin.html': 'admin', 'account.html': 'account', 'kyc.html': 'account' }[page] || '';
    var links = [
      { id: 'rooms', label: t('nav.rooms'), href: 'portal.html' },
      { id: 'market', label: t('nav.market'), href: 'marketplace.html' },
      { id: 'portfolio', label: t('nav.portfolio'), href: 'portfolio.html' },
      { id: 'contracts', label: t('nav.contracts'), href: 'contracts.html' }
    ];
    if (c.role === 'admin' || c.role === 'super') links.push({ id: 'admin', label: t('nav.admin'), href: 'admin.html' });
    var st = c.status || 'registered';
    var chip = st === 'verified' ? '<span class="chip verified"><span class="dot"></span>' + esc(t('nav.kyc_verified')) + '</span>' : '<a class="chip ' + esc(st) + '" href="kyc.html"><span class="dot"></span>' + esc(t('status.' + st)) + '</a>';
    nav.innerHTML = '<a class="nav-brand" href="portal.html"><img src="../assets/clavoris-mark.png" alt=""><span class="nav-wm">Clavori<span class="g">s</span></span></a>'
      + menu(links, active, chip, c.name || '', c.initials || 'C', t, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prerender); else prerender();
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
  /* ---- inactivity sign-out (compliance): 10 min without activity -> 60 s countdown dialog -> sign out ---- */
  var IDLE_MS = 10 * 60 * 1000, WARN_MS = 60 * 1000, _lastAct = Date.now(), _warnEl = null, _idleOn = false;
  function idleGuard() {
    if (_idleOn) return; _idleOn = true;
    var mark = function () { if (!_warnEl) _lastAct = Date.now(); };
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'pointerdown'].forEach(function (ev) { window.addEventListener(ev, mark, { passive: true }); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    setInterval(tick, 1000);
  }
  function tick() {
    var A = window.ClavorisAccess, I = window.ClavorisI18n;
    if (!A || !A.isSignedIn()) return;
    var idle = Date.now() - _lastAct, left = Math.ceil((IDLE_MS - idle) / 1000);
    if (idle < IDLE_MS - WARN_MS) { if (_warnEl) { _warnEl.remove(); _warnEl = null; } return; }
    if (left <= 0) { idleSignOut(); return; }
    if (!_warnEl) {
      _warnEl = document.createElement('div'); _warnEl.className = 'scrim'; _warnEl.id = 'idleScrim';
      _warnEl.innerHTML = '<div class="modal" role="alertdialog" aria-labelledby="idleTitle"><div class="modal-head"><div><div class="e">Clavoris</div><div class="t" id="idleTitle">' + esc(I.t('idle.title')) + '</div></div></div>'
        + '<div class="modal-body"><p style="font-size:14px;line-height:1.6" id="idleBody"></p><p class="mono" style="font-size:34px;color:var(--clavis-navy);margin-top:12px;text-align:center" id="idleCount"></p>'
        + '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn btn-ghost" type="button" id="idleOut" style="flex:1">' + esc(I.t('idle.out')) + '</button><button class="btn btn-primary" type="button" id="idleStay" style="flex:1.4">' + esc(I.t('idle.stay')) + '</button></div></div></div>';
      document.body.appendChild(_warnEl);
      _warnEl.querySelector('#idleStay').addEventListener('click', function () { _lastAct = Date.now(); _warnEl.remove(); _warnEl = null; });
      _warnEl.querySelector('#idleOut').addEventListener('click', idleSignOut);
      try { _warnEl.querySelector('#idleStay').focus(); } catch (e) {}
    }
    _warnEl.querySelector('#idleBody').textContent = I.t('idle.body', { s: left });
    _warnEl.querySelector('#idleCount').textContent = left;
  }
  function idleSignOut() {
    var A = window.ClavorisAccess, next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    if (_warnEl) { _warnEl.remove(); _warnEl = null; }
    _lastAct = Date.now() + 86400000; // no second dialog while signing out
    A.signOut().then(function () { location.replace('login.html?next=' + next + '&idle=1'); });
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
