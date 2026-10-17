/* Clavoris admin — interactive documents (artifacts) in data rooms.
   Adds an "Interactive" button to every data room in Admin › Data rooms. The company that owns the room:
   - creates an artifact (e.g. "Minerva business plan") and publishes versions: the page's HTML file plus an
     optional JSON data snapshot ({ collection: { docId: {...} } }), served read-only to the page;
   - attaches it to the room — always DISABLED at first — and sets what members may see (CSS selectors to hide,
     printing, watermark, a pinned version or always the latest);
   - previews it as members will see it (staff only while disabled), then enables it with an explicit confirmation.
   All operations go through clv-admin-artifacts (audited). Loaded after admin.js. */
(function () {
  'use strict';
  var A = window.ClavorisAccess;
  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function day(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  var ERR = { 'not-found': 'Not found in your company’s data rooms.', 'bad-slug': 'Short name: lowercase letters, digits and dashes (2–63).', 'slug-taken': 'This short name is already used.', 'title-required': 'Enter a title.', 'html-required': 'Choose the HTML file.', 'too-large': 'The file is larger than 8 MB.', 'already-linked': 'Already attached to this room.', 'confirm-required': 'Confirmation required.', 'no-such-version': 'This version does not exist.' };
  function er(e) { return ERR[e] || e; }

  var wrap = document.createElement('div');
  wrap.className = 'scrim'; wrap.id = 'artModal'; wrap.hidden = true;
  wrap.innerHTML = '<div class="modal modal-wide" role="dialog" aria-labelledby="amTitle">'
    + '<div class="modal-head"><div><div class="e">Interactive documents</div><div class="t" id="amTitle"></div></div><button type="button" id="amClose" aria-label="Close">×</button></div>'
    + '<div class="modal-body">'
    + '<p class="hint" style="margin:0 0 12px;font-size:12.5px;line-height:1.6">Live models and dashboards (for example a business plan built in claude.ai) shown inside the room, read-only, in a sandbox without network access. Members see them after signing the room’s NDA, with the same access end date as the documents; every opening is logged and watermarked with their name. A document attached to the room stays <b>invisible to members until you enable it</b>; you can preview it first.</p>'
    + '<p class="eyebrow">In this room</p>'
    + '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Document</th><th>Version</th><th>Members</th><th>Viewer settings</th><th></th></tr></thead><tbody id="amLinks"></tbody></table></div>'
    + '<p class="msg" id="amMsg" role="status"></p>'
    + '<p class="eyebrow" style="margin-top:22px">Company documents</p>'
    + '<div class="tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Document</th><th>Latest</th><th>Publish a version</th><th></th></tr></thead><tbody id="amArts"></tbody></table></div>'
    + '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:13px;color:var(--clavis-navy)">+ New interactive document</summary>'
    + '<div class="g3" style="margin-top:10px"><div class="field" style="margin-top:0"><label for="amSlug">Short name</label><input id="amSlug" type="text" class="mono" placeholder="minerva-plan"></div>'
    + '<div class="field" style="margin-top:0;grid-column:2/4"><label for="amTitleIn">Title shown to members</label><input id="amTitleIn" type="text" placeholder="Business plan 2026–36 (live model)"></div></div>'
    + '<div class="field"><label for="amDesc">Description</label><input id="amDesc" type="text"></div>'
    + '<div class="field"><label for="amSrc">Edited at (staff only)</label><input id="amSrc" type="text" class="mono" placeholder="https://claude.ai/artifact/…"></div>'
    + '<button class="btn btn-primary" type="button" id="amCreate" style="margin-top:10px">Create</button></details>'
    + '</div></div>';
  document.body.appendChild(wrap);
  var cur = null, state = { artifacts: [], links: [] };
  q('amClose').addEventListener('click', function () { wrap.hidden = true; });
  function msg(t, k) { var m = q('amMsg'); m.className = 'msg' + (k ? ' ' + k : ''); m.textContent = t || ''; }
  function call(body) { return A.callFn('clv-admin-artifacts', body); }

  function load() {
    q('amLinks').innerHTML = '<tr><td colspan="5" style="color:var(--fg-3)">Loading…</td></tr>';
    return call({ action: 'list', room_id: cur.id }).then(function (r) {
      if (r.error) { msg(er(r.error), 'err'); q('amLinks').innerHTML = ''; return; }
      state = r; render();
    });
  }
  function artById(id) { return state.artifacts.filter(function (a) { return a.id === id; })[0] || {}; }
  function render() {
    var linked = {};
    q('amLinks').innerHTML = state.links.length ? state.links.map(function (l) {
      var a = artById(l.artifact_id), c = l.config || {}; linked[l.artifact_id] = 1;
      return '<tr data-link="' + l.id + '"><td><b>' + esc(l.label || a.title) + '</b><div class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(a.slug || '') + '</div></td>'
        + '<td><select data-pin style="font:inherit;font-size:12.5px"><option value="">latest (v' + esc(a.current_version || '—') + ')</option>' + Array.from({ length: a.current_version || 0 }, function (_, i) { var v = (a.current_version || 0) - i; return '<option value="' + v + '"' + (l.pinned_version === v ? ' selected' : '') + '>v' + v + ' only</option>'; }).join('') + '</select></td>'
        + '<td>' + (l.enabled ? '<span class="chip verified">visible since ' + esc(day(l.enabled_at)) + '</span>' : '<span class="chip neutral">not visible</span>') + '</td>'
        + '<td style="min-width:240px"><textarea data-hide rows="2" placeholder="CSS selectors to hide, one per line — e.g. [data-t=&quot;people&quot;]" style="width:100%;font:12px var(--font-mono,monospace)">' + esc((c.hide || []).join('\n')) + '</textarea>'
        + '<label class="check" style="margin-top:4px;font-size:12px"><input type="checkbox" data-wm' + (c.watermark === false ? '' : ' checked') + '><span>Watermark</span></label>'
        + '<label class="check" style="margin-top:2px;font-size:12px"><input type="checkbox" data-print' + (c.print ? ' checked' : '') + '><span>Allow printing</span></label>'
        + '<button class="btn-text" type="button" data-save style="font-size:12px">Save settings</button></td>'
        + '<td style="white-space:nowrap"><a class="btn-text" target="_blank" rel="noopener" href="artifact.html?room=' + encodeURIComponent(cur.id) + '&id=' + encodeURIComponent(l.id) + '">Preview</a><br>'
        + (l.enabled ? '<button class="btn-text" type="button" data-off>Hide from members</button>' : '<button class="btn-text" type="button" data-on>Make visible…</button>')
        + '<br><button class="btn-text" type="button" data-unlink style="color:var(--fg-3)">Remove</button></td></tr>';
    }).join('') : '<tr><td colspan="5" style="color:var(--fg-3)">No interactive document in this room.</td></tr>';

    q('amArts').innerHTML = state.artifacts.length ? state.artifacts.map(function (a) {
      return '<tr data-art="' + a.id + '"><td><b>' + esc(a.title) + '</b><div class="mono" style="font-size:11px;color:var(--fg-3)">' + esc(a.slug) + '</div></td>'
        + '<td class="mono">' + (a.current_version ? 'v' + a.current_version + ' · ' + esc(day(a.updated_at)) : '—') + '</td>'
        + '<td style="min-width:260px"><div style="font-size:12px">HTML <input type="file" data-html accept=".html,text/html"></div><div style="font-size:12px;margin-top:4px">Data (JSON, optional) <input type="file" data-json accept=".json,application/json"></div>'
        + '<input type="text" data-note placeholder="Note (what changed)" style="width:100%;margin-top:4px;font-size:12px"><button class="btn-text" type="button" data-pub style="font-size:12px">Publish version</button></td>'
        + '<td>' + (linked[a.id] ? '<span style="font-size:12px;color:var(--fg-3)">in this room</span>' : '<button class="btn-text" type="button" data-link-art>Attach to this room</button>') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" style="color:var(--fg-3)">No interactive documents yet.</td></tr>';
    wire();
  }
  function rowLink(el) { return el.closest('[data-link]').getAttribute('data-link'); }
  function rowArt(el) { return el.closest('[data-art]').getAttribute('data-art'); }
  function after(p, okText) { return p.then(function (r) { if (r.error) { msg(er(r.error), 'err'); return; } msg(okText, 'ok'); load(); }); }
  function readText(f) { return new Promise(function (ok, ko) { var rd = new FileReader(); rd.onload = function () { ok(String(rd.result)); }; rd.onerror = ko; rd.readAsText(f); }); }
  function wire() {
    var L = q('amLinks'), T = q('amArts');
    [].forEach.call(L.querySelectorAll('[data-save]'), function (b) { b.addEventListener('click', function () {
      var tr = b.closest('tr'), pin = tr.querySelector('[data-pin]').value;
      after(call({ action: 'update_link', link_id: rowLink(b), pinned_version: pin ? Number(pin) : null, config: { hide: tr.querySelector('[data-hide]').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), watermark: tr.querySelector('[data-wm]').checked, print: tr.querySelector('[data-print]').checked } }), 'Settings saved.');
    }); });
    [].forEach.call(L.querySelectorAll('[data-on]'), function (b) { b.addEventListener('click', function () {
      // Explicit confirmation: the room name has to be typed.
      var typed = window.prompt('Members of “' + cur.name + '” will be able to open this document.\nType the room name to confirm:');
      if (typed == null) return;
      if (typed.trim().toLowerCase() !== String(cur.name).trim().toLowerCase()) { msg('The room name did not match; nothing changed.', 'err'); return; }
      after(call({ action: 'enable', link_id: rowLink(b), enabled: true, confirm: true }), 'Now visible to the room’s members.');
    }); });
    [].forEach.call(L.querySelectorAll('[data-off]'), function (b) { b.addEventListener('click', function () { after(call({ action: 'enable', link_id: rowLink(b), enabled: false }), 'Hidden from members.'); }); });
    [].forEach.call(L.querySelectorAll('[data-unlink]'), function (b) { b.addEventListener('click', function () {
      if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Click again to remove'; return; }
      after(call({ action: 'unlink', link_id: rowLink(b) }), 'Removed from the room.');
    }); });
    [].forEach.call(T.querySelectorAll('[data-link-art]'), function (b) { b.addEventListener('click', function () { after(call({ action: 'link', room_id: cur.id, artifact_id: rowArt(b) }), 'Attached — not visible to members until you enable it.'); }); });
    [].forEach.call(T.querySelectorAll('[data-pub]'), function (b) { b.addEventListener('click', function () {
      var tr = b.closest('tr'), h = tr.querySelector('[data-html]').files[0], j = tr.querySelector('[data-json]').files[0];
      if (!h) { msg(er('html-required'), 'err'); return; }
      b.disabled = true; msg('Publishing…');
      Promise.all([readText(h), j ? readText(j) : Promise.resolve('')]).then(function (x) {
        var data = {}; if (x[1]) { try { data = JSON.parse(x[1]); } catch (e) { throw new Error('The data file is not valid JSON.'); } }
        return call({ action: 'publish', artifact_id: rowArt(b), html: x[0], data: data, note: tr.querySelector('[data-note]').value.trim() });
      }).then(function (r) { b.disabled = false; if (r.error) { msg(er(r.error), 'err'); return; } msg('Published version ' + r.version + '.', 'ok'); load(); }, function (e) { b.disabled = false; msg(e.message, 'err'); });
    }); });
  }
  q('amCreate').addEventListener('click', function () {
    after(call({ action: 'create', room_id: cur.id, slug: q('amSlug').value.trim(), title: q('amTitleIn').value.trim(), description: q('amDesc').value.trim(), source_url: q('amSrc').value.trim() }), 'Created. Publish a first version, then attach it to the room.');
  });
  function open(id, name) { cur = { id: id, name: name }; q('amTitle').textContent = name; msg(''); wrap.hidden = false; load(); }

  // ---- room cards: add the Interactive button next to Documents ----
  function enhance() {
    [].forEach.call(document.querySelectorAll('#rooms [data-room]'), function (card) {
      var id = card.getAttribute('data-room'), edit = card.querySelector('[data-eroom]');
      if (edit && !card.querySelector('[data-arts]')) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Interactive'; b.setAttribute('data-arts', id);
        var title = card.querySelector('div[style*="font-display"]'), name = title ? title.childNodes[0].textContent : '';
        b.addEventListener('click', function () { open(id, name); });
        var after = card.querySelector('[data-docs]') || edit; after.parentNode.insertBefore(b, after.nextSibling);
      }
    });
  }
  var box = q('rooms');
  if (box) new MutationObserver(enhance).observe(box, { childList: true, subtree: true });
})();
