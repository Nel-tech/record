import { NextResponse } from "next/server";
import { scanResponseSchema } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in as a CLO to scan register pages." }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("role,approved").eq("id", user.id).single();
  if (profileError || !profile || profile.role !== "clo" || !profile.approved) {
    return NextResponse.json({ error: "Photo scanning is available to approved CLOs only." }, { status: 403 });
  }

  const { data: allowed, error: limitError } = await supabase.rpc("consume_scan_rate_limit");
  if (limitError) return NextResponse.json({ error: "Unable to verify your scan limit. Please try again." }, { status: 500 });
  if (!allowed) return NextResponse.json({ error: "Scan limit reached. You can scan up to 5 times per minute." }, { status: 429 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Photo scanning is not configured on this server." }, { status: 503 });
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send register photos as a multipart form upload." }, { status: 400 });
  }
  const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
  if (files.length < 1 || files.length > 10) {
    return NextResponse.json({ error: "Choose between 1 and 10 register photos." }, { status: 400 });
  }
  if (files.some((file) => !allowedTypes.has(file.type) || file.size > MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: "Each photo must be a JPEG, PNG, or WebP image no larger than 8 MB." }, { status: 400 });
  }

  try {
    const imageParts = await Promise.all(files.map(async (file) => ({
      inlineData: {
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      },
    })));
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "Extract every corper entry from this handwritten register page. Return ONLY a JSON array. Fields: full_name, state_code, call_up_no, phone, discipline, ppa, dob (YYYY-MM-DD), bank_name, account_no, address, cds_group. Use null for anything unreadable. Never guess digits. Add a confidence ('high'|'low') per entry.",
            }],
          },
          contents: [{
            role: "user",
            parts: [
              { text: "Extract the corper entries visible in these register page images. Return only the JSON array." },
              ...imageParts,
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8192,
          },
        }),
      },
    );
    if (!response.ok) {
      console.error("Gemini scan request failed", { status: response.status });
      if (response.status === 429) {
        return NextResponse.json({ error: "Gemini's free-tier limit has been reached. Wait a moment and try again." }, { status: 429 });
      }
      if (response.status === 400 || response.status === 403) {
        return NextResponse.json({ error: "Gemini rejected the request. Check your API key, model access, and image size." }, { status: 502 });
      }
      return NextResponse.json({ error: "Photo extraction failed. Check the images and try again." }, { status: 502 });
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("candidates" in payload) || !Array.isArray(payload.candidates)) {
      return NextResponse.json({ error: "The extraction service returned an invalid response." }, { status: 502 });
    }
    const candidate = payload.candidates[0];
    if (!candidate || typeof candidate !== "object" || !("content" in candidate)
      || !candidate.content || typeof candidate.content !== "object"
      || !("parts" in candidate.content) || !Array.isArray(candidate.content.parts)) {
      return NextResponse.json({ error: "No extracted text was returned. Try a clearer photo." }, { status: 502 });
    }
    const parts: unknown[] = candidate.content.parts;
    const text = parts.find((part: unknown) =>
      part && typeof part === "object" && "text" in part && typeof part.text === "string",
    );
    if (!text || typeof text !== "object" || !("text" in text) || typeof text.text !== "string") {
      return NextResponse.json({ error: "No extracted text was returned. Try a clearer photo." }, { status: 502 });
    }
    const decoded: unknown = JSON.parse(text.text);
    const parsed = scanResponseSchema.safeParse(decoded);
    if (!parsed.success) return NextResponse.json({ error: "The extraction could not be validated. Try another photo." }, { status: 502 });
    return NextResponse.json({ entries: parsed.data });
  } catch (error) {
    console.error("Photo scan failed", error);
    return NextResponse.json({ error: "Photo extraction failed. Please try again." }, { status: 502 });
  }
}
