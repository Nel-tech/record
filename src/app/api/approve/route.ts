import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const requestSchema = z.object({ profileId: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role,approved").eq("id", user.id).single();
  if (!profile || profile.role !== "clo" || !profile.approved) {
    return NextResponse.json({ error: "Only an approved CLO can approve accounts." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid president profile is required." }, { status: 400 });
  const { error } = await supabase.rpc("approve_president", { target_profile: parsed.data.profileId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
