// One e-mail address = one account, whoever is behind it. Whether that account has ever been used decides
// which mail an invitation sends: never signed in (no password chosen yet) -> a fresh one-time link to set the
// password (an earlier link may have expired); signed in before -> the sign-in page, no registration.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL } from "./clv.ts";

// An account counts as in use when any of these hold:
//  - a completed Clavoris sign-in or a chosen password (clv_profiles.last_login_at, stamped by clv-mfa);
//  - a verified identity, or any signed NDA: both can only be done while signed in;
//  - a sign-in recorded by the auth directory for an account that was not created by Clavoris (an existing
//    user of another platform of the group, who signs in with the password they already have).
// For an account created by Clavoris the auth sign-in alone is not enough: opening the activation link records
// a sign-in before any password has been chosen, so such a person would not be able to sign in.
export async function isActivated(admin: SupabaseClient, id: string, lastLogin?: string | null, status?: string | null): Promise<boolean> {
  if (lastLogin) return true;
  if (status === "verified") return true;
  const { data: p } = status === undefined ? await admin.from("clv_profiles").select("status, last_login_at").eq("id", id).maybeSingle() : { data: null };
  if (p && (p.last_login_at || p.status === "verified")) return true;
  const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("user_id", id).limit(1);
  if (nda && nda.length) return true;
  const { data } = await admin.auth.admin.getUserById(id);
  const u = data?.user;
  if (!u?.last_sign_in_at) return false;
  return (u.app_metadata as { app?: string } | null)?.app !== "clavoris";
}

export async function activationLink(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" } });
  return l?.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1` : null;
}
