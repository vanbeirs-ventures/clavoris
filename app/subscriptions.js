/* Clavoris app — "Subscriptions" block on the account page (#subs).
   A subscription is a contract between Clavoris – Van Beirs Consult BV and the holder of a company account.
   - A company administrator sees the plan of their company account, its limits and current use, compares the
     plans and asks for another plan (Enterprise: a quote). Clavoris activates the change.
   - Every user sees the plan of the company accounts that invited them (read-only) and their own requests,
     and can ask to subscribe a company account of their own.
   Data: edge function clv-subscription (list / request). Texts in EN / NL / FR (profile language). */
(function () {
  'use strict';
  var T = {
    en: {
      title: 'Subscriptions', lead: 'Company accounts use Clavoris under a subscription: a contract between Clavoris – Van Beirs Consult BV and the holder of the company account, under the General Terms and Conditions.',
      yours: 'Your company account', plan: 'Plan', since: 'since {d}', use: 'Current use', of: '{u} of {l}', unl: '{u} · unlimited', notincl: 'not included',
      mod: { data_rooms: 'Data rooms', contracts: 'Contracts for signature', marketplace: 'Marketplace products', portfolio: 'Portfolio products', users: 'Users of the company account' },
      compare: 'Compare the plans', month: '/ month excl. VAT', quote: 'on quotation', free: 'free', wl: 'White label', yes: 'Yes', no: '—', unlimited: 'unlimited', current: 'Current plan',
      change: 'Ask for this plan', askquote: 'Request a quote', managed: 'Plans of the companies that invited you', managedHint: 'Managed by the company account; shown for information.',
      mine: 'Your requests', st: { requested: 'requested · Clavoris reviews it', quote_requested: 'quote requested · Clavoris contacts you', active: 'active', cancelled: 'ended' },
      newTitle: 'Subscribe a company account', newLead: 'For a company that wants to run its own data rooms, contracts or private placements on Clavoris. Clavoris reviews every request and sets up the company account.',
      fPlan: 'Plan', fCompany: 'Company name', fReg: 'Company registration number', fCountry: 'Country (2 letters)', fBilling: 'Billing e-mail', fMsg: 'Message (optional)', send: 'Send the request',
      sent: 'Request sent. You receive a confirmation by e-mail; Clavoris contacts you to activate the subscription.', sentQuote: 'Quote request sent. Clavoris contacts you shortly.',
      err: { 'company-required': 'Enter the company name.', 'email-required': 'Enter a valid billing e-mail address.', 'already-requested': 'A request for this company is already open.', generic: 'The request could not be sent ({e}).' },
      confirm: 'Ask Clavoris to change {company} to the {plan} plan?', none: 'No subscription yet.', edit: 'Company details', cName: 'Name', cForm: 'Legal form', cCountry: 'Country (2 letters)', cReg: 'Registration number', cMail: 'Contact e-mail', cSave: 'Save company details', cSaved: 'Company details saved.'
    },
    nl: {
      title: 'Abonnementen', lead: 'Bedrijfsaccounts gebruiken Clavoris met een abonnement: een overeenkomst tussen Clavoris – Van Beirs Consult BV en de houder van het bedrijfsaccount, onder de algemene voorwaarden.',
      yours: 'Uw bedrijfsaccount', plan: 'Plan', since: 'sinds {d}', use: 'Huidig gebruik', of: '{u} van {l}', unl: '{u} · onbeperkt', notincl: 'niet inbegrepen',
      mod: { data_rooms: 'Datarooms', contracts: 'Contracten ter ondertekening', marketplace: 'Producten op de marktplaats', portfolio: 'Portefeuilleproducten', users: 'Gebruikers van het bedrijfsaccount' },
      compare: 'De plannen vergelijken', month: '/ maand excl. btw', quote: 'op offerte', free: 'gratis', wl: 'White label', yes: 'Ja', no: '—', unlimited: 'onbeperkt', current: 'Huidig plan',
      change: 'Dit plan aanvragen', askquote: 'Offerte aanvragen', managed: 'Plannen van de ondernemingen die u uitnodigden', managedHint: 'Beheerd door het bedrijfsaccount; ter informatie getoond.',
      mine: 'Uw aanvragen', st: { requested: 'aangevraagd · Clavoris bekijkt ze', quote_requested: 'offerte aangevraagd · Clavoris neemt contact op', active: 'actief', cancelled: 'beëindigd' },
      newTitle: 'Een bedrijfsaccount abonneren', newLead: 'Voor een onderneming die haar eigen datarooms, contracten of private plaatsingen op Clavoris wil beheren. Clavoris bekijkt elke aanvraag en richt het bedrijfsaccount in.',
      fPlan: 'Plan', fCompany: 'Naam van de onderneming', fReg: 'Ondernemingsnummer', fCountry: 'Land (2 letters)', fBilling: 'Facturatie-e-mail', fMsg: 'Bericht (optioneel)', send: 'Aanvraag versturen',
      sent: 'Aanvraag verstuurd. U krijgt een bevestiging per e-mail; Clavoris neemt contact op om het abonnement te activeren.', sentQuote: 'Offerteaanvraag verstuurd. Clavoris neemt snel contact met u op.',
      err: { 'company-required': 'Vul de naam van de onderneming in.', 'email-required': 'Vul een geldig facturatie-e-mailadres in.', 'already-requested': 'Er loopt al een aanvraag voor deze onderneming.', generic: 'De aanvraag kon niet worden verstuurd ({e}).' },
      confirm: 'Clavoris vragen om {company} over te zetten naar het {plan}-plan?', none: 'Nog geen abonnement.', edit: 'Gegevens van de onderneming', cName: 'Naam', cForm: 'Rechtsvorm', cCountry: 'Land (2 letters)', cReg: 'Ondernemingsnummer', cMail: 'Contact-e-mail', cSave: 'Gegevens opslaan', cSaved: 'Gegevens van de onderneming opgeslagen.'
    },
    fr: {
      title: 'Abonnements', lead: 'Les comptes société utilisent Clavoris dans le cadre d\'un abonnement : un contrat entre Clavoris – Van Beirs Consult BV et le titulaire du compte société, régi par les conditions générales.',
      yours: 'Votre compte société', plan: 'Plan', since: 'depuis le {d}', use: 'Utilisation actuelle', of: '{u} sur {l}', unl: '{u} · illimité', notincl: 'non inclus',
      mod: { data_rooms: 'Data rooms', contracts: 'Contrats à signer', marketplace: 'Produits sur la place de marché', portfolio: 'Produits en portefeuille', users: 'Utilisateurs du compte société' },
      compare: 'Comparer les plans', month: '/ mois HTVA', quote: 'sur devis', free: 'gratuit', wl: 'Marque blanche', yes: 'Oui', no: '—', unlimited: 'illimité', current: 'Plan actuel',
      change: 'Demander ce plan', askquote: 'Demander un devis', managed: 'Plans des sociétés qui vous ont invité', managedHint: 'Géré par le compte société ; affiché pour information.',
      mine: 'Vos demandes', st: { requested: 'demandé · Clavoris l\'examine', quote_requested: 'devis demandé · Clavoris vous contacte', active: 'actif', cancelled: 'terminé' },
      newTitle: 'Abonner un compte société', newLead: 'Pour une société qui souhaite gérer ses propres data rooms, contrats ou placements privés sur Clavoris. Clavoris examine chaque demande et crée le compte société.',
      fPlan: 'Plan', fCompany: 'Nom de la société', fReg: 'Numéro d\'entreprise', fCountry: 'Pays (2 lettres)', fBilling: 'E-mail de facturation', fMsg: 'Message (facultatif)', send: 'Envoyer la demande',
      sent: 'Demande envoyée. Vous recevez une confirmation par e-mail ; Clavoris vous contacte pour activer l\'abonnement.', sentQuote: 'Demande de devis envoyée. Clavoris vous contacte rapidement.',
      err: { 'company-required': 'Indiquez le nom de la société.', 'email-required': 'Indiquez une adresse e-mail de facturation valide.', 'already-requested': 'Une demande est déjà ouverte pour cette société.', generic: 'La demande n\'a pas pu être envoyée ({e}).' },
      confirm: 'Demander à Clavoris de passer {company} au plan {plan} ?', none: 'Pas encore d\'abonnement.', edit: 'Données de la société', cName: 'Nom', cForm: 'Forme juridique', cCountry: 'Pays (2 lettres)', cReg: 'Numéro d\'entreprise', cMail: 'E-mail de contact', cSave: 'Enregistrer les données', cSaved: 'Données de la société enregistrées.'
    }
  };
  var NAME = { free: 'Free', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function q(id) { return document.getElementById(id); }
  function fill(s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? '' : v[k]; }); }

  function start() {
    var A = window.ClavorisAccess, I = window.ClavorisI18n, sec = q('subs');
    if (!A || !sec || !A.user || !A.user()) return;
    var t = T[I && I.lang] || T.en, p = A.profile() || {};
    var title = q('subsTitle'); if (title) title.textContent = t.title;
    var fmtDate = function (d) { return window.ClavorisShell ? window.ClavorisShell.fmtDate(d) : String(d || '').slice(0, 10); };
    var money = function (n) { return window.ClavorisShell ? window.ClavorisShell.fmtMoney(n, 'EUR') : '€ ' + n; };

    function limitTxt(v) { return v === null || v === undefined ? t.unlimited : String(v); }
    function planLimit(pl, m) { if (m === 'users') return pl.max_users; return Object.prototype.hasOwnProperty.call(pl.modules || {}, m) ? pl.modules[m] : 0; }

    function render(r) {
      var body = q('subsBody'), plans = r.plans || [], html = '<p style="font-size:13px;color:var(--fg-2);line-height:1.6">' + esc(t.lead) + '</p>';
      var mine = (r.subscriptions || []).filter(function (s) { return s.own && s.status !== 'active'; });
      var managed = (r.subscriptions || []).filter(function (s) { return s.status === 'active' && !(r.companies || []).some(function (c) { return c.id === s.company_id; }); });
      // 1. Own company account (company administrators).
      (r.companies || []).forEach(function (c) {
        html += '<div style="margin-top:16px;padding:14px 16px;border:1px solid var(--border);border-left:3px solid var(--seal-gold);border-radius:var(--r-md);background:var(--bg-raised)">'
          + '<p class="eyebrow">' + esc(t.yours) + '</p><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:baseline;margin-top:4px"><b style="font-size:15px;color:var(--clavis-navy)">' + esc(c.name) + '</b><span><span class="chip verified">' + esc(t.plan) + ' ' + esc(NAME[c.plan] || c.plan) + '</span>' + (c.since ? ' <span style="font-size:12px;color:var(--fg-3)">' + esc(fill(t.since, { d: fmtDate(c.since) })) + '</span>' : '') + '</span></div>'
          + '<p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);margin-top:12px">' + esc(t.use) + '</p>'
          + ['data_rooms', 'contracts', 'users'].map(function (m) {
            var l = c.limits[m], u = c.usage[m] || 0, pct = l === null ? 0 : l === 0 ? 100 : Math.min(100, Math.round(u * 100 / l));
            var txt = l === 0 ? t.notincl : l === null ? fill(t.unl, { u: u }) : fill(t.of, { u: u, l: l });
            return '<div style="margin-top:8px;font-size:13px"><div style="display:flex;justify-content:space-between"><span>' + esc(t.mod[m]) + '</span><span class="mono" style="font-size:12px">' + esc(txt) + '</span></div>'
              + (l === null || l === 0 ? '' : '<div style="height:5px;border-radius:3px;background:var(--border);margin-top:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? 'var(--status-alert,#b3261e)' : 'var(--clavis-navy)') + '"></div></div>') + '</div>';
          }).join('')
          // The company administrator keeps the company details up to date (name, legal form, country, number, contact).
          + '<details style="margin-top:12px"><summary style="cursor:pointer;font-size:13px;color:var(--clavis-navy)">' + esc(t.edit) + '</summary><form data-cform="' + esc(c.id) + '" autocomplete="off" onsubmit="return false;" style="max-width:520px;margin-top:6px">'
          + '<div class="field"><label>' + esc(t.cName) + '</label><input data-cf="name" type="text"></div><div class="field"><label>' + esc(t.cForm) + '</label><input data-cf="legal_form" type="text"></div>'
          + '<div class="field"><label>' + esc(t.cCountry) + '</label><input data-cf="country" type="text" maxlength="2" class="mono" style="max-width:90px;text-transform:uppercase"></div><div class="field"><label>' + esc(t.cReg) + '</label><input data-cf="registration_no" type="text" class="mono"></div>'
          + '<div class="field"><label>' + esc(t.cMail) + '</label><input data-cf="contact_email" type="email"></div><p class="msg" data-cmsg role="status"></p><button class="btn btn-primary" type="submit">' + esc(t.cSave) + '</button></form></details>'
          + '</div>';
      });
      // 2. Plan comparison (with "ask for this plan" for a company administrator).
      var own = (r.companies || [])[0];
      html += '<details style="margin-top:16px"' + (own ? '' : '') + '><summary style="cursor:pointer;font-weight:500;color:var(--clavis-navy);font-size:14px">' + esc(t.compare) + '</summary><div class="tbl-wrap" style="margin-top:10px"><table class="tbl"><thead><tr><th></th>'
        + plans.map(function (pl) { return '<th>' + esc(NAME[pl.code] || pl.code) + (own && own.plan === pl.code ? '<br><span class="chip verified" style="font-size:10.5px">' + esc(t.current) + '</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>'
        + '<tr><td></td>' + plans.map(function (pl) { return '<td><b>' + esc(pl.price_month_eur === null ? t.quote : Number(pl.price_month_eur) === 0 ? t.free : money(pl.price_month_eur)) + '</b>' + (pl.price_month_eur ? '<br><span style="font-size:11px;color:var(--fg-3)">' + esc(t.month) + '</span>' : '') + '</td>'; }).join('') + '</tr>'
        + ['users', 'data_rooms', 'contracts', 'marketplace', 'portfolio'].map(function (m) { return '<tr><td style="font-size:12.5px">' + esc(t.mod[m]) + '</td>' + plans.map(function (pl) { var v = planLimit(pl, m); return '<td class="mono" style="font-size:12.5px">' + esc(v === 0 ? t.no : limitTxt(v)) + '</td>'; }).join('') + '</tr>'; }).join('')
        + '<tr><td style="font-size:12.5px">' + esc(t.wl) + '</td>' + plans.map(function (pl) { return '<td>' + esc(pl.white_label ? t.yes : t.no) + '</td>'; }).join('') + '</tr>'
        + (own ? '<tr><td></td>' + plans.map(function (pl) { return '<td>' + (own.plan === pl.code ? '' : '<button class="btn-text" type="button" data-askplan="' + esc(pl.code) + '">' + esc(pl.code === 'enterprise' ? t.askquote : t.change) + '</button>') + '</td>'; }).join('') + '</tr>' : '')
        + '</tbody></table></div></details>';
      // 3. Plans of the companies that invited the user.
      if (managed.length) html += '<p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);margin-top:16px">' + esc(t.managed) + '</p>'
        + managed.map(function (s) { return '<div style="font-size:13px;margin-top:6px">' + esc(s.company) + ' · <span class="chip neutral">' + esc(NAME[s.plan] || s.plan) + '</span></div>'; }).join('')
        + '<p style="font-size:12px;color:var(--fg-3);margin-top:4px">' + esc(t.managedHint) + '</p>';
      // 4. Own requests.
      if (mine.length) html += '<p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--fg-3);margin-top:16px">' + esc(t.mine) + '</p>'
        + mine.map(function (s) { return '<div style="font-size:13px;margin-top:6px">' + esc(s.company) + ' · ' + esc(NAME[s.plan] || s.plan) + ' · <span class="chip pending">' + esc(t.st[s.status] || s.status) + '</span> <span style="font-size:12px;color:var(--fg-3)">' + esc(fmtDate(s.since)) + '</span></div>'; }).join('');
      // 5. Subscribe a (new) company account — not for an existing company administrator.
      if (!own) {
        html += '<details style="margin-top:16px"><summary style="cursor:pointer;font-weight:500;color:var(--clavis-navy);font-size:14px">' + esc(t.newTitle) + '</summary>'
          + '<p style="font-size:13px;color:var(--fg-2);line-height:1.6;margin-top:8px">' + esc(t.newLead) + '</p>'
          + '<form id="subForm" autocomplete="off" onsubmit="return false;" style="max-width:520px;margin-top:6px">'
          + '<div class="field"><label for="sfPlan">' + esc(t.fPlan) + '</label><select id="sfPlan">' + plans.filter(function (pl) { return pl.code !== 'free'; }).map(function (pl) { return '<option value="' + esc(pl.code) + '">' + esc(NAME[pl.code] || pl.code) + ' · ' + esc(pl.price_month_eur === null ? t.quote : money(pl.price_month_eur) + ' ' + t.month) + '</option>'; }).join('') + '</select></div>'
          + '<div class="field"><label for="sfCompany">' + esc(t.fCompany) + '</label><input id="sfCompany" type="text" autocomplete="organization" value="' + esc(p.company || '') + '"></div>'
          + '<div class="field"><label for="sfReg">' + esc(t.fReg) + '</label><input id="sfReg" type="text" class="mono"></div>'
          + '<div class="field"><label for="sfCountry">' + esc(t.fCountry) + '</label><input id="sfCountry" type="text" maxlength="2" class="mono" style="max-width:90px;text-transform:uppercase"></div>'
          + '<div class="field"><label for="sfBilling">' + esc(t.fBilling) + '</label><input id="sfBilling" type="email" value="' + esc((A.user() || {}).email || '') + '"></div>'
          + '<div class="field"><label for="sfMsg">' + esc(t.fMsg) + '</label><textarea id="sfMsg" rows="3" maxlength="1000" style="width:100%;font:inherit;font-size:13.5px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--bg-raised)"></textarea></div>'
          + '<p class="msg" id="sfOut" role="status"></p><button class="btn btn-primary" type="submit" id="sfSend">' + esc(t.send) + '</button></form></details>';
      }
      if (!(r.companies || []).length && !managed.length && !mine.length) html += '<p style="font-size:13px;color:var(--fg-3);margin-top:12px">' + esc(t.none) + '</p>';
      body.innerHTML = html;

      [].forEach.call(body.querySelectorAll('[data-askplan]'), function (b) {
        b.addEventListener('click', function () {
          var plan = b.getAttribute('data-askplan');
          if (!window.confirm(fill(t.confirm, { company: own.name, plan: NAME[plan] || plan }))) return;
          b.disabled = true;
          A.callFn('clv-subscription', { action: 'request', plan: plan, company_id: own.id, billing_email: (A.user() || {}).email }).then(function (x) {
            if (x && x.ok) { load(); return; }
            b.disabled = false; window.alert(t.err[x && x.error] || fill(t.err.generic, { e: (x && x.error) || '' }));
          });
        });
      });
      [].forEach.call(body.querySelectorAll('[data-cform]'), function (form) {
        var id = form.getAttribute('data-cform'), msg = form.querySelector('[data-cmsg]');
        A.callFn('clv-admin-rooms', { action: 'companies' }).then(function (x) {
          var c = ((x && x.companies) || []).filter(function (k) { return k.id === id; })[0]; if (!c) return;
          [].forEach.call(form.querySelectorAll('[data-cf]'), function (i) { i.value = c[i.getAttribute('data-cf')] || ''; });
        });
        form.addEventListener('submit', function () {
          var row = { id: id }; [].forEach.call(form.querySelectorAll('[data-cf]'), function (i) { row[i.getAttribute('data-cf')] = i.value; });
          msg.className = 'msg'; msg.textContent = '';
          A.callFn('clv-admin-rooms', { action: 'save_company', company: row }).then(function (x) {
            if (x && x.ok) { msg.className = 'msg ok'; msg.textContent = t.cSaved; return; }
            msg.className = 'msg err'; msg.textContent = fill(t.err.generic, { e: (x && x.error) || '' });
          });
        });
      });
      var f = q('subForm');
      if (f) f.addEventListener('submit', function () {
        var out = q('sfOut'); out.className = 'msg'; out.textContent = ''; q('sfSend').disabled = true;
        A.callFn('clv-subscription', { action: 'request', plan: q('sfPlan').value, company_name: q('sfCompany').value, registration_no: q('sfReg').value, country: q('sfCountry').value, billing_email: q('sfBilling').value, message: q('sfMsg').value }).then(function (x) {
          q('sfSend').disabled = false;
          if (x && x.ok) { out.className = 'msg ok'; out.textContent = x.status === 'quote_requested' ? t.sentQuote : t.sent; setTimeout(load, 1500); return; }
          out.className = 'msg err'; out.textContent = t.err[x && x.error] || fill(t.err.generic, { e: (x && x.error) || '' });
        });
      });
    }
    function load() { return A.callFn('clv-subscription', { action: 'list' }).then(function (r) { if (r && r.ok) { sec.hidden = false; render(r); if (location.hash === '#subs' && sec._open) { sec._open(); sec.scrollIntoView(); } } }); }
    load();
  }
  // The account page signals readiness through ClavorisAccess.ready; the block loads after it.
  function wait() { var A = window.ClavorisAccess; if (A && A.ready) A.ready(function () { setTimeout(start, 50); }); else setTimeout(wait, 100); }
  wait();
})();
