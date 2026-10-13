/* Clavoris app shell — renders the top band for signed-in pages.
   Requires window.ClavorisAccess (session resolved).
   Investors see Data rooms + Account only; staff also see Admin. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function render(active) {
    var A = window.ClavorisAccess; var nav = document.getElementById('nav'); if (!nav || !A) return;
    var links = [
      { id: 'rooms', label: 'Data rooms', href: 'portal.html' },
      { id: 'account', label: 'Account', href: 'account.html' }
    ];
    if (A.isAdmin()) links.push({ id: 'admin', label: 'Admin', href: 'admin.html' });
    var status = A.status() || '';
    var chip = status === 'verified' ? '<span class="chip verified"><span class="dot"></span>KYC verified</span>'
      : '<a class="chip ' + esc(status) + '" href="kyc.html" title="Complete identity verification"><span class="dot"></span>' + esc(status.replace('_', ' ') || 'registered') + '</a>';
    nav.innerHTML = '<a class="nav-brand" href="portal.html"><img src="../assets/clavoris-mark.png" alt=""><span class="nav-wm">Clavori<span class="g">s</span></span></a>'
      + '<div class="nav-links">' + links.map(function (l) { return '<a class="nav-lk' + (l.id === active ? ' active' : '') + '" href="' + l.href + '">' + esc(l.label) + '</a>'; }).join('') + '</div>'
      + '<div class="nav-right">' + chip + '<a class="nav-av" href="account.html" title="' + esc(A.displayName()) + '">' + esc(A.initials()) + '</a>'
      + '<button class="btn-text" id="signOut" type="button">Sign out</button></div>';
    var so = document.getElementById('signOut');
    if (so) so.addEventListener('click', function () { A.signOut().then(function () { location.href = 'login.html'; }); });
  }
  function fmtDate(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return String(ts).slice(0, 10); } }
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
  window.ClavorisShell = { render: render, esc: esc, fmtDate: fmtDate, fmtSize: fmtSize, downloadFn: downloadFn };
})();
