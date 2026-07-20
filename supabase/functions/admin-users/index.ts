import { createClient } from "npm:@supabase/supabase-js@2.110.7";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const allowedRoles = new Set(["owner", "manager", "cashier", "waiter", "barista", "customer"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: "Function configuration or authorization is missing." }, 401);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication is required." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller } = await adminClient
    .from("profiles")
    .select("id,role,active")
    .eq("id", authData.user.id)
    .single();
  if (!caller?.active || caller.role !== "owner") {
    return json({ error: "Owner access is required." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "A JSON request body is required." }, 400);
  }

  const action = String(body.action || "");
  const role = String(body.role || "");
  if (!allowedRoles.has(role)) return json({ error: "Invalid role." }, 400);

  if (action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    if (!email || password.length < 8 || !fullName) {
      return json({ error: "Email, full name, and an 8-character password are required." }, 400);
    }
    const { data, error } = await adminClient.auth.admin.createUser({
      app_metadata: { role },
      email,
      email_confirm: true,
      password,
      user_metadata: { full_name: fullName, phone },
    });
    if (error) return json({ error: error.message }, 400);
    await adminClient.from("audit_logs").insert({
      action: "staff.create",
      actor_user_id: caller.id,
      entity_id: data.user.id,
      entity_type: "profile",
      metadata: { role },
    });
    return json({ id: data.user.id, role });
  }

  if (action === "update") {
    const userId = String(body.userId || "");
    if (!userId || userId === caller.id) {
      return json({ error: "A different target user is required." }, 400);
    }
    const disabled = Boolean(body.disabled);
    const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: { disabled, role },
      ban_duration: disabled ? "876000h" : "none",
    });
    if (error) return json({ error: error.message }, 400);
    await adminClient.from("audit_logs").insert({
      action: disabled ? "staff.disable" : "staff.update",
      actor_user_id: caller.id,
      entity_id: userId,
      entity_type: "profile",
      metadata: { role },
    });
    return json({ id: data.user.id, disabled, role });
  }

  return json({ error: "Unsupported action." }, 400);
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
