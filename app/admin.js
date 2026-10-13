/* Clavoris admin console — page script (split out of admin.html). */
(function () {
  'use strict';
  var A = window.ClavorisAccess, S = window.ClavorisShell, esc = S.esc;
  function q(id) { return document.getElementById(id); }
  function fmt(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return String(ts).slice(0, 10); } }
  var users = [], current = null, products = [];
  function featChips(f) { f = f || {}; if (!f.market && !f.trading) return '<span style="color:var(--fg-3)">—</span>'; return (f.market ? '<span class="chip info">market' + (Array.isArray(f.products) ? ' · ' + f.products.length : '') + '</span> ' : '') + (f.trading ? '<span class="chip info">trading</span>' : ''); }
  function productPicker(el, selected) {
    var all = !Array.isArray(selected);
    el.innerHTML = '<label class="check" style="margin-top:0"><input type="radio" name="' + el.id + 'r" value="all"' + (all ? ' checked' : '') + '><span>All products</span></label>'
      + '<label class="check" style="margin-top:6px"><input type="radio" name="' + el.id + 'r" value="some"' + (all ? '' : ' checked') + '><span>Only the selected products</span></label>'
      + '<div class="picklist" data-pick' + (all ? ' hidden' : '') + '>' + (products.length ? products.map(function (p) { return '<label class="check" style="margin-top:4px"><input type="checkbox" value="' + esc(p.id) + '"' + (!all && selected.indexOf(p.id) >= 0 ? ' checked' : '') + '><span>' + esc(p.code) + ' · ' + esc(p.name) + '</span></label>'; }).join('') : '<span class="hint">No products yet.</span>') + '</div>';
    [].forEach.call(el.querySelectorAll('input[type=radio]'), function (r) { r.addEventListener('change', function () { el.querySelector('[data-pick]').hidden = el.querySelector('input[type=radio]:checked').value === 'all'; }); });
  }
  function pickedProducts(el) { if (el.querySelector('input[type=radio]:checked').value === 'all') return null; return [].map.call(el.querySelectorAll('[data-pick] input:checked'), function (c) { return c.value; }); }
  function readFeatures(prefix) { var m = q(prefix + 'fMarket').checked, t = q(prefix + 'fTrading').checked; return { market: m, trading: m && t, products: m ? pickedProducts(q(prefix + 'fProducts')) : null }; }

  function load() {
    A.callFn('clv-admin-list', {}).then(function (r) {
      if (r.error) { q('listErr').textContent = 'Could not load users (' + r.error + ').'; return; }
      users = r.users || [];
      q('cUsers').textContent = users.length;
      q('cVerified').textContent = users.filter(function (u) { return u.status === 'verified'; }).length;
      q('cPending').textContent = users.filter(function (u) { return u.status === 'kyc_pending' || u.status === 'kyc_retry'; }).length;
      q('cStaff').textContent = users.filter(function (u) { return u.role !== 'user'; }).length;
      q('rows').innerHTML = users.length ? users.map(function (u) {
        return '<tr><td><div style="font-weight:500;color:var(--clavis-navy)">' + esc(u.full_name || '') + '</div><div class="mono" style="font-size:11px;color:var(--fg-3);margin-top:3px">' + esc(u.email) + '</div></td>'
          + '<td>' + esc(u.company || '—') + (u.company_name ? '<div class="mono" style="font-size:10.5px;color:var(--fg-3)">account: ' + esc(u.company_name) + '</div>' : '') + '</td>'
          + '<td><span class="chip ' + esc(u.role) + '">' + esc(u.role) + '</span></td>'
          + '<td><span class="chip ' + esc(u.status) + '">' + esc(u.status.replace('_', ' ')) + '</span></td>'
          + '<td>' + (u.role === 'user' ? featChips(u.features) : '<span style="color:var(--fg-3)">staff</span>') + '</td>'
          + '<td class="mono" style="color:var(--fg-2)">' + esc(fmt(u.last_login_at)) + '</td>'
          + '<td class="mono" style="color:var(--fg-2)">' + esc(fmt(u.created_at)) + '</td>'
          + '<td><button class="btn-text" data-edit="' + esc(u.id) + '" type="button">Edit</button></td></tr>';
      }).join('') : '<tr><td colspan="8" style="color:var(--fg-3)">No users yet.</td></tr>';
      [].forEach.call(document.querySelectorAll('[data-edit]'), function (b) { b.addEventListener('click', function () { openEdit(b.getAttribute('data-edit')); }); });
    });
  }

  function openEdit(id) {
    current = users.filter(function (u) { return u.id === id; })[0]; if (!current) return;
    q('emTitle').textContent = current.full_name || current.email;
    q('eRole').value = current.role; q('eStatus').value = current.status;
    q('eRole').disabled = !A.isSuper() && (current.role !== 'user'); // only super may touch staff roles
    var f = current.features || {}; q('eFeat').hidden = current.role !== 'user'; q('efMarket').checked = !!f.market; q('efTrading').checked = !!f.trading; productPicker(q('efProducts'), f.products);
    q('eCompanyField').hidden = !(A.isSuper() && current.role !== 'user'); if (!q('eCompanyField').hidden) { companyOptions(q('eCompany'), current.company_id, true); q('eCompany').disabled = false; }
    q('eMsg').className = 'msg'; q('eMsg').textContent = '';
    if (current.id === A.user().id) { q('eMsg').className = 'msg'; q('eMsg').textContent = 'This is your own account: role and status cannot be changed from here.'; }
    q('newModal').hidden = true; q('editModal').hidden = false;
  }
  q('emClose').addEventListener('click', function () { q('editModal').hidden = true; });
  q('editForm').addEventListener('submit', function () {
    var m = q('eMsg'); m.className = 'msg'; m.textContent = ''; q('eBtn').disabled = true;
    A.callFn('clv-admin-set-role', { id: current.id, role: current.id === A.user().id ? undefined : q('eRole').value, status: current.id === A.user().id ? undefined : q('eStatus').value, features: current.role === 'user' ? readFeatures('e') : undefined, company_id: q('eCompanyField').hidden ? undefined : (q('eCompany').value || null) }).then(function (r) {
      q('eBtn').disabled = false;
      if (r.error) {
        m.className = 'msg err';
        m.textContent = r.error === 'super-only' ? 'Only the super-admin can change staff roles.'
          : r.error === 'self' ? 'You cannot change your own role or status.'
          : r.error === 'forbidden' ? 'Your account is not allowed to do this.'
          : r.error;
        return;
      }
      m.className = 'msg ok'; m.textContent = 'Saved.'; load();
    });
  });
  q('eReset').addEventListener('click', function () {
    var m = q('eMsg'); m.className = 'msg'; m.textContent = '';
    A.requestPasswordReset(current.email).then(function (r) { m.className = r.ok ? 'msg ok' : 'msg err'; m.textContent = r.ok ? 'Recovery link sent to ' + current.email + '.' : 'Could not send the link.'; });
  });

  q('newUser').addEventListener('click', function () { q('newForm').reset(); productPicker(q('nfProducts'), null); q('nMsg').className = 'msg'; q('nMsg').textContent = ''; q('editModal').hidden = true; q('newModal').hidden = false; });
  q('nmClose').addEventListener('click', function () { q('newModal').hidden = true; });
  q('newForm').addEventListener('submit', function () {
    var m = q('nMsg'); m.className = 'msg'; m.textContent = '';
    var name = q('nName').value.trim(), email = q('nEmail').value.trim();
    if (!name) { m.className = 'msg err'; m.textContent = 'Enter a name.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { m.className = 'msg err'; m.textContent = 'Enter a valid email.'; return; }
    q('nBtn').disabled = true;
    A.callFn('clv-admin-create-user', { name: name, email: email, company: q('nCompany').value.trim(), role: q('nRole').value, lang: q('nLang').value, features: readFeatures('n') }).then(function (r) {
      q('nBtn').disabled = false;
      if (r.error) { m.className = 'msg err'; m.textContent = r.error === 'email-taken' ? 'This email is already enrolled.' : r.error === 'super-only' ? 'Only the super-admin can create admins.' : r.error; return; }
      m.className = 'msg ok'; m.textContent = (r.linked ? 'Existing platform user enrolled on Clavoris. ' : 'Created. ') + (r.invited ? 'An activation link has been emailed.' : 'The invitation email could not be sent — use "Send passphrase reset" on the user.');
      load();
    });
  });

  /* ---- company accounts ---- */
  var companies = [], meAdmin = { role: 'admin', company_id: null };
  function companyOptions(sel, value, allowNone) {
    sel.innerHTML = (allowNone ? '<option value="">— none (platform) —</option>' : '') + companies.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
    sel.value = value || (allowNone ? '' : (meAdmin.company_id || (companies[0] && companies[0].id) || ''));
    sel.disabled = meAdmin.role !== 'super';
  }
  function loadCompanies() {
    return A.callFn('clv-admin-rooms', { action: 'companies' }).then(function (r) {
      if (r.error) return;
      companies = r.companies || []; meAdmin = r.me || meAdmin;
      q('newCompany').hidden = meAdmin.role !== 'super';
      q('compRows').innerHTML = companies.length ? '<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Company</th><th>Legal form · country</th><th>Contact</th><th>Admins</th><th></th></tr></thead><tbody>' + companies.map(function (c) {
        return '<tr><td style="font-weight:500;color:var(--clavis-navy)">' + esc(c.name) + '</td><td>' + esc([c.legal_form, c.country].filter(Boolean).join(' · ') || '—') + '</td><td class="mono" style="font-size:12px">' + esc(c.contact_email || '—') + '</td><td style="font-size:12.5px">' + (c.admins.length ? c.admins.map(function (a) { return esc(a.name || a.email) + ' <span class="chip ' + esc(a.role) + '">' + esc(a.role) + '</span>'; }).join('<br>') : '<span style="color:var(--fg-3)">— assign under Users › Edit</span>') + '</td><td>' + (meAdmin.role === 'super' ? '<button class="btn-text" type="button" data-ecomp="' + esc(c.id) + '">Edit</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p style="color:var(--fg-3)">No company accounts yet.</p>';
      [].forEach.call(q('compRows').querySelectorAll('[data-ecomp]'), function (b) { b.addEventListener('click', function () { openCompany(b.getAttribute('data-ecomp')); }); });
    });
  }
  function openCompany(id) {
    var c = companies.filter(function (x) { return x.id === id; })[0] || {};
    q('cId').value = c.id || ''; q('cName').value = c.name || ''; q('cForm').value = c.legal_form || ''; q('cCountry').value = c.country || ''; q('cReg').value = c.registration_no || ''; q('cMail').value = c.contact_email || '';
    q('cmTitle').textContent = c.id ? c.name : 'New company'; q('cMsg').className = 'msg'; q('cMsg').textContent = '';
    q('compModal').hidden = false;
  }
  q('newCompany').addEventListener('click', function () { openCompany(null); });
  q('cmClose').addEventListener('click', function () { q('compModal').hidden = true; });
  q('compForm').addEventListener('submit', function () {
    var m = q('cMsg'); m.className = 'msg'; m.textContent = ''; q('cBtn').disabled = true;
    A.callFn('clv-admin-rooms', { action: 'save_company', company: { id: q('cId').value || undefined, name: q('cName').value.trim(), legal_form: q('cForm').value.trim(), country: q('cCountry').value.trim(), registration_no: q('cReg').value.trim(), contact_email: q('cMail').value.trim() } }).then(function (r) {
      q('cBtn').disabled = false; if (r.error) { m.className = 'msg err'; m.textContent = r.error; return; }
      q('compModal').hidden = true; loadCompanies().then(loadRooms);
    });
  });

  /* ---- data rooms ---- */
  var rooms = [], invRoom = null;
  function openRoom(id) {
    var rm = rooms.filter(function (x) { return x.id === id; })[0] || {};
    q('rId').value = rm.id || ''; q('rName').value = rm.name || ''; q('rDesc').value = rm.description || ''; q('rSeller').value = rm.seller || ''; q('rType').value = rm.project_type || 'ma'; q('rStatus').value = rm.status || 'open';
    q('rDays').value = rm.default_expiry_days || 90; q('rFolder').value = rm.nextcloud_folder || ''; q('rDownloads').checked = rm.id ? rm.downloads_allowed !== false : true; q('rNda').checked = rm.id ? rm.qes_nda_required !== false : true;
    q('rNdaPdf').value = ''; q('rAnnex').value = ''; q('rNdaHint').textContent = rm.nda_pdf_name ? 'Current NDA: ' + rm.nda_pdf_name + ' (version ' + (rm.annex_version || '') + '). Upload a new PDF only to replace it.' : 'Upload the NDA of this data room. The signed copy is this PDF with a Clavoris signature page (name, e-mail, organisation, time, IP, KYC reference, SHA-256).';
    companyOptions(q('rCompany'), rm.company_id, false);
    q('rmTitle').textContent = rm.id ? rm.name : 'New data room'; q('rMsg').className = 'msg'; q('rMsg').textContent = '';
    q('roomModal').hidden = false;
  }
  q('newRoom').addEventListener('click', function () { openRoom(null); });
  q('rmClose').addEventListener('click', function () { q('roomModal').hidden = true; });
  q('roomForm').addEventListener('submit', function () {
    var m = q('rMsg'); m.className = 'msg'; m.textContent = ''; q('rBtn').disabled = true;
    var room = { id: q('rId').value || undefined, name: q('rName').value.trim(), description: q('rDesc').value.trim(), seller: q('rSeller').value.trim(), project_type: q('rType').value, status: q('rStatus').value, default_expiry_days: Number(q('rDays').value), nextcloud_folder: q('rFolder').value.trim(), downloads_allowed: q('rDownloads').checked, qes_nda_required: q('rNda').checked, company_id: q('rCompany').value };
    if (q('rAnnex').value.trim()) room.annex_text = q('rAnnex').value;
    var f = q('rNdaPdf').files && q('rNdaPdf').files[0];
    function send(b64, name) {
      A.callFn('clv-admin-rooms', { action: 'save_room', room: room, nda_pdf_base64: b64 || undefined, nda_pdf_name: name || undefined }).then(function (r) {
        q('rBtn').disabled = false; if (r.error) { m.className = 'msg err'; m.textContent = r.error === 'storage-not-configured' ? 'Connect Nextcloud first (Document storage).' : r.error + (r.detail ? ' — ' + r.detail : ''); return; }
        q('roomModal').hidden = true; loadRooms();
      });
    }
    if (f) {
      if (!/\.pdf$/i.test(f.name)) { m.className = 'msg err'; m.textContent = 'The NDA must be a PDF.'; q('rBtn').disabled = false; return; }
      if (f.size > 12 * 1024 * 1024) { m.className = 'msg err'; m.textContent = 'The PDF must be 12 MB or smaller.'; q('rBtn').disabled = false; return; }
      m.textContent = 'Uploading the NDA…';
      var rd = new FileReader(); rd.onload = function () { send(String(rd.result).split(',')[1], f.name); }; rd.onerror = function () { q('rBtn').disabled = false; m.className = 'msg err'; m.textContent = 'Could not read the file.'; }; rd.readAsDataURL(f);
    } else send(null, null);
  });
  function loadRooms() {
    A.callFn('clv-admin-rooms', { action: 'list' }).then(function (r) {
      if (r.error) { q('roomsErr').textContent = 'Could not load data rooms (' + r.error + ').'; return; }
      rooms = r.rooms || []; if (r.me) meAdmin = r.me;
      q('rooms').innerHTML = rooms.length ? rooms.map(function (rm) {
        return '<section class="card" style="padding:18px 20px;margin-top:12px" data-room="' + esc(rm.id) + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">'
          + '<div><div style="font-family:var(--font-display);font-size:19px;color:var(--clavis-navy)">' + esc(rm.name) + (rm.pending_requests ? ' <span class="chip pending">' + rm.pending_requests + ' extension request(s)</span>' : '') + '</div>'
          + '<div class="mono" style="font-size:11px;color:var(--fg-3);margin-top:3px">' + esc(rm.company_name || '—') + ' · ' + esc(rm.nextcloud_folder || '—') + ' · ' + (rm.qes_nda_required ? (rm.nda_pdf_name ? 'NDA: ' + esc(rm.nda_pdf_name) : 'NDA (text)') : 'no NDA') + ' · default access ' + esc(rm.default_expiry_days) + ' days · ' + esc(rm.members) + ' member(s) · ' + esc(rm.status) + '</div></div>'
          + '<div style="display:flex;gap:8px"><button class="btn btn-ghost" type="button" data-eroom="' + esc(rm.id) + '">Edit</button><a class="btn btn-ghost" href="room.html?id=' + esc(rm.id) + '">Open</a><button class="btn btn-primary" type="button" data-invite="' + esc(rm.id) + '">Invite by email</button></div></div>'
          + '<div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Member</th><th>Organisation</th><th>Sign-up</th><th>KYC</th><th>NDA</th><th>Access</th><th>Last access</th><th>Reminded</th><th></th></tr></thead><tbody id="mem-' + esc(rm.id) + '"><tr><td colspan="9" style="color:var(--fg-3)">Loading…</td></tr></tbody></table></div></section>';
      }).join('') : '<p style="color:var(--fg-3)">No data rooms yet.</p>';
      [].forEach.call(document.querySelectorAll('[data-invite]'), function (b) { b.addEventListener('click', function () { openInvite(b.getAttribute('data-invite')); }); });
      [].forEach.call(document.querySelectorAll('[data-eroom]'), function (b) { b.addEventListener('click', function () { openRoom(b.getAttribute('data-eroom')); }); });
      rooms.forEach(loadMembers);
    });
  }
  function loadMembers(rm) {
    A.callFn('clv-admin-rooms', { action: 'members', room_id: rm.id }).then(function (r) {
      var tb = q('mem-' + rm.id); if (!tb) return;
      var m = r.members || [];
      var STEP = { signup: 'activation', kyc: 'KYC', nda: 'NDA' };
      tb.innerHTML = m.length ? m.map(function (x) {
        var expired = x.expires_at && new Date(x.expires_at) < new Date();
        var dval = x.expires_at ? String(x.expires_at).slice(0, 10) : '';
        var access = x.revoked_at ? '<span class="chip rejected">revoked ' + esc(fmt(x.revoked_at)) + '</span>'
          : (expired ? '<span class="chip alert">expired</span>' : '<span class="chip verified">' + (x.expires_at ? esc(S.accessText(x.expires_at).split(' · ')[0]) : 'active') + '</span>')
            + '<div style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="date" class="mono" value="' + dval + '" data-exp="' + esc(x.user_id) + '" style="padding:4px 6px;font-size:11.5px;width:140px"><button class="btn-text" type="button" data-setexp="' + esc(x.user_id) + '" data-room="' + esc(rm.id) + '">Save</button></div>'
            + (x.pending_request ? '<div style="margin-top:6px;padding:6px 8px;background:#FFF7E6;border-radius:6px;font-size:11.5px"><b>Requests until ' + esc(fmt(x.pending_request.requested_until)) + '</b>' + (x.pending_request.message ? ' — ' + esc(x.pending_request.message) : '') + '<div style="margin-top:4px"><button class="btn-text" type="button" data-decide="' + esc(x.pending_request.id) + '" data-ok="1" data-until="' + esc(x.pending_request.requested_until) + '">Accept</button> · <button class="btn-text" type="button" data-decide="' + esc(x.pending_request.id) + '" data-ok="0">Reject</button></div></div>' : (x.last_request && x.last_request.status !== 'pending' ? '<div class="mono" style="font-size:10.5px;color:var(--fg-3);margin-top:3px">last request ' + esc(x.last_request.status) + ' ' + esc(fmt(x.last_request.decided_at)) + '</div>' : ''));
        var actions = x.revoked_at ? '<button class="btn-text" type="button" data-react="' + esc(x.user_id) + '" data-room="' + esc(rm.id) + '">Reactivate</button>'
          : (x.next_step ? '<button class="btn-text" type="button" data-remind="' + esc(x.user_id) + '" data-room="' + esc(rm.id) + '" title="Send a reminder to continue with the ' + STEP[x.next_step] + '">Remind (' + STEP[x.next_step] + ')</button> · ' : '')
            + '<button class="btn-text" type="button" data-revoke="' + esc(x.user_id) + '" data-room="' + esc(rm.id) + '">Revoke</button>';
        return '<tr' + (x.revoked_at ? ' style="opacity:.6"' : '') + '><td><div style="font-weight:500;color:var(--clavis-navy)">' + esc(x.name || '—') + '</div><div class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(x.email) + '</div></td>'
          + '<td>' + esc(x.company || '—') + '</td>'
          + '<td>' + (x.activated ? '<span class="chip verified">activated</span><div class="mono" style="font-size:10.5px;color:var(--fg-3);margin-top:2px">last login ' + esc(fmt(x.last_login_at)) + '</div>' : '<span class="chip pending">not activated</span><div class="mono" style="font-size:10.5px;color:var(--fg-3);margin-top:2px">invited ' + esc(fmt(x.granted_at)) + '</div>') + '</td>'
          + '<td><span class="chip ' + esc(x.status) + '">' + esc(String(x.status).replace('_', ' ')) + '</span></td>'
          + '<td>' + (x.nda_signed_at ? '<span class="chip verified">signed ' + esc(fmt(x.nda_signed_at)) + '</span>' : '<span class="chip pending">not signed</span>') + '</td>'
          + '<td>' + access + '</td>'
          + '<td class="mono" style="color:var(--fg-2)">' + esc(fmt(x.last_access)) + '</td>'
          + '<td class="mono" style="font-size:11px;color:var(--fg-3)">' + (x.reminded ? esc(fmt(x.reminded.ts)) + ' (' + esc(STEP[x.reminded.step] || x.reminded.step) + ')' : '—') + '</td>'
          + '<td style="white-space:nowrap">' + actions + '</td></tr>';
      }).join('') : '<tr><td colspan="9" style="color:var(--fg-3)">No members yet.</td></tr>';
      [].forEach.call(tb.querySelectorAll('[data-setexp]'), function (b) {
        b.addEventListener('click', function () {
          var inp = tb.querySelector('[data-exp="' + b.getAttribute('data-setexp') + '"]'); b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'set_expiry', room_id: b.getAttribute('data-room'), user_id: b.getAttribute('data-setexp'), expires_at: inp.value || null }).then(function (x) { if (x.error) { q('roomsErr').textContent = x.error; b.disabled = false; } else loadMembers(rm); });
        });
      });
      [].forEach.call(tb.querySelectorAll('[data-decide]'), function (b) {
        b.addEventListener('click', function () {
          var ok = b.getAttribute('data-ok') === '1', until = null, note = null;
          if (ok) { until = prompt('Extend access until (YYYY-MM-DD):', b.getAttribute('data-until')); if (until === null) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) { q('roomsErr').textContent = 'Enter a date as YYYY-MM-DD.'; return; } }
          note = prompt(ok ? 'Note to the member (optional):' : 'Reason given to the member (optional):', ''); if (note === null) return;
          b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'decide_extension', request_id: b.getAttribute('data-decide'), accept: ok, until: until || undefined, note: note }).then(function (x) { if (x.error) { q('roomsErr').textContent = x.error; b.disabled = false; } else loadRooms(); });
        });
      });
      [].forEach.call(tb.querySelectorAll('[data-revoke]'), function (b) {
        b.addEventListener('click', function () {
          if (!confirm('Revoke this member\'s access? They stay listed as revoked and can be reactivated later.')) return;
          b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'revoke', room_id: b.getAttribute('data-room'), user_id: b.getAttribute('data-revoke') }).then(function () { loadRooms(); });
        });
      });
      [].forEach.call(tb.querySelectorAll('[data-react]'), function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          A.callFn('clv-admin-rooms', { action: 'reactivate', room_id: b.getAttribute('data-room'), user_id: b.getAttribute('data-react') }).then(function (x) { if (x.error) { q('roomsErr').textContent = x.error; b.disabled = false; } else loadRooms(); });
        });
      });
      [].forEach.call(tb.querySelectorAll('[data-remind]'), function (b) {
        b.addEventListener('click', function () {
          b.disabled = true; var label = b.textContent;
          A.callFn('clv-admin-rooms', { action: 'remind', room_id: b.getAttribute('data-room'), user_id: b.getAttribute('data-remind') }).then(function (x) {
            if (x.error) { q('roomsErr').textContent = x.error; b.disabled = false; return; }
            b.textContent = x.mailed ? 'Reminder sent' : (x.step ? 'Mail not sent' : 'Nothing to remind');
            setTimeout(function () { loadMembers(rm); }, 1500); void label;
          });
        });
      });
    });
  }
  function openInvite(id) {
    invRoom = rooms.filter(function (r) { return r.id === id; })[0]; if (!invRoom) return;
    q('imTitle').textContent = invRoom.name; q('invForm').reset(); q('iMsg').className = 'msg'; q('iMsg').textContent = '';
    q('iUntil').value = new Date(Date.now() + (Number(invRoom.default_expiry_days) || 90) * 86400000).toISOString().slice(0, 10); q('iUntil').min = new Date().toISOString().slice(0, 10);
    q('newModal').hidden = true; q('editModal').hidden = true; q('invModal').hidden = false;
  }
  q('imClose').addEventListener('click', function () { q('invModal').hidden = true; });
  q('invForm').addEventListener('submit', function () {
    var m = q('iMsg'); m.className = 'msg'; m.textContent = '';
    var email = q('iEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { m.className = 'msg err'; m.textContent = 'Enter a valid email.'; return; }
    q('iBtn').disabled = true;
    A.callFn('clv-admin-rooms', { action: 'invite', room_id: invRoom.id, email: email, lang: q('iLang').value, expires_at: q('iUntil').value || undefined }).then(function (r) {
      q('iBtn').disabled = false;
      if (r.error) { m.className = 'msg err'; m.textContent = r.error === 'user-blocked' ? 'This user is suspended or rejected.' : r.error; return; }
      m.className = 'msg ok'; m.textContent = (r.created ? 'Enrolled and invited. ' : r.linked ? 'Existing platform user enrolled on Clavoris and invited. ' : 'Access granted. ') + (r.mailed ? 'Invitation emailed.' : 'The email could not be sent — check the mail configuration.');
      loadRooms(); load();
    });
  });

  /* ---- Nextcloud connection (Login Flow v2: the admin signs in to Nextcloud once, the app password never leaves the server) ---- */
  function ncStatus() {
    A.callFn('clv-nc-connect', { action: 'status' }).then(function (r) {
      var el = q('ncStatus');
      if (r.error) { el.textContent = 'Connection check failed (' + r.error + ').'; return; }
      if (!r.connected) { el.innerHTML = 'Not connected. Data rooms read their documents from <span class="mono">' + esc(r.url) + '</span>.'; q('ncDisconnect').hidden = true; return; }
      el.innerHTML = (r.checked ? '<span class="chip verified">connected</span> ' : '<span class="chip alert">error ' + esc(r.error || '') + '</span> ') + 'as <span class="mono">' + esc(r.user) + '</span> on ' + esc(r.url) + (r.since ? ' · since ' + esc(fmt(r.since)) : '');
      q('ncDisconnect').hidden = false; q('ncConnect').textContent = 'Reconnect';
    });
  }
  q('ncConnect').addEventListener('click', function () {
    var m = q('ncMsg'); m.className = 'msg'; m.textContent = 'Opening Nextcloud…'; q('ncConnect').disabled = true;
    var win = window.open('about:blank', '_blank');
    A.callFn('clv-nc-connect', { action: 'start' }).then(function (r) {
      if (r.error) { if (win) win.close(); q('ncConnect').disabled = false; m.className = 'msg err'; m.textContent = 'Could not start (' + r.error + ').'; return; }
      if (win) win.location.href = r.login; else window.open(r.login, '_blank');
      m.textContent = 'Sign in to Nextcloud in the new window and press "Grant access". Waiting…';
      var tries = 0;
      (function poll() {
        if (tries++ > 150) { q('ncConnect').disabled = false; m.className = 'msg err'; m.textContent = 'Timed out — try again.'; return; }
        A.callFn('clv-nc-connect', { action: 'poll', token: r.token, endpoint: r.endpoint }).then(function (p) {
          if (p.pending) { setTimeout(poll, 2000); return; }
          q('ncConnect').disabled = false;
          if (p.error) { m.className = 'msg err'; m.textContent = 'Connection failed (' + p.error + ').'; return; }
          m.className = 'msg ok'; m.textContent = 'Connected as ' + p.user + '.'; try { if (win) win.close(); } catch (e) {}
          ncStatus(); loadRooms();
        });
      })();
    });
  });
  q('ncDisconnect').addEventListener('click', function () { A.callFn('clv-nc-connect', { action: 'disconnect' }).then(function () { q('ncConnect').textContent = 'Connect Nextcloud'; ncStatus(); }); });

  /* ---- marketplace ---- */
  var PSTAT = { upcoming: 'neutral', open: 'verified', closed: 'pending', matured: 'neutral', cancelled: 'rejected' };
  function money(n, c) { return S.fmtMoney(n, c); }
  function loadProducts() {
    A.callFn('clv-market', { action: 'admin_list' }).then(function (r) {
      if (r.error) { q('prodErr').textContent = 'Could not load products (' + r.error + ').'; return; }
      products = r.products || [];
      q('prodRows').innerHTML = products.length ? products.map(function (p) {
        var warn = p.max_investors && p.assessed >= Math.floor(Number(p.max_investors) * 0.8);
        var todo = [];
        if (p.subs_requested) todo.push(p.subs_requested + ' subscription(s) to review');
        if (p.trades_to_settle) todo.push(p.trades_to_settle + ' trade(s) to settle');
        return '<tr><td><div style="font-weight:500;color:var(--clavis-navy)">' + esc(p.name) + '</div><div class="mono" style="font-size:11px;color:var(--fg-3);margin-top:3px">' + esc(p.code) + (p.isin ? ' · ' + esc(p.isin) : '') + '</div></td>'
          + '<td>' + esc(p.issuer_name) + '</td><td><span class="chip ' + (PSTAT[p.status] || 'neutral') + '">' + esc(p.status) + '</span>' + (p.secondary_enabled ? ' <span class="chip info">secondary</span>' : '') + '</td>'
          + '<td style="font-size:12.5px">' + (p.coupon_rate != null ? esc(Number(p.coupon_rate).toFixed(2)) + ' % ' + esc(p.coupon_frequency) : '—') + '<br><span class="mono" style="color:var(--fg-3);font-size:11px">' + esc(money(p.nominal, p.currency)) + ' · ' + esc(p.maturity_date || '—') + '</span></td>'
          + '<td class="mono">' + p.units_subscribed + (p.total_units ? ' / ' + p.total_units : '') + '</td>'
          + '<td class="mono">' + p.viewed + ' · <b' + (warn ? ' style="color:#B83A3A"' : '') + '>' + p.assessed + '</b> · ' + p.holders + (p.max_investors ? ' <span style="color:var(--fg-3)">/ ' + p.max_investors + '</span>' : '') + '</td>'
          + '<td style="font-size:12px;color:' + (todo.length ? 'var(--seal-gold)' : 'var(--fg-3)') + '">' + (todo.join('<br>') || '—') + '</td>'
          + '<td style="white-space:nowrap"><button class="btn-text" type="button" data-pedit="' + esc(p.id) + '">Edit</button> <button class="btn-text" type="button" data-pdetail="' + esc(p.id) + '">Detail</button> <a class="btn-text" href="product.html?id=' + esc(p.id) + '">Open</a></td></tr>';
      }).join('') : '<tr><td colspan="8" style="color:var(--fg-3)">No products yet.</td></tr>';
      [].forEach.call(document.querySelectorAll('[data-pedit]'), function (b) { b.addEventListener('click', function () { openProduct(b.getAttribute('data-pedit')); }); });
      [].forEach.call(document.querySelectorAll('[data-pdetail]'), function (b) { b.addEventListener('click', function () { loadDetail(b.getAttribute('data-pdetail')); }); });
    });
  }
  var PF = { pCode: 'code', pType: 'type', pStatus: 'status', pName: 'name', pIssuer: 'issuer_name', pIssuerId: 'issuer_id', pIssuerCountry: 'issuer_country', pIssuerDesc: 'issuer_description', pIsin: 'isin', pCcy: 'currency', pNominal: 'nominal', pMin: 'min_units', pTotal: 'total_units', pMaxInv: 'max_investors', pRate: 'coupon_rate', pFreq: 'coupon_frequency', pIssue: 'issue_date', pFirst: 'first_coupon_date', pMaturity: 'maturity_date', pOpens: 'subscription_opens', pCloses: 'subscription_closes', pHighlights: 'highlights', pDesc: 'description', pFolder: 'nextcloud_folder' };
  function openProduct(id) {
    var p = id ? products.filter(function (x) { return x.id === id; })[0] : null;
    q('prodForm').reset(); q('pId').value = p ? p.id : ''; q('pmTitle').textContent = p ? p.code + ' · ' + p.name : 'New product';
    if (p) Object.keys(PF).forEach(function (k) { q(k).value = p[PF[k]] == null ? '' : p[PF[k]]; });
    q('pSecondary').checked = !!(p && p.secondary_enabled);
    q('pCompanyField').hidden = meAdmin.role !== 'super'; companyOptions(q('pCompany'), p && p.company_id, false);
    q('pMsg').className = 'msg'; q('pMsg').textContent = '';
    q('newModal').hidden = true; q('editModal').hidden = true; q('invModal').hidden = true; q('prodModal').hidden = false;
  }
  q('newProduct').addEventListener('click', function () { openProduct(null); });
  q('pmClose').addEventListener('click', function () { q('prodModal').hidden = true; });
  q('prodForm').addEventListener('submit', function () {
    var m = q('pMsg'); m.className = 'msg'; m.textContent = ''; q('pBtn').disabled = true;
    var row = { id: q('pId').value || undefined, secondary_enabled: q('pSecondary').checked, company_id: q('pCompany').value || undefined };
    Object.keys(PF).forEach(function (k) { row[PF[k]] = q(k).value; });
    A.callFn('clv-market', { action: 'admin_save', product: row }).then(function (r) {
      q('pBtn').disabled = false;
      if (r.error) { m.className = 'msg err'; m.textContent = r.error; return; }
      m.className = 'msg ok'; m.textContent = 'Saved.'; q('pId').value = r.id; loadProducts();
    });
  });

  function loadDetail(id) {
    var box = q('prodDetail'); box.innerHTML = '<p style="color:var(--fg-3);font-size:13px">Loading…</p>';
    A.callFn('clv-market', { action: 'admin_product', id: id }).then(function (r) {
      if (r.error) { box.innerHTML = '<p class="msg err">' + esc(r.error) + '</p>'; return; }
      var p = r.product, c = p.currency, cnt = r.counts;
      function who(x) { return esc((x && x.full_name) || (x && x.email) || '—') + (x && x.email ? ' <span class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(x.email) + '</span>' : ''); }
      var subs = r.subscriptions.map(function (s) {
        var act = s.status === 'requested' ? '<button class="btn-text" data-sub="' + s.id + '" data-to="accepted">Accept</button> <button class="btn-text" data-sub="' + s.id + '" data-to="rejected">Reject</button>'
          : s.status === 'accepted' ? '<button class="btn-text" data-sub="' + s.id + '" data-to="settled">Settle → holding</button> <button class="btn-text" data-sub="' + s.id + '" data-to="cancelled">Cancel</button>' : '';
        return '<tr><td>' + who(s.profile) + '</td><td class="mono">' + s.units + '</td><td class="mono">' + esc(money(s.amount, c)) + '</td><td><span class="chip ' + (s.status === 'settled' ? 'verified' : s.status === 'requested' ? 'pending' : 'neutral') + '">' + esc(s.status) + '</span></td><td class="mono" style="font-size:11px">' + esc(fmt(s.created_at)) + '</td><td>' + (s.contract_id ? '<a class="btn-text" href="contract.html?id=' + esc(s.contract_id) + '">contract</a>' : '<button class="btn-text" data-subcontract="' + s.id + '">link contract</button>') + '</td><td style="white-space:nowrap">' + act + '</td></tr>';
      }).join('') || '<tr><td colspan="7" style="color:var(--fg-3)">No subscriptions.</td></tr>';
      var lst = r.listings.map(function (l) {
        var act = l.status === 'matched' ? '<button class="btn-text" data-lst="' + l.id + '" data-to="settled">Settle transfer</button> ' : '';
        if (l.status === 'open' || l.status === 'matched') act += '<button class="btn-text" data-lst="' + l.id + '" data-to="cancelled">Cancel</button>';
        return '<tr><td>' + who(l.seller) + '</td><td>' + who(l.buyer) + '</td><td class="mono">' + l.units + ' × ' + esc(money(l.price_per_unit, c)) + '</td><td><span class="chip ' + (l.status === 'settled' ? 'verified' : l.status === 'matched' ? 'pending' : l.status === 'open' ? 'info' : 'neutral') + '">' + esc(l.status) + '</span></td><td>' + (l.contract_id ? '<a class="btn-text" href="contract.html?id=' + esc(l.contract_id) + '">contract</a>' : (l.status === 'matched' ? '<button class="btn-text" data-lstcontract="' + l.id + '">link contract</button>' : '—')) + '</td><td style="white-space:nowrap">' + act + '</td></tr>';
      }).join('') || '<tr><td colspan="6" style="color:var(--fg-3)">No listings.</td></tr>';
      var holders = r.holders.map(function (h) { return '<tr><td>' + who(h) + '</td><td>' + esc(h.company || '—') + '</td><td class="mono">' + h.units + '</td><td class="mono">' + esc(money(h.units * Number(p.nominal), c)) + '</td></tr>'; }).join('') || '<tr><td colspan="4" style="color:var(--fg-3)">No holders.</td></tr>';
      var today = new Date().toISOString().slice(0, 10);
      var sched = r.coupon_schedule.map(function (k) {
        var paid = r.payments.filter(function (x) { return x.due_date === k.due && x.paid_at; }).length, due = k.due <= today;
        return '<tr><td class="mono">' + esc(k.due) + '</td><td class="mono">' + esc(Number(k.rate_period).toFixed(4)) + ' %</td><td class="mono">' + paid + ' / ' + r.holders.length + '</td><td>' + (due && paid < r.holders.length ? '<button class="btn-text" data-coupon="' + k.due + '">Record payment to all holders</button>' : (paid ? '<span class="chip verified">recorded</span>' : '<span class="chip neutral">scheduled</span>')) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" style="color:var(--fg-3)">No coupon schedule (set rate, frequency and maturity).</td></tr>';
      var inv = r.investors.sort(function (a, b) { return a.last < b.last ? 1 : -1; }).map(function (u) { return '<tr><td>' + esc(u.name || '—') + ' <span class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(u.email) + '</span></td><td>' + esc(u.company || '—') + '</td><td>' + (u.assessed ? '<span class="chip verified">assessed</span>' : '<span class="chip neutral">viewed only</span>') + '</td><td class="mono" style="font-size:11px">' + esc(fmt(u.first)) + '</td><td class="mono" style="font-size:11px">' + esc(fmt(u.last)) + '</td><td class="mono">' + u.views + ' · ' + u.docs + ' · ' + u.downloads + '</td><td style="font-size:11px;color:var(--fg-3)">' + esc(u.files.join(', ')) + '</td></tr>'; }).join('') || '<tr><td colspan="7" style="color:var(--fg-3)">No investor has opened this product yet.</td></tr>';
      var acc = r.access.slice(0, 100).map(function (a) { return '<tr><td class="mono" style="font-size:11px;white-space:nowrap">' + esc(String(a.ts).replace('T', ' ').slice(0, 16)) + '</td><td>' + esc((a.profile && (a.profile.full_name || a.profile.email)) || a.user_id) + '</td><td><span class="chip ' + (a.kind === 'docs' || a.kind === 'download' ? 'verified' : 'neutral') + '">' + esc(a.kind) + '</span></td><td style="font-size:12px">' + esc(a.path || '') + (a.sha256 ? ' <span class="mono" style="font-size:10.5px;color:var(--fg-3)" title="' + esc(a.sha256) + '">' + esc(a.sha256.slice(0, 12)) + '…</span>' : '') + '</td><td class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(a.ip || '') + '</td></tr>'; }).join('');
      var ceiling = p.max_investors ? ' <span style="color:' + (cnt.assessed >= p.max_investors ? '#B83A3A' : cnt.assessed >= p.max_investors * 0.8 ? 'var(--seal-gold)' : 'var(--fg-3)') + '">of ' + p.max_investors + ' ceiling</span>' : '';
      box.innerHTML = '<section class="card" style="padding:18px 20px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><div style="font-family:var(--font-display);font-size:19px;color:var(--clavis-navy)">' + esc(p.code) + ' · ' + esc(p.name) + '</div><div style="font-size:12.5px;color:var(--fg-2);margin-top:3px">Investors: ' + cnt.viewed + ' viewed · <b>' + cnt.assessed + ' assessed the documentation</b>' + ceiling + ' · ' + cnt.holders + ' holder(s)</div></div><button class="btn-text" type="button" id="pdClose">close</button></div>'
        + '<div class="tiles" style="margin-top:14px"><div class="card tile"><div class="k">Viewed</div><div class="v">' + cnt.viewed + '</div><div class="s">opened the product page</div></div><div class="card tile"><div class="k">Assessed</div><div class="v gold">' + cnt.assessed + '</div><div class="s">opened the full documentation</div></div><div class="card tile"><div class="k">Holders</div><div class="v">' + cnt.holders + '</div><div class="s">current owners</div></div><div class="card tile"><div class="k">Ceiling</div><div class="v">' + (p.max_investors || '—') + '</div><div class="s">prospectus exemption</div></div></div>'
        + '<p class="eyebrow" style="margin-top:18px">Subscriptions (primary market)</p><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Investor</th><th>Units</th><th>Amount</th><th>Status</th><th>Requested</th><th>Documentation</th><th></th></tr></thead><tbody>' + subs + '</tbody></table></div>'
        + '<p class="eyebrow" style="margin-top:18px">Secondary market</p><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Seller</th><th>Buyer</th><th>Units × price</th><th>Status</th><th>Documentation</th><th></th></tr></thead><tbody>' + lst + '</tbody></table></div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;margin-top:18px">'
        + '<div><p class="eyebrow">Holders</p><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Investor</th><th>Company</th><th>Units</th><th>Nominal</th></tr></thead><tbody>' + holders + '</tbody></table></div></div>'
        + '<div><p class="eyebrow">Coupon schedule &amp; payments</p><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Due</th><th>Rate / period</th><th>Paid</th><th></th></tr></thead><tbody>' + sched + '</tbody></table></div></div></div>'
        + '<p class="eyebrow" style="margin-top:18px">Investor assessment register (prospectus compliance)</p><p style="font-size:12.5px;color:var(--fg-2);margin-top:4px">Every investor who has accessed this instrument, with first and last access and the number of page views · documentation openings · document downloads. "Assessed" means the full documentation was opened or a document downloaded.</p>'
        + '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Investor</th><th>Company</th><th>Assessment</th><th>First access</th><th>Last access</th><th>Views · docs · downloads</th><th>Files</th></tr></thead><tbody>' + inv + '</tbody></table></div>'
        + '<p class="eyebrow" style="margin-top:18px">Access log (latest 100)</p><div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Time (UTC)</th><th>Investor</th><th>Event</th><th>Document</th><th>IP</th></tr></thead><tbody>' + (acc || '<tr><td colspan="5" style="color:var(--fg-3)">—</td></tr>') + '</tbody></table></div>'
        + '<p class="eyebrow" style="margin-top:18px">Notify holders of a portfolio event</p><p style="font-size:12.5px;color:var(--fg-2);margin-top:4px">Mails every current holder (who has portfolio notifications enabled) and records the event on the instrument. Coupon payments recorded above notify the holders automatically.</p>'
        + '<form id="evForm" onsubmit="return false;" class="g3" style="margin-top:8px;align-items:end"><div class="field"><label for="evKind">Event</label><select id="evKind"><option value="custom">Notice (custom)</option><option value="maturity">End of contract</option><option value="principal">Repayment of principal</option><option value="conversion">Conversion into shares</option><option value="coupon">Coupon payment</option></select></div><div class="field"><label for="evDate">Date</label><input id="evDate" type="date"></div><div class="field"><label for="evTitle">Title</label><input id="evTitle" type="text" maxlength="200" placeholder="e.g. Repayment of principal on maturity"></div><div class="field" style="grid-column:1/-1"><label for="evBody">Message to holders</label><textarea id="evBody" rows="3" maxlength="4000"></textarea></div><div><button class="btn btn-primary" type="submit" id="evBtn">Send to holders</button></div></form>'
        + '<p class="msg" id="pdMsg" role="status"></p></section>';
      q('evForm').addEventListener('submit', function () { var t = q('evTitle').value.trim(); if (!t) { q('evTitle').focus(); return; } if (!confirm('Send this event to all current holders of ' + p.code + '?')) return; q('evBtn').disabled = true; A.callFn('clv-market', { action: 'admin_event', product_id: id, kind: q('evKind').value, event_date: q('evDate').value, title: t, body: q('evBody').value.trim() }).then(function (x) { q('evBtn').disabled = false; var m = q('pdMsg'); if (x.error) { m.className = 'msg err'; m.textContent = x.error; return; } m.className = 'msg ok'; m.textContent = 'Event recorded · ' + x.mailed + ' holder(s) mailed.'; q('evForm').reset(); }); });
      q('pdClose').addEventListener('click', function () { box.innerHTML = ''; });
      function after(x) { var m = q('pdMsg'); if (x.error) { m.className = 'msg err'; m.textContent = x.error; return; } loadDetail(id); loadProducts(); }
      [].forEach.call(box.querySelectorAll('[data-sub]'), function (b) { b.addEventListener('click', function () { var to = b.getAttribute('data-to'); if ((to === 'rejected' || to === 'cancelled') && !confirm('Mark this subscription as ' + to + '?')) return; b.disabled = true; A.callFn('clv-market', { action: 'admin_subscription', id: b.getAttribute('data-sub'), status: to }).then(after); }); });
      [].forEach.call(box.querySelectorAll('[data-subcontract]'), function (b) { b.addEventListener('click', function () { var cid = prompt('Contract id (from the Contracts module) to link as executed subscription documentation:'); if (!cid) return; A.callFn('clv-market', { action: 'admin_subscription', id: b.getAttribute('data-subcontract'), status: 'accepted', contract_id: cid.trim() }).then(after); }); });
      [].forEach.call(box.querySelectorAll('[data-lst]'), function (b) { b.addEventListener('click', function () { var to = b.getAttribute('data-to'); if (!confirm(to === 'settled' ? 'Settle this transfer? Units move from the seller to the buyer.' : 'Cancel this listing?')) return; b.disabled = true; A.callFn('clv-market', { action: 'admin_listing', id: b.getAttribute('data-lst'), status: to }).then(after); }); });
      [].forEach.call(box.querySelectorAll('[data-lstcontract]'), function (b) { b.addEventListener('click', function () { var cid = prompt('Contract id to link as transfer documentation:'); if (!cid) return; A.callFn('clv-market', { action: 'admin_listing', id: b.getAttribute('data-lstcontract'), status: 'settled', contract_id: cid.trim() }).then(after); }); });
      [].forEach.call(box.querySelectorAll('[data-coupon]'), function (b) { b.addEventListener('click', function () { var ref = prompt('Payment reference (optional):') ; if (ref === null) return; b.disabled = true; A.callFn('clv-market', { action: 'admin_coupon', product_id: id, due_date: b.getAttribute('data-coupon'), reference: ref }).then(after); }); });
    });
  }

  q('scanNow').addEventListener('click', function () { var b = q('scanNow'); b.disabled = true; b.textContent = 'Scanning…'; A.callFn('clv-notify', { action: 'scan' }).then(function (r) { b.disabled = false; b.textContent = 'Scan now'; q('scanInfo').textContent = r.error ? 'Scan failed: ' + r.error : 'Scanned ' + (r.rooms ? r.rooms.rooms : 0) + ' room(s) · ' + (r.rooms ? r.rooms.new_files + ' new, ' + r.rooms.updated_files + ' updated, ' + r.rooms.mails + ' mail(s)' : 'storage not connected') + ' · ' + r.product_mails + ' new-investment mail(s) · ' + String(r.at).replace('T', ' ').slice(0, 16) + ' UTC'; }); });
  A.ready(function () { if (!A.clears('admin')) return; S.render('admin'); load(); loadProducts(); loadCompanies().then(loadRooms); ncStatus(); if (location.hash === '#market') setTimeout(function () { var el = q('market'); if (el) el.scrollIntoView(); }, 300); });
})();
