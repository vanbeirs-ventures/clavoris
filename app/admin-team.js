/* Clavoris admin — company team and the company team in data rooms.
   1. Company accounts: a "Team" button per company opens the team window: the staff members of that company
      (last sign-in, activation status), the staff seats of the company's plan, and a form to invite a staff
      member. A new person receives an activation link; someone who already has an account signs in with their own
      password. Staff can be removed from the team (they keep their account as an ordinary user) and pending
      invitations re-sent. A company admin manages their own company's team; a Clavoris super admin any team.
   2. Data rooms: "Add me to this room" puts the signed-in staff member in the room's member list as part of the
      company team (no invitation mail, no end date, no NDA of their own); the button is not shown in rooms they are
      already a member of.
   3. Invitations: "No identity verification (KYC off)" in the invitation window: the person signs the room's NDA without
      an identity check (also for several people invited at once from the "Existing users" tab).
   Server: clv-admin-rooms (team, team_invite, team_remove, team_resend, add_self, invite kyc_waived). Loaded after
   admin.js (and after admin-docs.js / admin-invite.js, which also extend the invitation window). */
(function () {
  'use strict';
  var A = window.ClavorisAccess, S = window.ClavorisShell;
  function q(id) { return document.getElementById(id); }
  var esc = (S && S.esc) || function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); };
  function fmt(ts) { if (!ts) return '—'; var d = new Date(ts); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  if (!A || !q('compRows')) return;

  var css = document.createElement('style');
  css.textContent = ''
    + '.tm-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--border);font-size:13.5px}'
    + '.tm-row:first-child{border-top:0}'
    + '.tm-nm{font-weight:500;color:var(--clavis-navy)}'
    + '.tm-ml{font-family:var(--font-mono,monospace);font-size:11.5px;color:var(--fg-3);overflow-wrap:anywhere}'
    + '.tm-acts{display:flex;gap:12px;align-items:center;flex-wrap:wrap}'
    + '.tm-meter{display:inline-block;height:6px;width:140px;background:var(--parch-dark);border-radius:3px;overflow:hidden;vertical-align:middle;margin-left:8px}'
    + '.tm-meter i{display:block;height:100%;background:var(--seal-gold)}';
  document.head.appendChild(css);

  var ERR = {
    'email-invalid': 'Enter a valid e-mail address.',
    'already-in-team': 'This person is already in the team.',
    'staff-of-other-company': 'This person is staff of another company account. A person can be staff of one company only.',
    'is-clavoris-staff': 'This is a Clavoris administrator account; it already has access to every company.',
    'user-blocked': 'This account is suspended or rejected.',
    'self': 'You cannot remove yourself from the team.',
    'not-in-team': 'This person is no longer in the team.',
    'forbidden': 'You can only manage the team of your own company.'
  };
  function errText(r) {
    if (r && r.error === 'plan-limit') return 'All ' + r.limit + ' staff seats of the ' + r.plan + ' plan are used. Remove a staff member or change plan.';
    return ERR[r && r.error] || (r && r.error) || 'Something went wrong.';
  }

  /* ---------- team window ---------- */
  var wrap = document.createElement('div');
  wrap.className = 'scrim'; wrap.id = 'teamModal'; wrap.hidden = true;
  wrap.innerHTML = '<div class="modal modal-wide" role="dialog" aria-labelledby="tmTitle">'
    + '<div class="modal-head"><div><div class="e">Company account · team</div><div class="t" id="tmTitle"></div></div><button type="button" id="tmClose" aria-label="Close">×</button></div>'
    + '<div class="modal-body">'
    + '<p style="font-size:13px;color:var(--fg-2);line-height:1.6;margin:0">Staff members manage this company\'s data rooms, invitations, documents and contracts. They see only this company\'s data. <span id="tmSeats"></span></p>'
    + '<div class="card" style="padding:4px 16px;margin-top:14px"><div id="tmList"><div class="tm-row" style="color:var(--fg-3)">Loading…</div></div></div>'
    + '<p class="eyebrow" style="margin-top:20px">Invite a staff member</p>'
    + '<form id="tmForm" autocomplete="off" onsubmit="return false;">'
    + '<div class="g3" style="grid-template-columns:110px 1fr 1fr"><div class="field"><label for="tmSal">Title</label><select id="tmSal"><option value="">—</option><option value="mr">Mr</option><option value="mrs">Mrs</option></select></div>'
    + '<div class="field"><label for="tmFirst">First name</label><input id="tmFirst" type="text" autocomplete="off"></div>'
    + '<div class="field"><label for="tmLast">Last name</label><input id="tmLast" type="text" autocomplete="off"></div></div>'
    + '<div class="g3" style="grid-template-columns:2fr 1fr"><div class="field"><label for="tmEmail">E-mail address</label><input id="tmEmail" type="text" inputmode="email" autocomplete="off" spellcheck="false" placeholder="name@company.com"></div>'
    + '<div class="field"><label for="tmLang">Language</label><select id="tmLang"><option value="en">English</option><option value="nl">Nederlands</option><option value="fr">Français</option></select></div></div>'
    + '<span class="hint" style="display:block;margin-top:6px;font-size:11.5px;line-height:1.5;color:var(--fg-3)">The person receives an invitation from Clavoris naming your company, in the chosen language. Someone who already has an account signs in with their own password; a new person sets a password and verifies their identity.</span>'
    + '<p class="msg" id="tmMsg" role="status"></p>'
    + '<button class="btn btn-primary btn-block" type="submit" id="tmBtn">Invite to the team</button></form>'
    + '</div></div>';
  document.body.appendChild(wrap);
  var cur = null; // { id, name }
  q('tmClose').addEventListener('click', function () { wrap.hidden = true; });
  function msg(t, kind) { var m = q('tmMsg'); m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = t || ''; }

  function seatsText(s) {
    if (!s) return '';
    if (s.limit == null) return '<b>' + s.used + ' staff member(s)</b> (' + esc(s.plan) + ' plan, unlimited seats).';
    var pct = Math.min(100, Math.round(100 * s.used / Math.max(1, s.limit)));
    return '<b>' + s.used + ' of ' + s.limit + ' staff seats used</b> (' + esc(s.plan) + ' plan)<span class="tm-meter"><i style="width:' + pct + '%"></i></span>';
  }
  function loadTeam() {
    q('tmList').innerHTML = '<div class="tm-row" style="color:var(--fg-3)">Loading…</div>';
    return A.callFn('clv-admin-rooms', { action: 'team', company_id: cur.id }).then(function (r) {
      if (!r || r.error) { q('tmList').innerHTML = '<div class="tm-row" style="color:var(--fg-3)">' + esc(errText(r)) + '</div>'; return; }
      q('tmSeats').innerHTML = seatsText(r.seats);
      var t = r.team || [];
      q('tmList').innerHTML = t.length ? t.map(function (p) {
        var state = p.role === 'super' ? '<span class="chip info">Clavoris</span>' : p.activated ? '<span class="chip verified">admin</span>' : '<span class="chip pending">not yet activated</span>';
        var acts = p.role === 'super' || p.self ? '' : (p.activated ? '' : '<button class="btn-text" type="button" data-resend="' + esc(p.id) + '">Resend</button>') + '<button class="btn-text" type="button" data-remove="' + esc(p.id) + '">' + (p.activated ? 'Remove from team' : 'Remove') + '</button>';
        return '<div class="tm-row"><div><div class="tm-nm">' + esc(p.name || p.email) + (p.self ? ' <span class="chip info" style="font-size:10.5px;padding:1px 8px">you</span>' : '') + (p.job_title ? ' <span style="font-weight:400;color:var(--fg-2);font-size:12.5px">· ' + esc(p.job_title) + '</span>' : '') + '</div>'
          + '<div class="tm-ml">' + esc(p.email) + ' · ' + (p.last_login_at ? 'last sign-in ' + esc(fmt(p.last_login_at)) : 'invited ' + esc(fmt(p.created_at))) + '</div></div>'
          + '<div class="tm-acts">' + state + acts + '</div></div>';
      }).join('') : '<div class="tm-row" style="color:var(--fg-3)">No staff members yet.</div>';
      [].forEach.call(q('tmList').querySelectorAll('[data-remove]'), function (b) {
        b.addEventListener('click', function () {
          if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Click again to remove'; return; }
          b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'team_remove', company_id: cur.id, user_id: b.getAttribute('data-remove') }).then(function (x) {
            if (x.error) { msg(errText(x), 'err'); b.disabled = false; return; }
            msg('Removed from the team. The person keeps their account as an ordinary user.', 'ok'); loadTeam(); if (window.ClavorisAdminRefresh) window.ClavorisAdminRefresh();
          });
        });
      });
      [].forEach.call(q('tmList').querySelectorAll('[data-resend]'), function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'team_resend', company_id: cur.id, user_id: b.getAttribute('data-resend') }).then(function (x) {
            b.disabled = false;
            if (x.error) { msg(errText(x), 'err'); return; }
            msg(x.mailed ? 'Invitation sent again.' : 'The e-mail could not be sent.', x.mailed ? 'ok' : 'err');
          });
        });
      });
    });
  }
  q('tmForm').addEventListener('submit', function () {
    var email = q('tmEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg(ERR['email-invalid'], 'err'); return; }
    q('tmBtn').disabled = true; msg('Inviting…');
    A.callFn('clv-admin-rooms', { action: 'team_invite', company_id: cur.id, email: email, lang: q('tmLang').value, salutation: q('tmSal').value || undefined, first_name: q('tmFirst').value.trim() || undefined, last_name: q('tmLast').value.trim() || undefined }).then(function (r) {
      q('tmBtn').disabled = false;
      if (r.error) { msg(errText(r), 'err'); return; }
      msg((r.activation ? 'Invited: an activation link has been e-mailed.' : 'Added: the person signs in with their own password.') + (r.mailed ? '' : ' The e-mail could not be sent.'), r.mailed ? 'ok' : 'err');
      q('tmForm').reset(); loadTeam(); if (window.ClavorisAdminRefresh) window.ClavorisAdminRefresh();
    });
  });
  function openTeam(c) { cur = c; q('tmTitle').textContent = c.name; q('tmForm').reset(); msg(''); q('tmSeats').innerHTML = ''; wrap.hidden = false; loadTeam(); }

  // "Team" button on every company row. The rows follow the order of the "companies" call (by name).
  var companies = null, busy = false;
  function addTeamButtons() {
    var rows = q('compRows').querySelectorAll('tbody tr');
    if (!rows.length || busy) return;
    if (rows[0].querySelector('[data-team]')) return;
    var go = function () {
      [].forEach.call(rows, function (tr, i) {
        var c = companies[i]; if (!c || tr.querySelector('[data-team]')) return;
        var td = tr.lastElementChild; if (!td) return;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Team'; b.setAttribute('data-team', c.id); b.style.marginLeft = '10px';
        b.addEventListener('click', function () { openTeam({ id: c.id, name: c.name }); });
        td.appendChild(b);
      });
    };
    if (companies && companies.length === rows.length) { go(); return; }
    busy = true;
    A.callFn('clv-admin-rooms', { action: 'companies' }).then(function (r) { busy = false; companies = (r && r.companies) || []; go(); });
  }
  new MutationObserver(function () { companies = null; addTeamButtons(); }).observe(q('compRows'), { childList: true });

  /* ---------- "Add me to this room" on every data-room card ---------- */
  // Shown only once the room's member list has loaded and the signed-in person is not an active member of it (a revoked
  // member sees it again: joining reactivates them).
  function addMeButtons() {
    var me = A.user && A.user() ? A.user().id : '';
    [].forEach.call(document.querySelectorAll('#rooms > [data-room]'), function (card) {
      var inv = card.querySelector('[data-invite]');
      if (!inv) return;
      var tb = q('mem-' + card.getAttribute('data-room')), first = tb && tb.querySelector('td');
      var loaded = !!tb && !(first && /Loading/.test(first.textContent));
      var member = loaded && !!me && !!tb.querySelector('[data-revoke="' + me + '"]');
      var old = card.querySelector('[data-addme]');
      if (!loaded || member) { if (old && !old.getAttribute('data-busy')) old.remove(); return; }
      if (old) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Add me to this room'; b.setAttribute('data-addme', card.getAttribute('data-room'));
      b.title = 'Join this room\'s member list as part of the company team (no invitation mail, no end date, no NDA)';
      b.addEventListener('click', function () {
        b.disabled = true; b.setAttribute('data-busy', '1');
        A.callFn('clv-admin-rooms', { action: 'add_self', room_id: b.getAttribute('data-addme') }).then(function (x) {
          b.disabled = false; b.removeAttribute('data-busy');
          if (x.error) { var e = q('roomsErr'); if (e) e.textContent = x.error; return; }
          b.textContent = 'Added'; b.disabled = true; setTimeout(function () { if (window.ClavorisAdminRefresh) window.ClavorisAdminRefresh(); }, 600);
        });
      });
      inv.parentNode.insertBefore(b, inv);
    });
  }
  var rooms = q('rooms');
  if (rooms) new MutationObserver(addMeButtons).observe(rooms, { childList: true, subtree: true });

  /* ---------- invitation without identity verification ("KYC off") ---------- */
  var until = q('iUntil'), untilField = until && until.closest('.field');
  if (untilField) {
    var kyc = document.createElement('div');
    kyc.className = 'field'; kyc.style.marginTop = '14px';
    kyc.innerHTML = '<label class="check" style="display:flex;gap:8px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:13px;color:var(--fg-1)"><input type="checkbox" id="iNoKyc" style="margin:3px 0 0;flex:none;width:16px;height:16px;padding:0;min-height:0"><span>No identity verification for this invitation (KYC off)</span></label>'
      + '<span class="hint" style="display:block;margin-top:4px;font-size:11.5px;line-height:1.5;color:var(--fg-3)">The person signs the room\'s NDA without an identity check; the signed copy states that no identity verification was carried out. People already verified are not affected. It can be switched on again in the member list until the NDA is signed.</span>';
    untilField.parentNode.insertBefore(kyc, untilField.nextSibling);
    var call = A.callFn;
    A.callFn = function (fn, body) {
      if (fn === 'clv-admin-rooms' && body && body.action === 'invite' && q('iNoKyc') && q('iNoKyc').checked) body.kyc_waived = true;
      return call.apply(this, arguments);
    };
  }
})();
