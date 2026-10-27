import { NextResponse } from "next/server";
import { corperInputSchema, deriveBatchAndYear } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const importSchema = z.array(corperInputSchema).min(1).max(1000);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to import corpers." }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id,role,lga_id,cds_group_id,approved").eq("id", user.id).single();
  if (profileError || !profile || !profile.approved) return NextResponse.json({ error: "An approved account is required." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid import rows." }, { status: 400 });
  const codes = parsed.data.map((row) => row.state_code);
  if (new Set(codes).size !== codes.length) return NextResponse.json({ error: "The import contains duplicate state codes." }, { status: 400 });

  const rows = parsed.data.map((row) => {
    const batch = row.batch.slice(-1) as "1" | "2";
    const derived = deriveBatchAndYear(row.state_code, batch);
    return { ...row, ...(derived ?? {}), lga_id: profile.lga_id, created_by: user.id };
  });
  if (rows.some((row, index) => row.batch !== parsed.data[index].batch || row.year !== parsed.data[index].year)) {
    return NextResponse.json({ error: "Each batch and year must match its state code." }, { status: 400 });
  }
  const { error } = await supabase.from("corpers").insert(rows);
  if (error) return NextResponse.json({
    error: error.code === "23505" ? "One or more state codes are already registered." : error.message,
  }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ inserted: rows.length }, { status: 201 });
}
