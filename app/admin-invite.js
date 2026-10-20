/* Clavoris admin — inviting people who are already on the platform.
   Two additions to the "Invite to data room" window (Admin › Data rooms):
   1. The e-mail field suggests existing users while typing a name, organisation or e-mail address. Choosing
      one fills in their address, title, name and language from their own profile (locked, so what they
      entered stays) and says whether they sign in with their own password or still need to activate.
   2. A second tab, "Existing users", lists the people that can be invited, with a search, a filter on the
      members of another data room, and tick boxes to invite several at once with one access end date.
   Who is listed (clv-admin-rooms "directory"): a Clavoris super admin sees every active account; a company
   admin only people who are or were members of its own company's rooms. Suspended and rejected accounts are
   never listed; people already in the room are shown greyed out.
   Loaded after admin.js and admin-docs.js. */
(function () {
  'use strict';
  var A = window.ClavorisAccess, S = window.ClavorisShell;
  function q(id) { return document.getElementById(id); }
  var esc = (S && S.esc) || function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); };
  var modal = q('invModal'), form = q('invForm'), email = q('iEmail');
  if (!A || !modal || !form || !email) return;

  var css = document.createElement('style');
  css.textContent = ''
    + '.iv-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:-4px 0 16px}'
    + '.iv-tabs button{font:inherit;font-size:13px;font-weight:500;color:var(--fg-2);background:none;border:0;border-bottom:2px solid transparent;padding:8px 12px;margin-bottom:-1px;cursor:pointer}'
    + '.iv-tabs button[aria-selected="true"]{color:var(--clavis-navy);border-bottom-color:var(--seal-gold)}'
    + '.iv-tabs button:focus-visible{outline:2px solid var(--seal-gold);outline-offset:-2px}'
    + '.iv-wrap{position:relative}'
    + '.iv-drop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:30;background:var(--bg-raised,#fff);border:1px solid var(--border);border-radius:var(--r-md,6px);box-shadow:0 8px 24px rgba(20,28,40,.14);max-height:300px;overflow:auto}'
    + '.iv-opt{padding:9px 12px;cursor:pointer;border-top:1px solid var(--border);font-size:13px;line-height:1.4}'
    + '.iv-opt:first-child{border-top:0}'
    + '.iv-opt[aria-selected="true"]{background:var(--parch-100)}'
    + '.iv-opt[aria-disabled="true"]{cursor:default;opacity:.55}'
    + '.iv-nm{font-weight:500;color:var(--clavis-navy)}'
    + '.iv-sub{color:var(--fg-2);font-size:12px}'
    + '.iv-mail{font-family:var(--font-mono,monospace);font-size:11.5px;color:var(--fg-3);overflow-wrap:anywhere}'
    + '.iv-chips{display:inline-flex;gap:4px;flex-wrap:wrap;margin-left:4px;vertical-align:1px}'
    + '.iv-chips .chip{font-size:10.5px;padding:1px 8px}'
    + '.iv-info{display:block;margin-top:8px;padding:8px 10px;border-left:3px solid var(--seal-gold);background:var(--parch-100);font-size:12.5px;line-height:1.5;color:var(--fg-1)}'
    + '.iv-info button{font:inherit;font-size:12px;background:none;border:0;padding:0;margin-left:6px;color:var(--fg-2);text-decoration:underline;cursor:pointer}'
    + '.iv-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}'
    + '@media (max-width:520px){.iv-row2{grid-template-columns:1fr}}'
    + '.iv-list{margin-top:10px;border:1px solid var(--border);border-radius:var(--r-md,6px);max-height:320px;overflow:auto;background:var(--bg-raised,#fff)}'
    + '.iv-item{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-top:1px solid var(--border);cursor:pointer;text-transform:none;letter-spacing:0;font-weight:400;margin:0}'
    + '.iv-item:first-child{border-top:0}'
    + '.iv-item input{margin-top:3px;width:16px;height:16px;flex:none}'
    + '.iv-item.off{cursor:default;opacity:.55}'
    + '.iv-item .iv-body{min-width:0;flex:1}'
    + '.iv-empty{padding:14px 12px;color:var(--fg-3);font-size:13px}'
    + '#invForm input[readonly],#invForm select:disabled{background:var(--parch-100);color:var(--fg-2);cursor:default}';
  document.head.appendChild(css);

  var roomId = '';
  // The room being invited to: taken from the "Invite by email" button that opened the window.
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest && e.target.closest('[data-invite]'); if (b) roomId = b.getAttribute('data-invite'); }, true);

  function directory(params) { return A.callFn('clv-admin-rooms', Object.assign({ action: 'directory', room_id: roomId }, params)); }
  function chips(u) {
    var c = [];
    if (u.member) c.push('<span class="chip neutral">already a member</span>');
    if (u.staff) c.push('<span class="chip info">staff</span>');
    c.push(u.verified ? '<span class="chip verified">KYC ✓</span>' : u.activated ? '<span class="chip pending">KYC to do</span>' : '<span class="chip pending">not yet activated</span>');
    return '<span class="iv-chips">' + c.join('') + '</span>';
  }
  function who(u) { return u.name || u.email; }
  function sub(u) { return [u.company, u.job_title].filter(Boolean).join(' · '); }
  function lastIn(u) { if (!u.last_login_at) return ''; var d = new Date(u.last_login_at); return isNaN(d) ? '' : ' · last sign-in ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

  /* ---------- tabs ---------- */
  var fEmail = email.closest('.field'), fLang = q('iLang') && q('iLang').closest('.field'), fUntil = q('iUntil') && q('iUntil').closest('.field');
  var fNames = q('iSal') ? q('iSal').closest('.g3') : null; if (fNames && fNames.parentNode !== form) fNames = fNames.parentNode;
  var tabs = document.createElement('div');
  tabs.className = 'iv-tabs'; tabs.setAttribute('role', 'tablist');
  tabs.innerHTML = '<button type="button" role="tab" id="ivTabNew" aria-selected="true">New person</button><button type="button" role="tab" id="ivTabOld" aria-selected="false">Existing users</button>';
  form.insertBefore(tabs, form.firstChild);
  var panel = document.createElement('div');
  panel.id = 'ivExisting'; panel.hidden = true;
  panel.innerHTML = '<div class="iv-row2">'
    + '<div class="field" style="margin-top:0"><label for="ivSearch">Search</label><input id="ivSearch" type="search" autocomplete="off" placeholder="Name, organisation or e-mail"></div>'
    + '<div class="field" style="margin-top:0"><label for="ivFrom">Show</label><select id="ivFrom"><option value="">All users</option></select></div></div>'
    + '<div class="iv-list" id="ivList" role="group" aria-label="Users to invite"></div>'
    + '<p class="hint" id="ivCount" style="font-size:11.5px;color:var(--fg-3);margin-top:6px"></p>';
  form.insertBefore(panel, fUntil || q('iMsg'));
  var bulkBtn = document.createElement('button');
  bulkBtn.type = 'button'; bulkBtn.className = 'btn btn-primary btn-block'; bulkBtn.id = 'ivBtn'; bulkBtn.hidden = true; bulkBtn.disabled = true; bulkBtn.textContent = 'Invite selected users';
  q('iBtn').parentNode.insertBefore(bulkBtn, q('iBtn').nextSibling);

  var mode = 'new';
  function setTab(m) {
    mode = m;
    q('ivTabNew').setAttribute('aria-selected', String(m === 'new')); q('ivTabOld').setAttribute('aria-selected', String(m === 'old'));
    [fEmail, fNames, fLang].forEach(function (el) { if (el) el.hidden = m === 'old'; });
    panel.hidden = m !== 'old'; q('iBtn').hidden = m === 'old'; bulkBtn.hidden = m !== 'old';
    q('iMsg').className = 'msg'; q('iMsg').textContent = '';
    closeDrop();
    if (m === 'old') { loadList(); setTimeout(function () { q('ivSearch').focus(); }, 30); }
  }
  q('ivTabNew').addEventListener('click', function () { setTab('new'); });
  q('ivTabOld').addEventListener('click', function () { setTab('old'); });

  /* ---------- 1. suggestions in the e-mail field ---------- */
  email.type = 'text'; email.setAttribute('inputmode', 'email'); email.setAttribute('autocomplete', 'off'); email.setAttribute('spellcheck', 'false');
  email.placeholder = 'name@company.com, or type a name';
  email.setAttribute('role', 'combobox'); email.setAttribute('aria-autocomplete', 'list'); email.setAttribute('aria-expanded', 'false'); email.setAttribute('aria-controls', 'ivDrop');
  var hint = fEmail.querySelector('.hint');
  if (hint) hint.textContent = 'Type a name, organisation or e-mail address: people already on the platform are suggested. New users receive an activation link; existing users sign in with their usual password.';
  var wrap = document.createElement('div'); wrap.className = 'iv-wrap';
  email.parentNode.insertBefore(wrap, email); wrap.appendChild(email);
  var drop = document.createElement('div'); drop.className = 'iv-drop'; drop.id = 'ivDrop'; drop.setAttribute('role', 'listbox'); drop.hidden = true;
  wrap.appendChild(drop);
  var info = document.createElement('span'); info.className = 'iv-info'; info.hidden = true;
  wrap.parentNode.insertBefore(info, wrap.nextSibling);

  var sugg = [], active = -1, timer = null, seq = 0, chosen = null;
  function closeDrop() { drop.hidden = true; email.setAttribute('aria-expanded', 'false'); active = -1; }
  function paintDrop() {
    if (!sugg.length) { closeDrop(); return; }
    drop.innerHTML = sugg.map(function (u, i) {
      return '<div class="iv-opt" role="option" id="ivOpt' + i + '" data-i="' + i + '" aria-selected="' + (i === active) + '"' + (u.member ? ' aria-disabled="true"' : '') + '>'
        + '<span class="iv-nm">' + esc(who(u)) + '</span>' + chips(u)
        + (sub(u) ? '<div class="iv-sub">' + esc(sub(u)) + '</div>' : '') + '<div class="iv-mail">' + esc(u.email) + '</div></div>';
    }).join('');
    drop.hidden = false; email.setAttribute('aria-expanded', 'true');
    if (active >= 0) { email.setAttribute('aria-activedescendant', 'ivOpt' + active); var a = q('ivOpt' + active); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); } else email.removeAttribute('aria-activedescendant');
  }
  drop.addEventListener('mousedown', function (e) {
    var o = e.target.closest('.iv-opt'); if (!o) return;
    e.preventDefault(); var u = sugg[Number(o.getAttribute('data-i'))]; if (u && !u.member) choose(u);
  });
  function search() {
    var t = email.value.trim(); var my = ++seq;
    if (t.length < 2 || !roomId) { sugg = []; closeDrop(); return; }
    directory({ q: t }).then(function (r) {
      if (my !== seq || mode !== 'new' || chosen) return;
      sugg = (r && r.users) || []; active = -1; paintDrop();
    });
  }
  function lock(on, u) {
    var sal = q('iSal'), first = q('iFirst'), last = q('iLast'), lang = q('iLang');
    if (on) {
      if (sal) { sal.value = u.salutation || ''; sal.disabled = !!u.salutation; }
      if (first) { first.value = u.first_name || ''; first.readOnly = !!u.first_name; }
      if (last) { last.value = u.last_name || ''; last.readOnly = !!u.last_name; }
      if (lang) { lang.value = u.lang || 'en'; lang.disabled = true; }
    } else {
      if (sal) sal.disabled = false; if (first) first.readOnly = false; if (last) last.readOnly = false; if (lang) lang.disabled = false;
    }
  }
  function choose(u) {
    chosen = u; email.value = u.email; closeDrop(); lock(true, u);
    info.innerHTML = '<b>' + esc(who(u)) + '</b>' + (sub(u) ? ' · ' + esc(sub(u)) : '') + '<br>'
      + esc(u.activated ? 'Existing user: signs in with their own password, nothing to register.' + (u.verified ? ' Identity already verified.' : ' Identity verification still to do.') : 'Registered but never signed in: receives a new activation link.')
      + ' Name and language come from their profile.<button type="button" id="ivClear">Choose someone else</button>';
    info.hidden = false;
    q('ivClear').addEventListener('click', function () { clearChoice(); email.value = ''; email.focus(); });
    var until = q('iUntil'); if (until) until.focus();
  }
  function clearChoice() { if (!chosen) return; chosen = null; lock(false); info.hidden = true; info.innerHTML = ''; }
  email.addEventListener('input', function () {
    if (chosen && email.value.trim().toLowerCase() !== chosen.email) clearChoice();
    clearTimeout(timer); timer = setTimeout(search, 250);
  });
  email.addEventListener('keydown', function (e) {
    if (drop.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(sugg.length - 1, active + 1); paintDrop(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paintDrop(); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); e.stopPropagation(); var u = sugg[active]; if (u && !u.member) choose(u); }
    else if (e.key === 'Escape') { e.preventDefault(); closeDrop(); }
  });
  email.addEventListener('blur', function () { setTimeout(closeDrop, 150); });

  /* ---------- 2. "Existing users" tab: search, room filter, several at once ---------- */
  var picked = {}, listSeq = 0, listTimer = null, roomsLoaded = '';
  function countPicked() { return Object.keys(picked).length; }
  function paintCount() {
    var n = countPicked();
    q('ivCount').textContent = n ? n + ' selected. Each person receives the invitation in their own language; existing users sign in with their own password.' : 'Tick the people to invite.';
    bulkBtn.disabled = !n; bulkBtn.textContent = n ? 'Invite ' + n + (n === 1 ? ' person' : ' people') : 'Invite selected users';
  }
  function loadList() {
    var my = ++listSeq, list = q('ivList');
    list.innerHTML = '<div class="iv-empty">Loading…</div>';
    directory({ q: q('ivSearch').value.trim(), from_room: q('ivFrom').value || undefined }).then(function (r) {
      if (my !== listSeq) return;
      if (!r || r.error) { list.innerHTML = '<div class="iv-empty">' + esc((r && r.error) || 'Could not load the users.') + '</div>'; return; }
      if (roomsLoaded !== roomId) {
        roomsLoaded = roomId;
        var keep = q('ivFrom').value;
        q('ivFrom').innerHTML = '<option value="">All users</option>' + (r.rooms || []).map(function (x) { return '<option value="' + esc(x.id) + '">Members of ' + esc(x.name) + '</option>'; }).join('');
        q('ivFrom').value = keep && (r.rooms || []).some(function (x) { return x.id === keep; }) ? keep : '';
      }
      var users = r.users || [];
      list.innerHTML = users.length ? users.map(function (u) {
        return '<label class="iv-item' + (u.member ? ' off' : '') + '"><input type="checkbox" value="' + esc(u.id) + '"' + (u.member ? ' disabled' : picked[u.id] ? ' checked' : '') + '>'
          + '<span class="iv-body"><span class="iv-nm">' + esc(who(u)) + '</span>' + chips(u)
          + (sub(u) ? '<span class="iv-sub" style="display:block">' + esc(sub(u)) + '</span>' : '')
          + '<span class="iv-mail" style="display:block">' + esc(u.email + lastIn(u)) + '</span></span></label>';
      }).join('') : '<div class="iv-empty">No users found.</div>';
      [].forEach.call(list.querySelectorAll('input[type=checkbox]'), function (cb) {
        cb.addEventListener('change', function () { var u = users.filter(function (x) { return x.id === cb.value; })[0]; if (cb.checked && u) picked[u.id] = u; else delete picked[cb.value]; paintCount(); });
      });
      paintCount();
    });
  }
  q('ivSearch').addEventListener('input', function () { clearTimeout(listTimer); listTimer = setTimeout(loadList, 250); });
  q('ivSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
  q('ivFrom').addEventListener('change', loadList);

  bulkBtn.addEventListener('click', function () {
    var people = Object.keys(picked).map(function (k) { return picked[k]; }), m = q('iMsg');
    if (!people.length || !roomId) return;
    // The title / name fields of the "New person" tab must not be applied to the people picked here.
    ['iSal', 'iFirst', 'iLast'].forEach(function (id) { var el = q(id); if (el) el.value = ''; });
    bulkBtn.disabled = true;
    var ok = [], failed = [], i = 0;
    people.reduce(function (p, u) {
      return p.then(function () {
        i++; m.className = 'msg'; m.textContent = 'Inviting ' + i + ' of ' + people.length + ': ' + who(u) + '…';
        return A.callFn('clv-admin-rooms', { action: 'invite', room_id: roomId, email: u.email, lang: u.lang || 'en', expires_at: (q('iUntil') && q('iUntil').value) || undefined })
          .then(function (r) { if (r && !r.error) ok.push({ u: u, r: r }); else failed.push(who(u) + ' (' + ((r && r.error) === 'user-blocked' ? 'suspended or rejected' : (r && r.error) || 'error') + ')'); },
            function () { failed.push(who(u)); });
      });
    }, Promise.resolve()).then(function () {
      var signIn = ok.filter(function (x) { return !x.r.activation; }).length, act = ok.length - signIn, notMailed = ok.filter(function (x) { return !x.r.mailed; }).length;
      m.className = 'msg ' + (failed.length ? 'err' : 'ok');
      m.textContent = (ok.length ? ok.length + ' invited' + (signIn ? ', ' + signIn + ' sign in with their own password' : '') + (act ? ', ' + act + ' received an activation link' : '') + '.' : '')
        + (notMailed ? ' ' + notMailed + ' e-mail(s) could not be sent.' : '') + (failed.length ? ' Not invited: ' + failed.join(', ') + '.' : '');
      picked = {}; loadList();
      if (window.ClavorisAdminRefresh) window.ClavorisAdminRefresh();
    });
  });

  /* ---------- reset each time the window opens ---------- */
  new MutationObserver(function () {
    if (modal.hidden) return;
    clearChoice(); sugg = []; closeDrop(); picked = {}; q('ivSearch').value = ''; q('ivFrom').value = ''; roomsLoaded = roomsLoaded === roomId ? roomsLoaded : '';
    setTab('new');
  }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
})();
