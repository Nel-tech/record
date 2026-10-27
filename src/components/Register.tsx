"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Corper, LocationOption, Profile } from "@/lib/types";
import { CorperForm } from "@/components/CorperForm";

type Group = LocationOption & { lga_id: string };

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
 useLayoutEffect(() => {
  const dialog = ref.current;
  if (!dialog || dialog.open) return;
  try {
    dialog.showModal();
  } catch (error) {
    console.error("Unable to open the corper dialog as a modal.", error);
    dialog.setAttribute("open", "");
  }
}, []);
  return (
    <dialog
      ref={ref}
      className="app-dialog"
      aria-label={title}
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="m-0 text-2xl">{title}</h2>
        <button className="btn btn-ghost" type="button" onClick={() => ref.current?.close()} aria-label="Close dialog">Close</button>
      </div>
      {children}
    </dialog>
  );
}

export function Register({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [corpers, setCorpers] = useState<Corper[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lgaName, setLgaName] = useState("Your LGA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Corper | null>(null);
  const [formCorper, setFormCorper] = useState<Corper | null | "new">(null);
  const [pendingProfiles, setPendingProfiles] = useState<{ id: string; email: string | null }[]>([]);
  const [approving, setApproving] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ data, error: listError }, locationsResponse] = await Promise.all([
        supabase.from("corpers").select("*, cds_groups(name)").order("full_name"),
        fetch("/api/locations"),
      ]);
      if (listError) throw listError;
      setCorpers((data ?? []) as Corper[]);
      if (!locationsResponse.ok) throw new Error("Unable to load CDS group details.");
      const locations: { lgas: { id: string; name: string }[]; groups: Group[] } = await locationsResponse.json();
      setGroups(locations.groups.filter((group) => group.lga_id === profile.lga_id));
      setLgaName(locations.lgas.find((lga) => lga.id === profile.lga_id)?.name ?? "Your LGA");
      if (profile.role === "clo") {
        const { data: pending, error: pendingError } = await supabase.from("profiles")
          .select("id,email").eq("lga_id", profile.lga_id).eq("role", "president").eq("approved", false);
        if (pendingError) throw pendingError;
        setPendingProfiles(pending ?? []);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the register.");
      setCorpers([]);
    } finally {
      setLoading(false);
    }
  }, [profile.lga_id, profile.role, supabase]);

  useEffect(() => { void refresh(); }, [refresh]);

  const years = useMemo(() => [...new Set(corpers.map((corper) => corper.year))].sort((a, b) => b - a), [corpers]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return corpers.filter((corper) =>
      (!batchFilter || corper.batch === batchFilter)
      && (!yearFilter || corper.year === Number(yearFilter))
      && (!groupFilter || corper.cds_group_id === groupFilter)
      && (!query || corper.full_name.toLowerCase().includes(query) || corper.state_code.toLowerCase().includes(query)),
    );
  }, [batchFilter, corpers, groupFilter, search, yearFilter]);

  async function signOut() {
    const { error: signoutError } = await supabase.auth.signOut();
    if (signoutError) setError(signoutError.message);
    else router.push("/");
  }

  async function approve(profileId: string) {
    setApproving(profileId);
    setError("");
    try {
      const response = await fetch("/api/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId }) });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to approve account.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to approve account.");
    } finally {
      setApproving("");
    }
  }

  async function deleteCorper(corper: Corper) {
    if (!window.confirm(`Delete ${corper.full_name} (${corper.state_code})? This cannot be undone.`)) return;
    try {
      const response = await fetch("/api/corpers", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: corper.id }) });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to delete corper.");
      setSelected(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete corper.");
    }
  }

  if (!profile.approved) {
    return (
      <main className="page-wrap flex min-h-[100dvh] items-center justify-center">
        <section className="panel w-full max-w-[560px]">
          <h1 className="spine mt-0 text-3xl">Request received</h1>
          <p>Your CDS president account is waiting for approval from a CLO in your LGA. You will have register access once approved.</p>
          <p className="helper-text">{email}</p>
          <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return (
  <main className="min-h-dvh bg-[#F5F6F2] font-sans text-[#202B23]">
    {/* Header */}
    <header className="sticky top-0 z-20 border-b border-[#E2E7DE] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#244B35] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true">
              <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" />
              <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H20" />
              <path d="M9 7h6M9 10h6" />
            </svg>
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight">
              Corper Register
            </h1>
            <p className="mt-0.5 truncate text-xs text-[#7B857C]">
              NYSC / {lgaName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden border-r border-[#E5E9E2] pr-4 text-right sm:block">
            <p className="max-w-48 truncate text-sm font-medium">
              {profile.role === "clo" ? "CLO" : "CDS President"}
            </p>
            <p className="max-w-48 truncate text-xs text-[#7B857C]">
              {email}
            </p>
          </div>

 

          <Link
            href="/import"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#DFE5DB] bg-white px-3 text-sm font-medium text-[#425746] transition hover:bg-[#F4F6F1]"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4" aria-hidden="true">
              <path d="M10 12V3m0 0L6.5 6.5M10 3l3.5 3.5M4 11v5h12v-5" />
            </svg>
            <span className="hidden sm:inline">Import</span>
          </Link>

          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-[#6D786D] transition hover:bg-[#F0F2EC] hover:text-[#253A2A]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8">

      {/* Page introduction */}
      <section className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#628067]">
            <span className="size-2 rounded-full bg-[#628067]" />
            {lgaName} · Service management
          </div>

          <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-[36px]">
            Your register
          </h2>

          <p className="mt-2 max-w-xl text-sm leading-6 text-[#788279]">
            Manage corps member records, review account requests, and
            keep your local service register up to date.
          </p>
        </div>

        {profile.role === "clo" && (
          <button
            type="button"
            onClick={() => setFormCorper("new")}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#285239] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E432D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57]"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Add corper
          </button>
        )}
      </section>

      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-[#EBCFC7] bg-[#FFF7F4] p-4 text-sm text-[#A34E3B]">
          <span className="font-bold">!</span>
          <p className="m-0">{error}</p>
        </div>
      )}

      {/* Pending requests */}
      {profile.role === "clo" && pendingProfiles.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-[#E1E6DC] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF0E9] px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-semibold">President requests</h2>
              <p className="mt-1 text-sm text-[#7B857C]">
                Review requests for register access.
              </p>
            </div>
            <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#F7EBD4] px-2.5 py-1 text-xs font-bold text-[#89692D]">
              {pendingProfiles.length}
            </span>
          </div>

          <ul className="m-0 divide-y divide-[#EDF0E9] p-0">
            {pendingProfiles.map((pending) => (
              <li key={pending.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EEF2EA] text-sm font-semibold text-[#45634A]">
                    {(pending.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">
                      {pending.email ?? "Email unavailable"}
                    </p>
                    <p className="mt-1 text-xs text-[#899188]">
                      Awaiting approval
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={approving === pending.id}
                  onClick={() => void approve(pending.id)}
                  className="min-h-10 rounded-lg bg-[#EAF2E7] px-4 text-sm font-semibold text-[#315C38] transition hover:bg-[#DDEAD8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {approving === pending.id ? "Approving…" : "Approve"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Roster */}
      <section className="overflow-hidden rounded-2xl border border-[#E0E5DC] bg-white shadow-[0_3px_16px_rgba(31,50,34,0.025)]">
        <div className="flex flex-col justify-between gap-4 border-b border-[#E9EDE6] px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Corps members
              </h2>
              <span className="rounded-md border border-[#E2E8DF] bg-[#F6F8F4] px-2 py-1 text-xs font-semibold text-[#56705A]">
                {visible.length} results
              </span>
            </div>
            <p className="mt-1 text-sm text-[#7B857C]">
              Showing {visible.length} of {corpers.length} records
            </p>
          </div>

          {profile.role === "president" && (
            <button
              type="button"
              onClick={() => setFormCorper("new")}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#285239] px-4 text-sm font-semibold text-white transition hover:bg-[#1E432D]"
            >
              <span aria-hidden="true">+</span>
              Add corper
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="border-b border-[#E9EDE6] bg-[#FAFBF9] p-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="filter-search" className="mb-2 block text-xs font-semibold text-[#59695B]">
                Search register
              </label>
              <div className="relative">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#929C91]" aria-hidden="true">
                  <circle cx="8.5" cy="8.5" r="5.5" />
                  <path d="m13 13 4 4" />
                </svg>
                <input
                  id="filter-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or state code"
                  className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-[#A0A89F] focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="filter-batch" className="mb-2 block text-xs font-semibold text-[#59695B]">
                Batch
              </label>
              <select
                id="filter-batch"
                value={batchFilter}
                onChange={(event) => setBatchFilter(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
              >
                <option value="">All batches</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((batch) => (
                  <option key={batch}>{batch}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-year" className="mb-2 block text-xs font-semibold text-[#59695B]">
                Service year
              </label>
              <select
                id="filter-year"
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
              >
                <option value="">All years</option>
                {years.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </div>

            {profile.role === "clo" && (
              <div>
                <label htmlFor="filter-group" className="mb-2 block text-xs font-semibold text-[#59695B]">
                  CDS group
                </label>
                <select
                  id="filter-group"
                  value={groupFilter}
                  onChange={(event) => setGroupFilter(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm outline-none focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                >
                  <option value="">All CDS groups</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {(search || batchFilter || yearFilter || groupFilter) && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setBatchFilter("");
                  setYearFilter("");
                  setGroupFilter("");
                }}
                className="text-xs font-semibold text-[#45694A] underline underline-offset-4 hover:text-[#244B35]"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E6EAE3] bg-white">
                <th scope="col" className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D]">
                  Corps member
                </th>
                <th scope="col" className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D]">
                  State code
                </th>
                <th scope="col" className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D]">
                  Batch / year
                </th>
                <th scope="col" className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D]">
                  CDS group
                </th>
                <th scope="col" className="px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7D887D]">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#EEF0EB]">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-sm text-[#7B857C]">
                      <span className="size-6 animate-spin rounded-full border-2 border-[#DDE5D9] border-t-[#285239]" />
                      Loading register…
                    </div>
                  </td>
                </tr>
              )}

              {!loading && visible.map((corper) => (
                <tr
                  key={corper.id}
                  tabIndex={0}
                  onClick={() => setSelected(corper)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(corper);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-[#F7F9F5] focus-visible:bg-[#F2F6EF] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#527A57]"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#EAF0E6] text-xs font-bold text-[#45664A]">
                        {corper.full_name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part.charAt(0))
                          .join("")
                          .toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-[#29392D]">
                        {corper.full_name}
                      </span>
                    </div>
                  </td>

                  <td className="px-4 py-4 text-sm text-[#657267]">
                    {corper.state_code}
                  </td>

                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-md border border-[#E0E7DC] bg-[#F5F8F2] px-2 py-1 text-xs font-medium text-[#526B55]">
                      {corper.batch} · {corper.year}
                    </span>
                  </td>

                  <td className="max-w-52 truncate px-4 py-4 text-sm text-[#657267]">
                    {corper.cds_groups?.name ?? "—"}
                  </td>

                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      corper.status === "serving"
                        ? "bg-[#E9F4E8] text-[#356B3B]"
                        : "bg-[#F0F1EE] text-[#747D73]"
                    }`}>
                      <span className={`size-1.5 rounded-full ${
                        corper.status === "serving"
                          ? "bg-[#4F8B54]"
                          : "bg-[#959C92]"
                      }`} />
                      {corper.status === "serving" ? "Serving" : "Passed out"}
                    </span>
                  </td>
                </tr>
              ))}

              {!loading && !error && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-[#EFF3EB] text-[#68806A]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-6" aria-hidden="true">
                          <circle cx="10.5" cy="10.5" r="6.5" />
                          <path d="m16 16 4 4M8 10.5h5" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-[#354739]">
                        No matching records
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#818B80]">
                        Try another search or clear your filters to see more corps members.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearch("");
                          setBatchFilter("");
                          setYearFilter("");
                          setGroupFilter("");
                        }}
                        className="mt-4 rounded-lg border border-[#DDE4D9] px-4 py-2 text-sm font-semibold text-[#45664A] transition hover:bg-[#F4F7F1]"
                      >
                        Reset filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E9EDE6] bg-[#FAFBF9] px-5 py-3.5 text-xs text-[#818B80] sm:px-6">
          <span>{loading ? "Updating records…" : `${visible.length} records displayed`}</span>
          <span>Click a row to view details</span>
        </div>
      </section>

      {/* Existing detail dialog */}
      {selected && (
        <Dialog title={selected.full_name} onClose={() => setSelected(null)}>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
            {[
              ["State code", selected.state_code],
              ["Call-up number", selected.call_up_no],
              ["Phone", selected.phone],
              ["Address", selected.address],
              ["Discipline", selected.discipline],
              ["PPA", selected.ppa],
              ["Date of birth", selected.dob],
              ["Bank", selected.bank_name],
              ["Account number", selected.account_no],
              ["CDS group", selected.cds_groups?.name],
              ["Batch", `${selected.batch} · ${selected.year}`],
              ["Status", selected.status === "serving" ? "Serving" : "Passed out"],
            ].map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-[#788579]">{label}</dt>
                <dd className="m-0 break-words font-medium text-[#29392D]">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>

          {profile.role === "clo" && (
            <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-[#E9EDE6] pt-5">
              <button
                type="button"
                onClick={() => void deleteCorper(selected)}
                className="min-h-10 rounded-lg border border-[#E9CFC8] px-4 text-sm font-semibold text-[#A34E3B] transition hover:bg-[#FFF5F2]"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormCorper(selected);
                  setSelected(null);
                }}
                className="min-h-10 rounded-lg bg-[#285239] px-4 text-sm font-semibold text-white transition hover:bg-[#1E432D]"
              >
                Edit corper
              </button>
            </div>
          )}
        </Dialog>
      )}

      {/* Existing create/edit dialog */}
      {formCorper !== null && (
        <Dialog
          title={formCorper === "new" ? "Add corper" : "Edit corper"}
          onClose={() => setFormCorper(null)}
        >
          <CorperForm
            groups={
              profile.role === "president" && profile.cds_group_id
                ? groups.filter((group) => group.id === profile.cds_group_id)
                : groups
            }
            defaultGroupId={profile.cds_group_id}
            initial={formCorper === "new" ? null : formCorper}
            onCancel={() => setFormCorper(null)}
            onSaved={() => {
              setFormCorper(null);
              void refresh();
            }}
          />
        </Dialog>
      )}
    </div>
  </main>
  );
}
