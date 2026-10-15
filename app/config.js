/* ============================================================
   CLAVORIS — public front-end Supabase config.
   Both values are PUBLIC by design: the publishable key is safe to
   ship; Row Level Security on the clv_* tables protects the data.
   The Clavoris app runs on its own Supabase project ("Clavoris",
   eu-central-1); every table is prefixed clv_.

   This file MUST load before app/clavoris-access.js.
   ============================================================ */
window.CLAVORIS_SUPABASE = {
  url: "https://gihetiiuqawfhlwixncn.supabase.co",
  anonKey: "sb_publishable_JhONfPJqOow8P5oQY9OQOA_xlyKwi4D",
  // Where this app is served from (used for auth redirect links).
  appUrl: "https://www.clavoris.com/app"
};

// Footer links to the General Terms and Conditions and the Privacy Policy on every app page.
(function () { var s = document.createElement('script'); s.src = 'legal-foot.js?v=20261015a'; s.defer = true; document.head.appendChild(s); })();
