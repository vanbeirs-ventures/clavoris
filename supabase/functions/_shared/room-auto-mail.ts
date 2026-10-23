// supabase/functions/_shared/room-auto-mail.ts
// One switch for the automatic e-mails sent to data-room members: new / updated files, access-end reminders
// (7 days / 24 h), the first-download notice, answers to their Q&A questions and the receipt of an extension request.
// They are OFF unless clv_settings "room_auto_mails" holds { "enabled": true }.
// Not covered (always sent): invitations and activation / sign-up mails, mails an administrator triggers by hand
// (reminders, KYC off / NDA off, reactivation, extension decisions), and mails to the company team (new questions,
// extension requests, red flags).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function roomAutoMails(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await admin.from("clv_settings").select("value").eq("key", "room_auto_mails").maybeSingle();
    return (data?.value as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}
