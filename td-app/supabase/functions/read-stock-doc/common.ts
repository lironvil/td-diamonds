import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function projectKey(kind: "publishable" | "secret"): string {
  const dict = Deno.env.get(kind === "secret" ? "SUPABASE_SECRET_KEYS" : "SUPABASE_PUBLISHABLE_KEYS");
  if (dict) {
    try {
      const keys = JSON.parse(dict) as Record<string, string>;
      const value = keys.default ?? Object.values(keys)[0];
      if (value) return value;
    } catch { /* fall through */ }
  }
  const legacy = Deno.env.get(kind === "secret" ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_ANON_KEY");
  if (!legacy) throw new Error("Server keys are missing.");
  return legacy;
}

export type Me = { email: string; name: string; role: "owner" | "staff"; today: string };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function caller(req: Request): Promise<{ me: Me; admin: SupabaseClient }> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Please sign in again.");
  const asUser = createClient(url, projectKey("publishable"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await asUser.rpc("whoami");
  if (error || !data) throw new HttpError(403, error?.message ?? "You do not have access.");
  const admin = createClient(url, projectKey("secret"), { auth: { persistSession: false, autoRefreshToken: false } });
  return { me: data as Me, admin };
}

export function failure(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
  return json({ error: message }, 400);
}
