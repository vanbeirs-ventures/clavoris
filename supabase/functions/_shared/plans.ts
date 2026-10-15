// supabase/functions/_shared/plans.ts
// Company-account plans (clv_plans / clv_plan_subscriptions): the plan a company account holds and what
// it already uses. A company account without an active subscription is on the Free plan.
// Modules counted: data_rooms (rooms of the company), contracts (contracts of the company that are not
// cancelled), users (staff accounts of the company: profiles with company_id). A limit of null = unlimited;
// a module missing from the plan's "modules" is not included (limit 0).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Plan = { code: string; price_month_eur: number | null; max_users: number | null; white_label: boolean; modules: Record<string, number | null> };
export const MODULES = ["data_rooms", "contracts", "marketplace", "portfolio"] as const;

export async function planOf(admin: SupabaseClient, companyId: string | null | undefined): Promise<{ plan: Plan; subscription_id: string | null; since: string | null }> {
  const { data: plans } = await admin.from("clv_plans").select("code, price_month_eur, max_users, white_label, modules");
  const byCode = new Map<string, Plan>((plans || []).map((p: any) => [p.code, p]));
  let code = "free", id: string | null = null, since: string | null = null;
  if (companyId) {
    const { data: s } = await admin.from("clv_plan_subscriptions").select("id, plan_code, activated_at").eq("company_id", companyId).eq("status", "active").maybeSingle();
    if (s) { code = s.plan_code; id = s.id; since = s.activated_at; }
  }
  return { plan: byCode.get(code) || { code: "free", price_month_eur: 0, max_users: 2, white_label: false, modules: { data_rooms: 1 } }, subscription_id: id, since };
}

export async function usageOf(admin: SupabaseClient, companyId: string): Promise<Record<string, number>> {
  const [rooms, contracts, users] = await Promise.all([
    admin.from("clv_rooms").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    admin.from("clv_contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "cancelled"),
    admin.from("clv_profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null),
  ]);
  return { data_rooms: rooms.count || 0, contracts: contracts.count || 0, users: users.count || 0 };
}

export function limitOf(plan: Plan, module: string): number | null {
  if (module === "users") return plan.max_users;
  if (!(module in (plan.modules || {}))) return 0;
  return plan.modules[module];
}

// Whether the company may add one more of `module`. Returns null when allowed, else the details for the
// error "plan-limit" (shown to the company admin with an invitation to change plan).
export async function overLimit(admin: SupabaseClient, companyId: string | null | undefined, module: "data_rooms" | "contracts" | "users"): Promise<{ error: "plan-limit"; module: string; plan: string; limit: number; used: number } | null> {
  if (!companyId) return null;
  const { plan } = await planOf(admin, companyId);
  const limit = limitOf(plan, module);
  if (limit === null) return null;
  const used = (await usageOf(admin, companyId))[module] || 0;
  return used + 1 > limit ? { error: "plan-limit", module, plan: plan.code, limit, used } : null;
}
