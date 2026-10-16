// One e-mail address = one account, whoever is behind it. Whether that account has ever been used decides
// which mail an invitation sends: never signed in (no password chosen yet) -> a fresh one-time link to set the
// password (an earlier link may have expired); signed in before -> the sign-in page.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL } from "./clv.ts";

export async function isActivated(admin: SupabaseClient, id: string, lastLogin?: string | null): Promise<boolean> {
  if (lastLogin) return true;
  const { data } = await admin.auth.admin.getUserById(id);
  return !!data?.user?.last_sign_in_at;
}

export async function activationLink(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" } });
  return l?.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1` : null;
}
