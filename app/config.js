/* ============================================================
   CLAVORIS — public front-end Supabase config.
   Both values are PUBLIC by design: the publishable key is safe to
   ship; Row Level Security on the clv_* tables protects the data.
   The Clavoris app shares the Supabase project with the Minerva
   website; every Clavoris table is prefixed clv_ and Clavoris users
   never receive a Minerva `profiles` row.

   This file MUST load before app/clavoris-access.js.
   ============================================================ */
window.CLAVORIS_SUPABASE = {
  url: "https://ojwvdfdkybutuflwbutd.supabase.co",
  anonKey: "sb_publishable_VkjdD10b7fj5OetHKCgxIw_JmOvH8DS",
  // Where this app is served from (used for auth redirect links).
  appUrl: "https://www.clavoris.com/app"
};
