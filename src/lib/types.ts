export type Role = "clo" | "president";
export type CorperStatus = "serving" | "passed_out";
export type CorperBatch = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type Profile = {
  id: string;
  role: Role;
  lga_id: string;
  cds_group_id: string | null;
  approved: boolean;
  lgas?: { name: string } | null;
  cds_groups?: { name: string } | null;
};

export type Corper = {
  id: string;
  full_name: string;
  state_code: string;
  call_up_no: string | null;
  phone: string | null;
  address: string | null;
  discipline: string | null;
  ppa: string | null;
  dob: string | null;
  bank_name: string | null;
  account_no: string | null;
  cds_group_id: string;
  lga_id: string;
  batch: CorperBatch;
  year: number;
  photo_url: string | null;
  status: CorperStatus;
  created_by: string;
  created_at: string;
  cds_groups?: { name: string } | null;
};

export type LocationOption = { id: string; name: string; lga_id?: string };
