import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Supabase URL and anon key are required to load LGA and CDS group options." }, { status: 503 });
    }
    const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
    const [{ data: lgas, error: lgaError }, { data: groups, error: groupError }] = await Promise.all([
      supabase.from("lgas").select("id,name,state_name").order("state_name").order("name"),
      supabase.from("cds_groups").select("id,name,lga_id").order("name"),
    ]);
    if (lgaError || groupError) {
      console.error("Signup location options query failed", {
        lgaError: lgaError?.message,
        groupError: groupError?.message,
      });
      return NextResponse.json({ error: "Unable to load LGA and CDS group options. Apply the latest Supabase migrations and check the Supabase URL and anon key." }, { status: 503 });
    }
    return NextResponse.json({ lgas, groups }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Signup location options request failed", error);
    return NextResponse.json({ error: "Unable to load LGA and CDS group options." }, { status: 500 });
  }
}
