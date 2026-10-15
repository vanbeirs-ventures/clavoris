/* Clavoris admin console — "Subscriptions" (Clavoris super admins only).
   Open requests (plan requests and Enterprise quote requests) with Activate / Turn down, and every company
   account with its plan, limits and current use, with a direct plan change. Data: clv-subscription
   (admin_list, activate, set_plan, cancel). Texts in EN / NL / FR. */
(function () {
  'use strict';
  var T = {
    en: { title: 'Subscriptions', lead: 'Company-account subscriptions: contracts between Clavoris – Van Beirs Consult BV and the company account holder. Activating a request for a new company creates the company account.', open: 'Open requests', none: 'No open requests.', companies: 'Company accounts and plans', company: 'Company', plan: 'Plan', use: 'Use (rooms · contracts · users)', req: 'Requested', by: 'by', activate: 'Activate', decline: 'Turn down', makeAdmin: 'make the requester administrator of the company account', setPlan: 'Set plan', confirmDecline: 'Turn down this request?', confirmPlan: 'Put {company} on the {plan} plan?', quote: 'quote', done: 'Saved.', err: 'Could not save ({e}).', unl: '∞', reg: 'Reg. no.', billing: 'Billing', msg: 'Message' },
    nl: { title: 'Abonnementen', lead: 'Abonnementen van bedrijfsaccounts: overeenkomsten tussen Clavoris – Van Beirs Consult BV en de houder van het bedrijfsaccount. Het activeren van een aanvraag voor een nieuwe onderneming maakt het bedrijfsaccount aan.', open: 'Openstaande aanvragen', none: 'Geen openstaande aanvragen.', companies: 'Bedrijfsaccounts en plannen', company: 'Onderneming', plan: 'Plan', use: 'Gebruik (datarooms · contracten · gebruikers)', req: 'Aangevraagd', by: 'door', activate: 'Activeren', decline: 'Weigeren', makeAdmin: 'de aanvrager beheerder van het bedrijfsaccount maken', setPlan: 'Plan instellen', confirmDecline: 'Deze aanvraag weigeren?', confirmPlan: '{company} op het {plan}-plan zetten?', quote: 'offerte', done: 'Opgeslagen.', err: 'Opslaan mislukt ({e}).', unl: '∞', reg: 'Ond.nr.', billing: 'Facturatie', msg: 'Bericht' },
    fr: { title: 'Abonnements', lead: 'Abonnements des comptes société : contrats entre Clavoris – Van Beirs Consult BV et le titulaire du compte société. L\'activation d\'une demande pour une nouvelle société crée le compte société.', open: 'Demandes ouvertes', none: 'Aucune demande ouverte.', companies: 'Comptes société et plans', company: 'Société', plan: 'Plan', use: 'Utilisation (data rooms · contrats · utilisateurs)', req: 'Demandé', by: 'par', activate: 'Activer', decline: 'Refuser', makeAdmin: 'faire du demandeur l\'administrateur du compte société', setPlan: 'Définir le plan', confirmDecline: 'Refuser cette demande ?', confirmPlan: 'Passer {company} au plan {plan} ?', quote: 'devis', done: 'Enregistré.', err: 'Enregistrement impossible ({e}).', unl: '∞', reg: 'N° ent.', billing: 'Facturation', msg: 'Message' }
  };
  var NAME = { free: 'Free', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : v[k]; }); }

  function start() {
    var A = window.ClavorisAccess, I = window.ClavorisI18n, p = A.profile() || {};
    if (p.role !== 'super' || document.getElementById('subscriptions')) return;
    var t = T[I && I.lang] || T.en;
    var anchor = document.getElementById('companies'); if (!anchor) return;
    var h = document.createElement('h2'); h.id = 'subscriptions'; h.style.cssText = 'font-family:var(--font-display);font-size:24px;color:var(--clavis-navy);margin-top:44px'; h.textContent = t.title;
    var box = document.createElement('div'); box.id = 'subsAdmin';
    anchor.parentNode.insertBefore(h, anchor); anchor.parentNode.insertBefore(box, anchor);
    var fmt = function (d) { return window.ClavorisShell ? window.ClavorisShell.fmtDate(d) : String(d || '').slice(0, 10); };
    function lim(v) { return v === null || v === undefined ? t.unl : v; }

    function load() {
      A.callFn('clv-subscription', { action: 'admin_list' }).then(function (r) {
        if (!r || !r.ok) { box.innerHTML = '<p class="msg err">' + esc(fill(t.err, { e: (r && r.error) || '' })) + '</p>'; return; }
        var open = (r.subscriptions || []).filter(function (s) { return s.status === 'requested' || s.status === 'quote_requested'; });
        var plans = r.plans || [];
        box.innerHTML = '<p class="page-sub" style="margin-top:4px">' + esc(t.lead) + '</p>'
          + '<p class="eyebrow" style="margin-top:16px">' + esc(t.open) + '</p>'
          + (open.length ? '<div class="card tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>' + esc(t.company) + '</th><th>' + esc(t.plan) + '</th><th>' + esc(t.req) + '</th><th></th></tr></thead><tbody>'
            + open.map(function (s) {
              var q = s.request || {};
              return '<tr><td><b>' + esc(s.company) + '</b><div style="font-size:12px;color:var(--fg-3)">' + esc([q.registration_no ? t.reg + ' ' + q.registration_no : '', q.country, q.billing_email ? t.billing + ': ' + q.billing_email : ''].filter(Boolean).join(' · ')) + '</div>' + (q.message ? '<div style="font-size:12px;color:var(--fg-2);margin-top:2px">' + esc(t.msg) + ': ' + esc(q.message) + '</div>' : '') + '</td>'
                + '<td>' + esc(NAME[s.plan] || s.plan) + (s.status === 'quote_requested' ? ' <span class="chip pending">' + esc(t.quote) + '</span>' : '') + '</td>'
                + '<td style="font-size:12.5px">' + esc(fmt(s.created_at)) + '<div style="color:var(--fg-3)">' + esc(t.by) + ' ' + esc(q.requested_by_name || q.requested_by_email || '—') + '</div></td>'
                + '<td style="white-space:nowrap">' + (!s.company_id ? '<label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--fg-2);margin-bottom:6px"><input type="checkbox" data-mkadmin="' + esc(s.id) + '" checked> ' + esc(t.makeAdmin) + '</label>' : '')
                + '<button class="btn btn-primary" type="button" data-act="' + esc(s.id) + '" style="padding:6px 14px">' + esc(t.activate) + '</button> <button class="btn-text" type="button" data-dec="' + esc(s.id) + '">' + esc(t.decline) + '</button></td></tr>';
            }).join('') + '</tbody></table></div>' : '<p style="font-size:13px;color:var(--fg-3);margin-top:6px">' + esc(t.none) + '</p>')
          + '<p class="eyebrow" style="margin-top:20px">' + esc(t.companies) + '</p>'
          + '<div class="card tbl-wrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>' + esc(t.company) + '</th><th>' + esc(t.plan) + '</th><th>' + esc(t.use) + '</th><th></th></tr></thead><tbody>'
          + (r.companies || []).map(function (c) {
            return '<tr><td><b>' + esc(c.name) + '</b>' + (c.since ? '<div style="font-size:12px;color:var(--fg-3)">' + esc(fmt(c.since)) + '</div>' : '') + '</td>'
              + '<td><select data-plansel="' + esc(c.id) + '" style="font:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-raised)">' + plans.map(function (pl) { return '<option value="' + esc(pl.code) + '"' + (pl.code === c.plan ? ' selected' : '') + '>' + esc(NAME[pl.code] || pl.code) + '</option>'; }).join('') + '</select></td>'
              + '<td class="mono" style="font-size:12.5px">' + ['data_rooms', 'contracts', 'users'].map(function (m) { var over = c.limits[m] !== null && c.usage[m] > c.limits[m]; return '<span style="' + (over ? 'color:var(--status-alert,#b3261e);font-weight:600' : '') + '">' + esc((c.usage[m] || 0) + '/' + lim(c.limits[m])) + '</span>'; }).join(' · ') + '</td>'
              + '<td><button class="btn-text" type="button" data-setplan="' + esc(c.id) + '" data-cname="' + esc(c.name) + '">' + esc(t.setPlan) + '</button></td></tr>';
          }).join('') + '</tbody></table></div><p class="msg" id="subsAdminMsg" role="status"></p>';
        function after(x) { var m = document.getElementById('subsAdminMsg'); if (x && x.ok) { load(); return; } if (m) { m.className = 'msg err'; m.textContent = fill(t.err, { e: (x && x.error) || '' }); } }
        [].forEach.call(box.querySelectorAll('[data-act]'), function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-act'), mk = box.querySelector('[data-mkadmin="' + id + '"]'); b.disabled = true; A.callFn('clv-subscription', { action: 'activate', id: id, make_admin: mk ? mk.checked : false }).then(after); }); });
        [].forEach.call(box.querySelectorAll('[data-dec]'), function (b) { b.addEventListener('click', function () { if (!window.confirm(t.confirmDecline)) return; b.disabled = true; A.callFn('clv-subscription', { action: 'cancel', id: b.getAttribute('data-dec') }).then(after); }); });
        [].forEach.call(box.querySelectorAll('[data-setplan]'), function (b) { b.addEventListener('click', function () { var id = b.getAttribute('data-setplan'), sel = box.querySelector('[data-plansel="' + id + '"]'); if (!window.confirm(fill(t.confirmPlan, { company: b.getAttribute('data-cname'), plan: NAME[sel.value] || sel.value }))) return; b.disabled = true; A.callFn('clv-subscription', { action: 'set_plan', company_id: id, plan: sel.value }).then(after); }); });
        if (location.hash === '#subscriptions') h.scrollIntoView();
      });
    }
    load();
  }
  function wait() { var A = window.ClavorisAccess; if (A && A.ready) A.ready(function () { setTimeout(start, 300); }); else setTimeout(wait, 100); }
  wait();
})();
