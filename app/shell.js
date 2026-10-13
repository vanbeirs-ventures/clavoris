/* Clavoris app shell — renders the top band for signed-in pages.
   Requires window.ClavorisAccess (session resolved). */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function render(active) {
    var A = window.ClavorisAccess; var nav = document.getElementById('nav'); if (!nav || !A) return;
    var links = [
      { id: 'portal', label: 'Portfolio', href: 'portal.html' },
      { id: 'rooms', label: 'Data rooms', href: 'portal.html#rooms' },
      { id: 'account', label: 'Account', href: 'account.html' }
    ];
    if (A.isAdmin()) links.push({ id: 'admin', label: 'Admin', href: 'admin.html' });
    var status = A.status() || '';
    var chip = status === 'verified' ? '<span class="chip verified"><span class="dot"></span>KYC verified</span>'
      : '<span class="chip ' + esc(status) + '"><span class="dot"></span>' + esc(status.replace('_', ' ') || 'registered') + '</span>';
    nav.innerHTML = '<a class="nav-brand" href="portal.html"><img src="../assets/clavoris-mark.png" alt=""><span class="nav-wm">Clavori<span class="g">s</span></span></a>'
      + '<div class="nav-links">' + links.map(function (l) { return '<a class="nav-lk' + (l.id === active ? ' active' : '') + '" href="' + l.href + '">' + esc(l.label) + '</a>'; }).join('') + '</div>'
      + '<div class="nav-right">' + chip + '<a class="nav-av" href="account.html" title="' + esc(A.displayName()) + '">' + esc(A.initials()) + '</a>'
      + '<button class="btn-text" id="signOut" type="button">Sign out</button></div>';
    var so = document.getElementById('signOut');
    if (so) so.addEventListener('click', function () { A.signOut().then(function () { location.href = 'login.html'; }); });
  }
  window.ClavorisShell = { render: render, esc: esc };
})();
