import { z } from "zod";
import type { CorperBatch } from "@/lib/types";

export const stateCodePattern = /^[A-Z]{2}\/\d{2}[ABC]\/\d{4}$/;

export function deriveBatchAndYear(stateCode: string, stream: "1" | "2") {
  const match = stateCode.trim().toUpperCase().match(/^([A-Z]{2})\/(\d{2})([ABC])\/(\d{4})$/);
  if (!match) return null;
  return { batch: `${match[3]}${stream}` as CorperBatch, year: 2000 + Number(match[2]) };
}

export const corperInputSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required."),
  state_code: z.string().trim().toUpperCase().regex(stateCodePattern, "Use the format AK/26B/2400."),
  call_up_no: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  discipline: z.string().trim().optional().nullable(),
  ppa: z.string().trim().optional().nullable(),
  dob: z.string().trim().optional().nullable(),
  bank_name: z.string().trim().optional().nullable(),
  account_no: z.string().trim().optional().nullable(),
  cds_group_id: z.string().uuid("Choose a CDS group."),
  batch: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  year: z.number().int().min(2000).max(2099),
  status: z.enum(["serving", "passed_out"]).default("serving"),
});

export const scanEntrySchema = z.object({
  full_name: z.string().nullable(),
  state_code: z.string().nullable(),
  call_up_no: z.string().nullable(),
  phone: z.string().nullable(),
  discipline: z.string().nullable(),
  ppa: z.string().nullable(),
  dob: z.string().nullable(),
  bank_name: z.string().nullable(),
  account_no: z.string().nullable(),
  address: z.string().nullable(),
  cds_group: z.string().nullable(),
  confidence: z.enum(["high", "low"]),
});

export const scanResponseSchema = z.array(scanEntrySchema);
