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

  var PROFILE_SEL = 'id, email, full_name, company, job_title, mobile, lang, role, status, kyc_level, kyc_review_answer, last_login_at, created_at, features, notify';

  /* ---------------- cached session state ---------------- */
  var _user = null;      // supabase auth user
  var _profile = null;   // the caller's clv_profiles row
  var _ready = false;
  var _waiters = [];

  function markReady() { _ready = true; var w = _waiters.slice(); _waiters.length = 0; w.forEach(function (f) { try { f(); } catch (e) {} }); }
  function whenReady(fn) { if (_ready) return fn(); _waiters.push(fn); }
  function reset() { _user = null; _profile = null; }

  function refreshSession() {
    if (!sb) { reset(); return Promise.resolve(); }
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session || !session.user) { reset(); return; }
      _user = session.user;
      return sb.from('clv_profiles').select(PROFILE_SEL).eq('id', session.user.id).maybeSingle()
        .then(function (pr) { _profile = pr && pr.data ? pr.data : null; });
    }).catch(reset);
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

  // Send a passphrase-recovery email from noreply@clavoris.com (edge function
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
    var allowed = {}; ['full_name', 'company', 'job_title', 'mobile', 'lang', 'notify'].forEach(function (k) { if (k in fields) allowed[k] = fields[k]; });
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
  function gate() {
    var level = document.body && document.body.getAttribute('data-clv-restrict');
    document.documentElement.classList.remove('clv-checking');
    if (!level) return;
    if (clears(level)) { document.documentElement.classList.add('clv-cleared'); return; }
    var main = document.querySelector('main'); if (main) main.remove();
    var next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace('login.html?next=' + next + (_user ? '&denied=1' : ''));
  }

  function init() {
    if (!sb) { document.documentElement.classList.remove('clv-checking'); markReady(); return; }
    refreshSession().then(function () { gate(); markReady(); });
    try {
      sb.auth.onAuthStateChange(function (event) {
        if (event === 'PASSWORD_RECOVERY') { document.dispatchEvent(new CustomEvent('clv:recovery')); }
        refreshSession();
      });
    } catch (e) {}
  }

  window.ClavorisAccess = {
    ready: whenReady, refresh: refreshSession, client: client,
    user: user, profile: profile, role: role, status: status,
    isSignedIn: isSignedIn, isAdmin: isAdmin, isSuper: isSuper, isVerified: isVerified, isSuspended: isSuspended,
    clears: clears, displayName: displayName, initials: initials, homeFor: homeFor,
    signIn: signIn, signOut: signOut, requestPasswordReset: requestPasswordReset, verifyRecovery: verifyRecovery, updatePassword: updatePassword,
    verifyPassword: verifyPassword, updateProfile: updateProfile, callFn: callFn
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
