/* ============================================================
   CLAVORIS — Access engine (Supabase-backed)
   Ported from the Minerva cloud engine (assets/vip.js) and reduced
   to what Clavoris needs. Exposes window.ClavorisAccess.

   - Auth        -> supabase.auth (JWT session, recovery / invite links)
   - Profile     -> public.clv_profiles (RLS: own row, or any row for admins)
   - Admin ops   -> edge functions clv-admin-* (service role, server-side checks)

   Clearance:  super ⊃ admin ⊃ user(verified) ⊃ user(other status) ⊃ anonymous
   Status:     registered → kyc_pending → verified | kyc_retry | rejected | suspended

   Page gating: add <body data-clv-restrict="full"> plus the head guard
     <script>document.documentElement.classList.add('clv-checking');</script>
     <style>html.clv-checking body[data-clv-restrict] main{visibility:hidden}</style>
   and the engine reveals <main> only for a session that may see the page
   (data-clv-restrict="full" = any signed-in user; "verified" = KYC verified
   or staff; "admin" = admin or super). Anyone else is sent to login.html.

   Requires window.CLAVORIS_SUPABASE (app/config.js) and supabase-js v2
   loaded before this file.
   ============================================================ */
(function () {
  'use strict';
  if (window.ClavorisAccess) return;

  var CFG = window.CLAVORIS_SUPABASE || {};
  var sb = null;
  try {
    if (window.supabase && CFG.url && CFG.anonKey) {
      sb = window.supabase.createClient(CFG.url, CFG.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
  } catch (e) { sb = null; }

  var PROFILE_SEL = 'id, email, full_name, company, job_title, legal_rep, mobile, lang, role, status, kyc_level, kyc_review_answer, last_login_at, created_at, features, notify';

  /* ---------------- cached session state ---------------- */
  var _user = null;      // supabase auth user
  var _profile = null;   // the caller's clv_profiles row
  var _ready = false;
  var _waiters = [];

  function markReady() { _ready = true; var w = _waiters.slice(); _waiters.length = 0; w.forEach(function (f) { try { f(); } catch (e) {} }); }
  function whenReady(fn) { if (_ready) return fn(); _waiters.push(fn); }
  function reset() { _user = null; _profile = null; }

  // Reads the session and the caller's profile into the cache. Single-flight: concurrent callers share
  // one request. A failed read (token refresh in flight in another tab, auth lock contention, a dropped
  // request) is retried with back-off and never clears a cached session: the cache is only cleared when
  // the auth library definitively reports "no session". Being signed out is a fact, not a timeout.
  var _inflight = null, _lastErr = '';
  function refreshSession(maxAttempts) {
    if (!sb) { reset(); return Promise.resolve(); }
    if (_inflight) return _inflight;
    maxAttempts = maxAttempts || 2;
    var attempt = 0;
    function once() {
      return sb.auth.getSession().then(function (res) {
        if (res && res.error) throw res.error;
        var session = res && res.data ? res.data.session : null;
        if (!session || !session.user) { reset(); return; }
        _user = session.user;
        return sb.from('clv_profiles').select(PROFILE_SEL).eq('id', session.user.id).maybeSingle().then(function (pr) {
          if (pr && pr.error) { if (!_profile) throw pr.error; return; } // keep the cached profile on a transient error
          _profile = pr && pr.data ? pr.data : null;
        });
      }).catch(function (e) {
        _lastErr = (e && e.message) || String(e);
        attempt += 1;
        if (attempt >= maxAttempts) return; // keep whatever is cached
        return new Promise(function (r) { setTimeout(r, 500 * Math.pow(2, attempt - 1)); }).then(once);
      });
    }
    _inflight = once().then(function () { _inflight = null; }, function () { _inflight = null; });
    return _inflight;
  }
  // A session persisted by the auth library on this device (the page may simply not have read it yet).
  function hasStoredSession() {
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true; } } catch (e) {}
    return false;
  }

  /* ---------------- getters (sync, read the cache) ---------------- */
  function user() { return _user; }
  function profile() { return _profile; }
  function role() { return _profile ? _profile.role : null; }
  function status() { return _profile ? _profile.status : null; }
  function isSignedIn() { return !!_user; }
  function isSuper() { return role() === 'super'; }
  function isAdmin() { return role() === 'admin' || role() === 'super'; }
  function isSuspended() { return status() === 'suspended'; }
  function isVerified() { return status() === 'verified'; }
  // Clearance for a restriction level (see header).
  function clears(level) {
    if (!_user || !_profile || isSuspended()) return false;
    if (level === 'admin') return isAdmin();
    if (level === 'verified') return isAdmin() || isVerified();
    return true; // 'full' — any signed-in, non-suspended user
  }
  function displayName() { return (_profile && _profile.full_name) || (_user && _user.email) || ''; }
  // Profile completeness (same rule as the server): a real name; for an organisation account also
  // the role and the legal-representative answer (true/false).
  function profileComplete(p) {
    p = p || _profile || {};
    if (!String(p.full_name || '').trim()) return false;
    if (String(p.company || '').trim()) return !!String(p.job_title || '').trim() && typeof p.legal_rep === 'boolean';
    return true;
  }
  // Typed-name comparison for signatures: case, accents and extra spaces do not count.
  function sameName(a, b) {
    function n(s) { return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
    return n(a) !== '' && n(a) === n(b);
  }
  function initials() {
    return displayName().split(/\s+/).map(function (w) { return w[0] || ''; }).slice(0, 2).join('').toUpperCase() || 'C';
  }
  function homeFor(p) { p = p || _profile; return (p && (p.role === 'admin' || p.role === 'super')) ? 'admin.html' : 'portal.html'; }

  /* ---------------- auth actions (async) ---------------- */
  // Sign in with email + password. Resolves {ok, reason?, profile?}.
  // reasons: invalid | no-profile | suspended | rejected
  function signIn(email, pw) {
    if (!sb) return Promise.resolve({ ok: false, reason: 'unavailable' });
    return sb.auth.signInWithPassword({ email: String(email || '').trim(), password: pw || '' })
      .then(function (res) {
        if (res.error || !res.data || !res.data.user) return { ok: false, reason: 'invalid' };
        return sb.from('clv_profiles').select(PROFILE_SEL).eq('id', res.data.user.id).maybeSingle().then(function (pr) {
          var p = pr && pr.data ? pr.data : null;
          if (!p) return sb.auth.signOut().then(function () { return { ok: false, reason: 'no-profile' }; });
          if (p.status === 'suspended') return sb.auth.signOut().then(function () { return { ok: false, reason: 'suspended' }; });
          if (p.status === 'rejected') return sb.auth.signOut().then(function () { return { ok: false, reason: 'rejected' }; });
          return refreshSession().then(function () {
            // best-effort: stamp the login (own-row update policy)
            try { sb.from('clv_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', p.id).then(function () {}); } catch (e) {}
            // audit trail: server-side login record (IP + user agent captured there)
            try { callFn('clv-audit', { action: 'login' }).catch(function () {}); } catch (e) {}
            return { ok: true, profile: p };
          });
        });
      }).catch(function () { return { ok: false, reason: 'invalid' }; });
  }

  function signOut() {
    if (!sb) { reset(); return Promise.resolve(); }
    return sb.auth.signOut().then(reset, reset);
  }

  // Send a password-recovery email from noreply@clavoris.com (edge function
  // clv-auth-mail generates the one-time link; it lands on reset.html).
  function requestPasswordReset(email) {
    return callFn('clv-auth-mail', { action: 'recovery', email: String(email || '').trim() })
      .then(function (r) { return { ok: !!r.ok, error: r.error }; });
  }
  // Exchange a recovery token hash (from a Clavoris recovery mail) for a session.
  function verifyRecovery(tokenHash) {
    if (!sb) return Promise.resolve({ ok: false, error: 'unavailable' });
    return sb.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash }).then(function (res) {
      if (res.error) return { ok: false, error: res.error.message };
      return refreshSession().then(function () { return { ok: isSignedIn() }; });
    });
  }
  // Set a new password for the current session (after recovery link or from account page).
  function updatePassword(newPw) {
    if (!sb) return Promise.resolve({ ok: false });
    return sb.auth.updateUser({ password: newPw }).then(function (res) { return { ok: !res.error, error: res.error && res.error.message }; });
  }
  // Re-authenticate (used by the account page before a password change).
  function verifyPassword(pw) {
    if (!sb || !_user) return Promise.resolve(false);
    return sb.auth.signInWithPassword({ email: _user.email, password: pw || '' }).then(function (r) { return !r.error; }, function () { return false; });
  }
  // Update own profile fields (RLS: own row only).
  function updateProfile(fields) {
    if (!sb || !_user) return Promise.resolve({ ok: false });
    var allowed = {}; ['full_name', 'company', 'job_title', 'legal_rep', 'mobile', 'lang', 'notify'].forEach(function (k) { if (k in fields) allowed[k] = fields[k]; });
    return sb.from('clv_profiles').update(allowed).eq('id', _user.id).then(function (res) {
      if (res.error) return { ok: false, error: res.error.message };
      return refreshSession().then(function () { return { ok: true }; });
    });
  }
  // Call an edge function with the caller's JWT.
  function callFn(name, body) {
    if (!sb) return Promise.resolve({ ok: false, error: 'unavailable' });
    return sb.auth.getSession().then(function (r) {
      var token = r && r.data && r.data.session ? r.data.session.access_token : CFG.anonKey;
      return fetch(CFG.url + '/functions/v1/' + name, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'apikey': CFG.anonKey, 'authorization': 'Bearer ' + token },
        body: JSON.stringify(body || {})
      }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { if (!res.ok && !b.error) b.error = 'http-' + res.status; return b; }); });
    });
  }
  function client() { return sb; }

  /* ---------------- page gating ---------------- */
  var _gateRetried = false;
  function gate() {
    var level = document.body && document.body.getAttribute('data-clv-restrict');
    if (!level) { document.documentElement.classList.remove('clv-checking'); return; }
    if (clears(level)) { document.documentElement.classList.remove('clv-checking'); document.documentElement.classList.add('clv-cleared'); return; }
    // A session is stored on this device but could not be read yet (auth lock held by another tab, refresh
    // in flight): keep the page hidden and try again for a few seconds before concluding "signed out".
    if ((!_user || !_profile) && hasStoredSession() && !_gateRetried) { _gateRetried = true; return refreshSession(5).then(gate); }
    document.documentElement.classList.remove('clv-checking');
    try { if (_lastErr) sessionStorage.setItem('clv_gate_err', _lastErr); } catch (e) {}
    var main = document.querySelector('main'); if (main) main.remove();
    var next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    // Loop breaker: if this page and the sign-in page keep bouncing each other (the sign-in page sees a
    // session, this page does not), stop after three rounds, drop the session and show the sign-in form.
    var bounces = 0; try { var b = JSON.parse(sessionStorage.getItem('clv_bounce') || '{}'); bounces = (Date.now() - (b.t || 0) < 20000) ? (b.n || 0) : 0; sessionStorage.setItem('clv_bounce', JSON.stringify({ n: bounces + 1, t: Date.now() })); } catch (e) {}
    if (bounces >= 3 && !_user) { try { sessionStorage.removeItem('clv_bounce'); } catch (e) {} sb.auth.signOut().catch(function () {}).then(function () { location.replace('login.html?next=' + next + '&loop=1'); }); return; }
    location.replace('login.html?next=' + next + (_user ? '&denied=1' : ''));
  }

  function init() {
    if (!sb) { document.documentElement.classList.remove('clv-checking'); markReady(); return; }
    refreshSession().then(function () { return gate(); }).then(markReady, markReady);
    try {
      // Never call the auth library from inside its own callback (it holds the auth lock there and the
      // nested call waits for it = timeout). INITIAL_SESSION is handled by the read above.
      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'PASSWORD_RECOVERY') { document.dispatchEvent(new CustomEvent('clv:recovery')); }
        if (event === 'TOKEN_REFRESHED' && session && session.user) { _user = session.user; return; }
        if (event === 'SIGNED_OUT') { reset(); return; }
        setTimeout(function () { refreshSession(); }, 0);
      });
    } catch (e) {}
  }

  window.ClavorisAccess = {
    ready: whenReady, refresh: refreshSession, client: client,
    user: user, profile: profile, role: role, status: status,
    isSignedIn: isSignedIn, isAdmin: isAdmin, isSuper: isSuper, isVerified: isVerified, isSuspended: isSuspended,
    clears: clears, displayName: displayName, profileComplete: profileComplete, sameName: sameName, initials: initials, homeFor: homeFor,
    signIn: signIn, signOut: signOut, requestPasswordReset: requestPasswordReset, verifyRecovery: verifyRecovery, updatePassword: updatePassword,
    verifyPassword: verifyPassword, updateProfile: updateProfile, callFn: callFn
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
