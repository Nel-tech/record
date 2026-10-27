"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { ArrowLeft, Camera, FileUp } from "lucide-react";
import { CorperStatus, LocationOption, Profile } from "@/lib/types";
import { deriveBatchAndYear, stateCodePattern } from "@/lib/validation";
import { createClient } from "@/lib/supabase/client";

type Group = LocationOption & { lga_id: string };
type ImportRow = {
  full_name: string;
  state_code: string;
  call_up_no: string;
  phone: string;
  discipline: string;
  ppa: string;
  dob: string;
  bank_name: string;
  account_no: string;
  address: string;
  cds_group_id: string;
  batch: string;
  year: number | null;
  status: CorperStatus;
  confidence?: "high" | "low";
  skipped: boolean;
};

const emptyRow = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  full_name: "", state_code: "", call_up_no: "", phone: "", discipline: "", ppa: "",
  dob: "", bank_name: "", account_no: "", address: "", cds_group_id: "", batch: "",
  year: null, status: "serving", skipped: false, ...overrides,
});

async function resizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize photos.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Unable to prepare a photo for scanning.")),
      "image/jpeg",
      0.84,
    ));
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function ImportScreen({ profile, email }: { profile: Profile; email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [lgaName, setLgaName] = useState("Your LGA");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [stream, setStream] = useState<"1" | "2">("1");
  const [status, setStatus] = useState<CorperStatus>("serving");
  const [defaultGroup, setDefaultGroup] = useState(profile.cds_group_id ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [locationResponse, { data, error: rosterError }] = await Promise.all([
          fetch("/api/locations"),
          supabase.from("corpers").select("state_code"),
        ]);
        if (rosterError) throw rosterError;
        setExistingCodes((data ?? []).map((corper) => corper.state_code));
        if (!locationResponse.ok) throw new Error("Unable to load CDS groups.");
        const locations: { lgas: { id: string; name: string }[]; groups: Group[] } = await locationResponse.json();
        setGroups(locations.groups.filter((group) => group.lga_id === profile.lga_id));
        setLgaName(locations.lgas.find((lga) => lga.id === profile.lga_id)?.name ?? "Your LGA");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load import options.");
      }
    }
    void load();
  }, [profile.lga_id, supabase]);

  const knownCodes = useMemo(() => new Set(existingCodes.map((code) => code.toUpperCase())), [existingCodes]);

  function updateRow(index: number, field: keyof ImportRow, value: string | boolean) {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field]: value };
      if (field === "state_code") next.state_code = String(value).trim().toUpperCase();
      const derived = deriveBatchAndYear(next.state_code, (next.batch.endsWith("2") ? "2" : stream));
      next.batch = derived?.batch ?? "";
      next.year = derived?.year ?? null;
      return next;
    }));
  }

  function rowReasons(row: ImportRow, index: number) {
    const reasons: string[] = [];
    if (!row.full_name.trim()) reasons.push("Missing name");
    if (!stateCodePattern.test(row.state_code.trim().toUpperCase())) reasons.push("Bad state code format");
    const duplicateHere = rows.some((other, otherIndex) => otherIndex !== index && !other.skipped && other.state_code.trim().toUpperCase() === row.state_code.trim().toUpperCase() && row.state_code.trim() !== "");
    if (row.state_code && (knownCodes.has(row.state_code.trim().toUpperCase()) || duplicateHere)) reasons.push("Duplicate state code");
    if (!groups.some((group) => group.id === row.cds_group_id)) reasons.push("Unknown CDS group");
    return reasons;
  }

  async function parseCsv(file: File) {
    setError("");
    setMessage("");
    let result: Papa.ParseResult<Record<string, string>>;
    try {
      result = await new Promise((resolve, reject) => Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: resolve,
        error: reject,
      }));
    } catch {
      setError("CSV could not be read. Choose a valid CSV file and try again.");
      return;
    }
    if (result.errors.length) {
      setError(`CSV could not be parsed: ${result.errors[0].message}`);
      return;
    }
    const parsed = result.data.map((item) => {
      const rawBatch = String(item.batch ?? "").trim().toUpperCase();
      const selectedStream = rawBatch.endsWith("2") ? "2" : rawBatch.endsWith("1") ? "1" : stream;
      const groupName = String(item.cds_group ?? "").trim().toLowerCase();
      const group = groups.find((candidate) => candidate.name.trim().toLowerCase() === groupName);
      const stateCode = String(item.state_code ?? "").trim().toUpperCase();
      const derived = deriveBatchAndYear(stateCode, selectedStream);
      return emptyRow({
        full_name: String(item.full_name ?? "").trim(),
        state_code: stateCode,
        call_up_no: String(item.call_up_no ?? "").trim(),
        phone: String(item.phone ?? "").trim(),
        discipline: String(item.discipline ?? "").trim(),
        ppa: String(item.ppa ?? "").trim(),
        dob: String(item.dob ?? "").trim(),
        bank_name: String(item.bank_name ?? "").trim(),
        account_no: String(item.account_no ?? "").trim(),
        address: String(item.address ?? "").trim(),
        cds_group_id: group?.id ?? "",
        batch: derived?.batch ?? "",
        year: derived?.year ?? null,
        status: item.status?.trim().toLowerCase() === "passed_out" ? "passed_out" : "serving",
      });
    });
    if (!parsed.length) setError("The CSV has no corper rows.");
    setRows(parsed);
  }

  async function onCsvChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) await parseCsv(file);
    event.currentTarget.value = "";
  }

  async function scanPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    setError("");
    setMessage("");
    if (files.length < 1 || files.length > 10) {
      setError("Choose between 1 and 10 photos.");
      return;
    }
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setError("Choose image files to scan.");
      return;
    }
    setBusy(true);
    try {
      const resized: File[] = [];
      for (const file of files) resized.push(await resizeImage(file));
      const form = new FormData();
      resized.forEach((file) => form.append("images", file));
      const response = await fetch("/api/scan", { method: "POST", body: form });
      const result: { entries?: Array<Record<string, string | null> & { confidence: "high" | "low" }>; error?: string } = await response.json();
      if (!response.ok || !result.entries) throw new Error(result.error ?? "Photo extraction failed.");
      const mapped = result.entries.map((entry) => {
        const stateCode = String(entry.state_code ?? "").trim().toUpperCase();
        const derived = deriveBatchAndYear(stateCode, stream);
        const extractedGroupName = String(entry.cds_group ?? "").trim().toLowerCase();
        const extractedGroup = groups.find((group) => group.name.trim().toLowerCase() === extractedGroupName);
        return emptyRow({
          full_name: entry.full_name ?? "",
          state_code: stateCode,
          call_up_no: entry.call_up_no ?? "",
          phone: entry.phone ?? "",
          discipline: entry.discipline ?? "",
          ppa: entry.ppa ?? "",
          dob: entry.dob ?? "",
          bank_name: entry.bank_name ?? "",
          account_no: entry.account_no ?? "",
          address: entry.address ?? "",
          cds_group_id: extractedGroupName ? extractedGroup?.id ?? "" : defaultGroup,
          batch: derived?.batch ?? "",
          year: derived?.year ?? null,
          status,
          confidence: entry.confidence,
        });
      });
      setRows(mapped);
      if (!mapped.length) setMessage("No corper entries were found. Try another photo.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    const active = rows.map((row, index) => ({ row, index })).filter(({ row }) => !row.skipped);
    if (active.length === 0) { setError("There are no rows selected to import."); return; }
    const flagged = active.find(({ row, index }) => rowReasons(row, index).length > 0);
    if (flagged) { setError("Fix or skip every flagged row before importing."); return; }
    setBusy(true);
    setError("");
    try {
      const payload = active.map(({ row }) => ({
        full_name: row.full_name,
        state_code: row.state_code,
        call_up_no: row.call_up_no || null,
        phone: row.phone || null,
        address: row.address || null,
        discipline: row.discipline || null,
        ppa: row.ppa || null,
        dob: row.dob || null,
        bank_name: row.bank_name || null,
        account_no: row.account_no || null,
        cds_group_id: row.cds_group_id,
        batch: row.batch,
        year: row.year,
        status: row.status,
      }));
      const response = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result: { inserted?: number; error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to import rows.");
      setMessage(`Imported ${result.inserted} corper${result.inserted === 1 ? "" : "s"}.`);
      setRows([]);
      setExistingCodes((current) => [...current, ...payload.map((row) => row.state_code)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import rows.");
    } finally {
      setBusy(false);
    }
  }

  const activeCount = rows.filter((row) => !row.skipped).length;
  const flaggedCount = rows.reduce((count, row, index) => count + (!row.skipped && rowReasons(row, index).length > 0 ? 1 : 0), 0);

  return (
  <main className="min-h-dvh bg-[#F5F6F2] font-sans text-[#202B23]">
    {/* Header */}
    <header className="border-b border-[#E2E7DE] bg-white">
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] items-center px-4 sm:px-6 lg:px-8">
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-4 text-sm font-medium text-[#647267] transition hover:text-[#244B35] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57]"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          Back to register
        </Link>

        <div className="mx-4 hidden h-7 w-px bg-[#E5E9E2] sm:block" />

        <div className="min-w-0">
          <p className="truncate text-xs text-[#879187]">
            NYSC / {lgaName}
          </p>
          <h1 className="truncate text-sm font-bold tracking-tight sm:text-base">
            Import corpers
          </h1>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
      {/* Introduction */}
      <section className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#628067]">
          Register management
        </p>
        <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-[36px]">
          Import records
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#788279]">
          Add multiple corps members at once using a spreadsheet or scan
          an existing register. Review the extracted details before
          adding records to your register.
        </p>
        <p className="mt-3 text-xs text-[#899188]">
          Signed in as <span className="font-medium text-[#526353]">{email}</span>
        </p>
      </section>

      {/* Import methods */}
      <div className={`grid grid-cols-1 gap-5 ${profile.role === "clo" ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
        {/* CSV upload */}
        <section className="flex flex-col rounded-2xl border border-[#E0E5DC] bg-white p-5 shadow-[0_3px_16px_rgba(31,50,34,0.025)] sm:p-6">
          <div className="mb-5 flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EAF1E6] text-[#315C38]">
              <FileUp size={21} aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight">
                Import from CSV
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#7B857C]">
                Upload a spreadsheet containing your corps member details.
              </p>
            </div>
          </div>

          <label className="group mb-4 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#CAD6C6] bg-[#FAFBF9] px-4 py-6 text-center transition hover:border-[#628067] hover:bg-[#F3F7F0] focus-within:ring-4 focus-within:ring-[#527A57]/10">
            <span className="mb-3 grid size-10 place-items-center rounded-full border border-[#E0E7DC] bg-white text-[#527A57] transition group-hover:border-[#C7D9C0]">
              <FileUp size={18} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-[#354739]">
              Choose a CSV file
            </span>
            <span className="mt-1 text-xs leading-5 text-[#899188]">
              Select a .csv file from your device
            </span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={onCsvChange}
            />
          </label>

          <div className="mt-auto flex flex-wrap items-center gap-3">
            <a
              href="/corper-import-template.csv"
              download
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#285239] px-4 text-sm font-semibold text-white transition hover:bg-[#1E432D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57]"
            >
              Download template
            </a>
            <p className="text-xs text-[#899188]">
              Use the required column names.
            </p>
          </div>
        </section>

        {/* Photo scanning — CLO only */}
        {profile.role === "clo" && (
          <section className="flex flex-col rounded-2xl border border-[#E0E5DC] bg-white p-5 shadow-[0_3px_16px_rgba(31,50,34,0.025)] sm:p-6">
            <div className="mb-5 flex items-start gap-4">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#F4EDDE] text-[#94713B]">
                <Camera size={21} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  Scan from photos
                </h3>
                <p className="mt-1 text-sm leading-6 text-[#7B857C]">
                  Extract member details from photos of existing register pages.
                </p>
              </div>
            </div>

            <p className="mb-5 rounded-lg border border-[#E9EDE6] bg-[#FAFBF9] p-3 text-xs leading-5 text-[#788279]">
              You can select up to 10 photos. Images are resized in your
              browser before processing and are not retained, according
              to your current scan workflow.
            </p>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="scan-group"
                  className="mb-2 block text-xs font-semibold text-[#59695B]"
                >
                  Default CDS group
                </label>
                <select
                  id="scan-group"
                  value={defaultGroup}
                  onChange={(event) => setDefaultGroup(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                >
                  <option value="">Choose default group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="scan-stream"
                  className="mb-2 block text-xs font-semibold text-[#59695B]"
                >
                  Default stream
                </label>
                <select
                  id="scan-stream"
                  value={stream}
                  onChange={(event) =>
                    setStream(event.target.value as "1" | "2")
                  }
                  className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                >
                  <option value="1">Stream 1</option>
                  <option value="2">Stream 2</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="scan-status"
                  className="mb-2 block text-xs font-semibold text-[#59695B]"
                >
                  Default status
                </label>
                <select
                  id="scan-status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as CorperStatus)
                  }
                  className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                >
                  <option value="serving">Serving</option>
                  <option value="passed_out">Passed out</option>
                </select>
              </div>
            </div>

            <label
              className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition sm:w-fit ${
                busy
                  ? "cursor-not-allowed bg-[#8C9B8D]"
                  : "bg-[#285239] hover:bg-[#1E432D]"
              }`}
            >
              <Camera size={17} aria-hidden="true" />
              {busy ? "Scanning…" : "Choose photos to scan"}
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={busy}
                onChange={scanPhotos}
              />
            </label>
          </section>
        )}
      </div>

      {/* Feedback */}
      {(error || message) && (
        <div
          role={error ? "alert" : "status"}
          className={`mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${
            error
              ? "border-[#EBCFC7] bg-[#FFF7F4] text-[#A34E3B]"
              : "border-[#CFE2CB] bg-[#F2F8EF] text-[#356B3B]"
          }`}
        >
          <span className="font-bold">{error ? "!" : "✓"}</span>
          <p className="m-0 leading-6">{error || message}</p>
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <section className="mt-7 overflow-hidden rounded-2xl border border-[#E0E5DC] bg-white shadow-[0_3px_16px_rgba(31,50,34,0.025)]">
          <div className="flex flex-col justify-between gap-4 border-b border-[#E9EDE6] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold tracking-tight">
                  Import preview
                </h3>
                <span className="rounded-md border border-[#E2E8DF] bg-[#F6F8F4] px-2 py-1 text-xs font-semibold text-[#526B55]">
                  {rows.length} rows
                </span>
              </div>
              <p className="mt-1 text-sm text-[#7B857C]">
                Review and correct records before confirming the import.
              </p>
            </div>

            <button
              type="button"
              disabled={busy || flaggedCount > 0 || activeCount === 0}
              onClick={() => void confirmImport()}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#285239] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E432D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57] disabled:cursor-not-allowed disabled:bg-[#A4B2A3] disabled:shadow-none"
            >
              {busy ? "Importing…" : `Confirm import (${activeCount})`}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[#E9EDE6] bg-[#FAFBF9] px-5 py-4 sm:px-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#EAF3E7] px-3 py-1.5 text-xs font-semibold text-[#356B3B]">
              <span className="size-1.5 rounded-full bg-[#4F8B54]" />
              {activeCount} ready
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF1E9] px-3 py-1.5 text-xs font-semibold text-[#A34E3B]">
              <span className="size-1.5 rounded-full bg-[#C56B52]" />
              {flaggedCount} flagged
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#F0F1EE] px-3 py-1.5 text-xs font-semibold text-[#747D73]">
              {rows.length - activeCount} skipped
            </span>
          </div>

          <div className="border-b border-[#E9EDE6] px-5 py-3 sm:px-6">
            <p className="m-0 text-xs leading-5 text-[#788279]">
              Correct flagged rows or mark them as skipped. Batch and year
              are derived from the state code; stream and status use your
              selected defaults.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E6EAE3] bg-white">
                  {["Full name", "State code", "Batch / year", "CDS group", "Phone", "Validation", "Action"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D] first:pl-6 last:pr-6"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-[#EEF0EB]">
                {rows.map((row, index) => {
                  const reasons = rowReasons(row, index);
                  const flagged = reasons.length > 0 || row.confidence === "low";

                  return (
                    <tr
                      key={`${index}-${row.state_code}`}
                      className={`transition-colors ${
                        row.skipped
                          ? "bg-[#FAFAF8] opacity-50"
                          : flagged
                            ? "bg-[#FFFAF7]"
                            : "hover:bg-[#F8FAF6]"
                      }`}
                    >
                      <td className="px-4 py-3.5 pl-6">
                        <input
                          aria-label={`Row ${index + 1} full name`}
                          className="min-h-10 min-w-[150px] rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10 disabled:bg-[#F2F3F0]"
                          value={row.full_name}
                          disabled={row.skipped}
                          onChange={(event) =>
                            updateRow(index, "full_name", event.target.value)
                          }
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        <input
                          aria-label={`Row ${index + 1} state code`}
                          className="min-h-10 min-w-[130px] rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10 disabled:bg-[#F2F3F0]"
                          value={row.state_code}
                          disabled={row.skipped}
                          onChange={(event) =>
                            updateRow(index, "state_code", event.target.value)
                          }
                        />
                      </td>

                      <td className="px-4 py-3.5">
                        {row.batch && row.year ? (
                          <span className="inline-flex whitespace-nowrap rounded-md border border-[#E0E7DC] bg-[#F5F8F2] px-2 py-1 text-xs font-medium text-[#526B55]">
                            {row.batch} · {row.year}
                          </span>
                        ) : (
                          <span className="text-sm text-[#A34E3B]">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <select
                          aria-label={`Row ${index + 1} CDS group`}
                          className="min-h-10 min-w-[160px] rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10 disabled:bg-[#F2F3F0]"
                          value={row.cds_group_id}
                          disabled={row.skipped}
                          onChange={(event) =>
                            updateRow(index, "cds_group_id", event.target.value)
                          }
                        >
                          <option value="">Choose group</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3.5 text-sm text-[#657267]">
                        {row.phone || "—"}
                      </td>

                      <td className="min-w-[190px] px-4 py-3.5">
                        {row.confidence === "low" && (
                          <p className="mb-1 text-xs font-semibold text-[#A34E3B]">
                            Low scan confidence
                          </p>
                        )}
                        {reasons.length > 0 ? (
                          <p className="m-0 text-xs leading-5 text-[#A34E3B]">
                            {reasons.join(", ")}
                          </p>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#356B3B]">
                            <span className="size-1.5 rounded-full bg-[#4F8B54]" />
                            Ready
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 pr-6">
                        <button
                          type="button"
                          onClick={() =>
                            updateRow(index, "skipped", !row.skipped)
                          }
                          className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition ${
                            row.skipped
                              ? "border-[#CFE2CB] bg-[#F2F8EF] text-[#356B3B] hover:bg-[#E7F2E3]"
                              : "border-[#E0E5DC] bg-white text-[#657267] hover:border-[#D3B8AD] hover:bg-[#FFF7F4] hover:text-[#A34E3B]"
                          }`}
                        >
                          {row.skipped ? "Restore" : "Skip"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E9EDE6] bg-[#FAFBF9] px-5 py-3.5 text-xs text-[#818B80] sm:px-6">
            <span>{activeCount} records included in this import</span>
            <span>Review all flagged rows before continuing</span>
          </div>
        </section>
      )}
    </div>
  </main>
)
}