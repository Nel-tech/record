import { redirect } from "next/navigation";
import { Register } from "@/components/Register";
import { createClient } from "@/lib/supabase/server";
import { Profile } from "@/lib/types";

export default async function RegisterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,role,lga_id,cds_group_id,approved").eq("id", user.id).single();
  if (error || !profile) {
    return <main className="page-wrap"><section className="panel"><h1 className="spine text-2xl">Account setup incomplete</h1><p className="helper-text">This account has no register profile. Contact your register administrator.</p></section></main>;
  }
  return <Register profile={profile as Profile} email={user.email ?? ""} />;
}
