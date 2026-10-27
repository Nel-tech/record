import { redirect } from "next/navigation";
import { ImportScreen } from "@/components/ImportScreen";
import { createClient } from "@/lib/supabase/server";
import { Profile } from "@/lib/types";

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,role,lga_id,cds_group_id,approved").eq("id", user.id).single();
  if (error || !profile) redirect("/");
  if (!profile.approved) redirect("/register");
  return <ImportScreen profile={profile as Profile} email={user.email ?? ""} />;
}
