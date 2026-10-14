/* Clavoris admin — data-room documents.
   Adds a "Documents" button to every data room in Admin › Data rooms. The company that owns the room
   uploads its PDFs there (PDF only, max 25 MB each, optional sub-folders); the storage location is
   created automatically from the room name and never shown. Files go through clv-room-docs.
   Also: "+ New user" is reserved to Clavoris (super) — company admins add people by inviting them
   to a data room. Loaded after admin.js. */
(function () {
  'use strict';
  var A = window.ClavorisAccess;
  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function size(n) { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function day(s) { if (!s) return '—'; var d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  var MAX = 25 * 1024 * 1024;
  var ERR = { 'pdf-only': 'Only PDF files are accepted.', 'too-large': 'The file is larger than 25 MB.', 'storage-not-configured': 'Document storage is not connected yet (Document storage › Connect).', 'bad-folder': 'This folder name cannot be used.', 'not-found': 'You can only manage documents of your own company’s data rooms.' };

  // ---- modal ----
  var wrap = document.createElement('div');
  wrap.className = 'scrim'; wrap.id = 'docsModal'; wrap.hidden = true;
  wrap.innerHTML = '<div class="modal modal-wide" role="dialog" aria-labelledby="dmTitle">'
    + '<div class="modal-head"><div><div class="e">Data room documents</div><div class="t" id="dmTitle"></div></div><button type="button" id="dmClose" aria-label="Close">×</button></div>'
    + '<div class="modal-body">'
    + '<p class="hint" style="margin:0 0 12px;font-size:12.5px;line-height:1.6">PDF only, up to 25 MB per file. Members see the documents after signing the room’s NDA; every download is watermarked with their name and logged. Members are told about new and updated files by e-mail (within 15 minutes).</p>'
    + '<div class="g3" style="align-items:end">'
    + '<div class="field" style="margin-top:0"><label for="dmFolder">Folder</label><select id="dmFolder"></select></div>'
    + '<div class="field" style="margin-top:0"><label for="dmNew">or new folder</label><input id="dmNew" type="text" placeholder="e.g. 01 Financials"></div>'
    + '<div class="field" style="margin-top:0"><label for="dmFiles">PDF files</label><input id="dmFiles" type="file" accept="application/pdf,.pdf" multiple></div>'
    + '</div>'
    + '<p class="msg" id="dmMsg" role="status"></p>'
    + '<button class="btn btn-primary" type="button" id="dmUpload">Upload</button>'
    + '<div class="tbl-wrap" style="margin-top:18px"><table class="tbl"><thead><tr><th>Document</th><th>Size</th><th>Updated</th><th></th></tr></thead><tbody id="dmRows"></tbody></table></div>'
    + '</div></div>';
  document.body.appendChild(wrap);
  var cur = null; // { id, name }
  q('dmClose').addEventListener('click', function () { wrap.hidden = true; });

  function msg(text, kind) { var m = q('dmMsg'); m.className = 'msg' + (kind ? ' ' + kind : ''); m.textContent = text || ''; }
  function load() {
    q('dmRows').innerHTML = '<tr><td colspan="4" style="color:var(--fg-3)">Loading…</td></tr>';
    return A.callFn('clv-room-docs', { action: 'list', room_id: cur.id }).then(function (r) {
      if (r.error) { q('dmRows').innerHTML = ''; msg(ERR[r.error] || r.error, 'err'); return; }
      var items = r.items || [], dirs = items.filter(function (x) { return x.dir; }), files = items.filter(function (x) { return !x.dir; });
      var sel = q('dmFolder'), keep = sel.value;
      sel.innerHTML = '<option value="">(main folder)</option>' + dirs.map(function (d) { return '<option value="' + esc(d.path) + '">' + esc(d.path) + '</option>'; }).join('');
      if (keep && dirs.some(function (d) { return d.path === keep; })) sel.value = keep;
      q('dmRows').innerHTML = files.length ? files.map(function (f) {
        var pdf = /\.pdf$/i.test(f.name);
        return '<tr><td>' + esc(f.path) + (pdf ? '' : ' <span class="chip alert" title="Not shown to members: data rooms deliver PDF only">not a PDF</span>') + '</td>'
          + '<td class="mono">' + esc(size(f.size)) + '</td><td class="mono">' + esc(day(f.modified)) + '</td>'
          + '<td><button class="btn-text" type="button" data-del="' + esc(f.path) + '">Delete</button></td></tr>';
      }).join('') : '<tr><td colspan="4" style="color:var(--fg-3)">No documents yet.</td></tr>';
      [].forEach.call(q('dmRows').querySelectorAll('[data-del]'), function (b) {
        b.addEventListener('click', function () {
          var p = b.getAttribute('data-del');
          if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = 'Click again to delete'; return; }
          b.disabled = true;
          A.callFn('clv-room-docs', { action: 'delete', room_id: cur.id, path: p }).then(function (x) { if (x.error) { msg(ERR[x.error] || x.error, 'err'); b.disabled = false; return; } msg('Deleted: ' + p, 'ok'); load(); });
        });
      });
    });
  }
  function readB64(f) { return new Promise(function (ok, ko) { var rd = new FileReader(); rd.onload = function () { ok(String(rd.result).split(',')[1]); }; rd.onerror = ko; rd.readAsDataURL(f); }); }
  q('dmUpload').addEventListener('click', function () {
    var files = [].slice.call(q('dmFiles').files || []);
    if (!files.length) { msg('Choose one or more PDF files.', 'err'); return; }
    var bad = files.filter(function (f) { return !/\.pdf$/i.test(f.name) || (f.type && f.type !== 'application/pdf'); });
    if (bad.length) { msg('Only PDF files are accepted: ' + bad.map(function (f) { return f.name; }).join(', '), 'err'); return; }
    var big = files.filter(function (f) { return f.size > MAX; });
    if (big.length) { msg('Larger than 25 MB: ' + big.map(function (f) { return f.name; }).join(', '), 'err'); return; }
    var folder = q('dmNew').value.trim() || q('dmFolder').value;
    q('dmUpload').disabled = true;
    var done = 0, failed = [];
    files.reduce(function (p, f) {
      return p.then(function () {
        msg('Uploading ' + (done + failed.length + 1) + ' of ' + files.length + ': ' + f.name + '…');
        return readB64(f).then(function (b64) { return A.callFn('clv-room-docs', { action: 'upload', room_id: cur.id, name: f.name, folder: folder, file_base64: b64 }); })
          .then(function (r) { if (r.error) failed.push(f.name + ' (' + (ERR[r.error] || r.error) + ')'); else done++; }, function () { failed.push(f.name); });
      });
    }, Promise.resolve()).then(function () {
      q('dmUpload').disabled = false; q('dmFiles').value = ''; q('dmNew').value = '';
      msg(done + ' uploaded' + (failed.length ? '; failed: ' + failed.join(', ') : '.'), failed.length ? 'err' : 'ok');
      load();
    });
  });
  function open(id, name) { cur = { id: id, name: name }; q('dmTitle').textContent = name; msg(''); q('dmFiles').value = ''; q('dmNew').value = ''; wrap.hidden = false; load(); }

  // ---- room cards: add the Documents button, hide the storage path ----
  function enhance() {
    [].forEach.call(document.querySelectorAll('#rooms [data-room]'), function (card) {
      var id = card.getAttribute('data-room');
      var edit = card.querySelector('[data-eroom]');
      if (edit && !card.querySelector('[data-docs]')) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Documents'; b.setAttribute('data-docs', id);
        var title = card.querySelector('div[style*="font-display"]');
        var name = title ? title.childNodes[0].textContent : '';
        b.addEventListener('click', function () { open(id, name); });
        edit.parentNode.insertBefore(b, edit.nextSibling);
      }
      var sub = card.querySelector('.mono');
      if (sub && /Documents\/Clavoris\/| · — · /.test(sub.textContent)) sub.textContent = sub.textContent.replace(/ · Documents\/Clavoris\/[^·]*?(?= · )/, '').replace(/ · —(?= · )/, '');
    });
  }
  var box = q('rooms');
  if (box) new MutationObserver(enhance).observe(box, { childList: true, subtree: true });

  // ---- accounts are created by Clavoris only ----
  A.ready(function () { var nu = q('newUser'); if (nu && !A.isSuper()) nu.hidden = true; });
})();
