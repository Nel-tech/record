import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  lgaId: z.string().uuid(),
  setupCode: z.string().min(1).max(256),
});

function matchesSetupCode(supplied: string, expected: string) {
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const expectedSetupCode = process.env.CLO_SETUP_CODE;
  if (!expectedSetupCode) {
    return NextResponse.json({ error: "CLO account setup is not configured. Ask the app administrator to set CLO_SETUP_CODE." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email, password, LGA, and setup code." }, { status: 400 });
  }
  if (!matchesSetupCode(parsed.data.setupCode, expectedSetupCode)) {
    return NextResponse.json({ error: "The CLO setup code is incorrect." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data: lga, error: lgaError } = await admin.from("lgas")
      .select("id").eq("id", parsed.data.lgaId).maybeSingle();
    if (lgaError) {
      console.error("CLO signup LGA lookup failed", lgaError.message);
      return NextResponse.json({ error: "Unable to verify the selected LGA." }, { status: 500 });
    }
    if (!lga) return NextResponse.json({ error: "Choose an available LGA." }, { status: 400 });

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? "Unable to create the CLO account." }, { status: 400 });
    }

    const { error: registrationError } = await admin.rpc("register_initial_clo", {
      target_user_id: created.user.id,
      target_email: parsed.data.email,
      target_lga_id: parsed.data.lgaId,
    });
    if (registrationError) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        console.error("Unable to clean up rejected CLO signup", {
          userId: created.user.id,
          error: cleanupError.message,
        });
      }
      if (registrationError.message.includes("already exists")) {
        return NextResponse.json({ error: "CLO registration is closed because a CLO account already exists." }, { status: 409 });
      }
      if (registrationError.message.includes("register_initial_clo")) {
        return NextResponse.json({ error: "Apply the latest Supabase migration before creating the first CLO account." }, { status: 503 });
      }
      console.error("Initial CLO profile registration failed", registrationError.message);
      return NextResponse.json({ error: "Unable to finish CLO account setup. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("CLO signup failed", error);
    return NextResponse.json({ error: "Unable to create the CLO account. Check server configuration and try again." }, { status: 500 });
  }
}
