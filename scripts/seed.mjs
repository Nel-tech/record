import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
  process.exitCode = 1;
} else {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: clo, error: profileError } = await supabase.from("profiles")
    .select("id,lga_id").eq("role", "clo").eq("approved", true).limit(1).maybeSingle();
  if (profileError) throw profileError;
  if (!clo) throw new Error("Create and approve a CLO profile before running the sample-data seed.");
  const { data: group, error: groupError } = await supabase.from("cds_groups")
    .select("id").eq("lga_id", clo.lga_id).order("name").limit(1).maybeSingle();
  if (groupError) throw groupError;
  if (!group) throw new Error("Add a CDS group to the CLO's LGA before running the sample-data seed.");

  const sample = [
    { full_name: "Adaobi Sample", state_code: "ZZ/26B/9901", batch: "B1", year: 2026, discipline: "Public Administration", ppa: "Central LGA Secretariat" },
    { full_name: "Tunde Example", state_code: "ZZ/26B/9902", batch: "B2", year: 2026, discipline: "Computer Science", ppa: "Community Learning Centre" },
    { full_name: "Mariam Demo", state_code: "ZZ/25C/9903", batch: "C1", year: 2025, discipline: "Environmental Science", ppa: "Central Health Post" },
  ].map((row) => ({
    ...row,
    cds_group_id: group.id,
    lga_id: clo.lga_id,
    status: "serving",
    created_by: clo.id,
  }));
  const { error } = await supabase.from("corpers").upsert(sample, { onConflict: "state_code" });
  if (error) throw error;
  console.log(`Seeded ${sample.length} fictional corper records.`);
}
