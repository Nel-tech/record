import { NextResponse } from "next/server";
import { corperInputSchema, deriveBatchAndYear } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";

async function getProfile() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) };
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,role,lga_id,cds_group_id,approved").eq("id", user.id).single();
  if (error || !profile) return { error: NextResponse.json({ error: "Your account profile is unavailable." }, { status: 403 }) };
  if (!profile.approved) return { error: NextResponse.json({ error: "Your account is awaiting CLO approval." }, { status: 403 }) };
  return { supabase, user, profile };
}

export async function POST(request: Request) {
  const access = await getProfile();
  if ("error" in access) return access.error;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = corperInputSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid corper details." }, { status: 400 });

  const stream = parsed.data.batch.slice(-1) as "1" | "2";
  const derived = deriveBatchAndYear(parsed.data.state_code, stream);
  if (!derived || derived.batch !== parsed.data.batch || derived.year !== parsed.data.year) {
    return NextResponse.json({ error: "Batch and year must match the state code." }, { status: 400 });
  }

  const { data, error } = await access.supabase.from("corpers").insert({
    ...parsed.data,
    ...derived,
    lga_id: access.profile.lga_id,
    created_by: access.user.id,
  }).select("id").single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json({ error: duplicate ? "That state code is already registered." : error.message }, { status: duplicate ? 409 : 400 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getProfile();
  if ("error" in access) return access.error;
  if (access.profile.role !== "clo") return NextResponse.json({ error: "Only a CLO can edit corper records." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !("data" in body)) {
    return NextResponse.json({ error: "Corper ID and details are required." }, { status: 400 });
  }
  const parsed = corperInputSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid corper details." }, { status: 400 });
  const derived = deriveBatchAndYear(parsed.data.state_code, parsed.data.batch.slice(-1) as "1" | "2");
  if (!derived || derived.batch !== parsed.data.batch || derived.year !== parsed.data.year) {
    return NextResponse.json({ error: "Batch and year must match the state code." }, { status: 400 });
  }
  const { error } = await access.supabase.from("corpers").update({ ...parsed.data, ...derived })
    .eq("id", body.id).eq("lga_id", access.profile.lga_id);
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That state code is already registered." : error.message }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await getProfile();
  if ("error" in access) return access.error;
  if (access.profile.role !== "clo") return NextResponse.json({ error: "Only a CLO can delete corper records." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string") {
    return NextResponse.json({ error: "Corper ID is required." }, { status: 400 });
  }
  const { error } = await access.supabase.from("corpers").delete()
    .eq("id", body.id).eq("lga_id", access.profile.lga_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
