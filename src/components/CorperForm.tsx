"use client";

import { FormEvent, useEffect, useState } from "react";
import { Corper, CorperStatus, LocationOption } from "@/lib/types";
import { deriveBatchAndYear, stateCodePattern } from "@/lib/validation";

type Props = {
  groups: LocationOption[];
  initial?: Corper | null;
  defaultGroupId?: string | null;
  onSaved: () => void;
  onCancel: () => void;
};

const fields = [
  ["full_name", "Full name", "text"],
  ["state_code", "State code", "text"],
  ["call_up_no", "Call-up number", "text"],
  ["phone", "Phone number", "tel"],
  ["address", "Residential address", "text"],
  ["discipline", "Course of study", "text"],
  ["ppa", "Place of primary assignment", "text"],
  ["dob", "Date of birth", "date"],
  ["bank_name", "Bank name", "text"],
  ["account_no", "Account number", "text"],
] as const;

export function CorperForm({
  groups,
  initial,
  defaultGroupId,
  onSaved,
  onCancel,
}: Props) {
  const [stateCode, setStateCode] = useState(initial?.state_code ?? "");
  const [stream, setStream] = useState<"1" | "2">(
    initial?.batch.endsWith("2") ? "2" : "1",
  );
  const [batchYear, setBatchYear] = useState(() =>
    initial ? { batch: initial.batch, year: initial.year } : null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const derived = deriveBatchAndYear(stateCode, stream);
    setBatchYear(derived);
  }, [stateCode, stream]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const data = new FormData(event.currentTarget);
    const parsedCode = String(data.get("state_code") ?? "")
      .trim()
      .toUpperCase();

    if (!stateCodePattern.test(parsedCode)) {
      setError("State code must use the format AK/26B/2400.");
      return;
    }

    const derived = deriveBatchAndYear(parsedCode, stream);

    if (!derived) {
      setError("Enter a valid state code before saving.");
      return;
    }

    const payload: Record<string, string | number | null> =
      Object.fromEntries(
        fields.map(([name]) => {
          const value = String(data.get(name) ?? "").trim();
          return [name, value || null];
        }),
      );

    payload.state_code = parsedCode;
    payload.cds_group_id = String(data.get("cds_group_id") ?? "");
    payload.batch = derived.batch;
    payload.year = derived.year;
    payload.status = String(data.get("status") ?? "serving") as CorperStatus;

    setBusy(true);

    try {
      const response = await fetch("/api/corpers", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          initial ? { id: initial.id, data: payload } : payload,
        ),
      });

      const result: { error?: string } = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to save the corper.");
      }

      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save the corper.",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-sm text-[#29392D] outline-none transition placeholder:text-[#A0A89F] focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10 disabled:cursor-not-allowed disabled:bg-[#F2F3F0]";

  const labelClass =
    "mb-2 block text-xs font-semibold text-[#59695B]";

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Intro */}
      <div className="border-b border-[#E9EDE6] pb-5">
        <p className="text-sm leading-6 text-[#788279]">
          {initial
            ? "Update the member's information below. Changes will be saved to the register."
            : "Enter the corps member's information. Fields marked with * are required."}
        </p>
      </div>

      {/* Personal and service information */}
      <section>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#29392D]">
            Personal & service details
          </h3>
          <p className="mt-1 text-xs text-[#899188]">
            Basic identification and contact information.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          {fields.slice(0, 8).map(([name, label, type]) => (
            <div
              key={name}
              className={name === "full_name" || name === "address" || name === "ppa"
                ? "sm:col-span-2"
                : ""}
            >
              <label htmlFor={`corper-${name}`} className={labelClass}>
                {label}
                {(name === "full_name" || name === "state_code") && (
                  <span className="ml-1 text-[#B65C3D]">*</span>
                )}
              </label>

              <input
                id={`corper-${name}`}
                name={name}
                type={type}
                className={inputClass}
                required={name === "full_name" || name === "state_code"}
                value={name === "state_code" ? stateCode : undefined}
                defaultValue={
                  name !== "state_code" && initial
                    ? (initial[name] ?? "") as string
                    : undefined
                }
                onChange={
                  name === "state_code"
                    ? (event) =>
                        setStateCode(event.target.value.toUpperCase())
                    : undefined
                }
                placeholder={
                  name === "full_name"
                    ? "Enter full name"
                    : name === "state_code"
                      ? "AK/26B/2400"
                      : name === "call_up_no"
                        ? "Enter call-up number"
                        : name === "phone"
                          ? "Enter phone number"
                          : name === "address"
                            ? "Enter residential address"
                            : name === "discipline"
                              ? "e.g. Computer Science"
                              : name === "ppa"
                                ? "Enter place of primary assignment"
                                : undefined
                }
              />

              {name === "full_name" && (
                <p className="mt-1.5 text-xs leading-5 text-[#899188]">
                  Enter the surname, first name, and other names together.
                </p>
              )}

              {name === "state_code" && (
                <p className="mt-1.5 text-xs leading-5 text-[#899188]">
                  The batch and service year are derived from this code.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Deployment information */}
      <section className="border-t border-[#E9EDE6] pt-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#29392D]">
            CDS & deployment
          </h3>
          <p className="mt-1 text-xs text-[#899188]">
            Assign the member to a CDS group and set their service details.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="corper-cds-group" className={labelClass}>
              CDS group <span className="text-[#B65C3D]">*</span>
            </label>

            <select
              id="corper-cds-group"
              name="cds_group_id"
              className={inputClass}
              defaultValue={initial?.cds_group_id ?? defaultGroupId ?? ""}
              required
            >
              <option value="">Choose a CDS group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="corper-stream" className={labelClass}>
              Stream
            </label>
            <select
              id="corper-stream"
              className={inputClass}
              value={stream}
              onChange={(event) =>
                setStream(event.target.value as "1" | "2")
              }
            >
              <option value="1">Stream 1</option>
              <option value="2">Stream 2</option>
            </select>
          </div>

          <div>
            <label htmlFor="corper-status" className={labelClass}>
              Service status
            </label>
            <select
              id="corper-status"
              name="status"
              className={inputClass}
              defaultValue={initial?.status ?? "serving"}
            >
              <option value="serving">Serving</option>
              <option value="passed_out">Passed out</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              Derived batch & service year
            </label>

            <div className="flex min-h-[68px] flex-wrap items-center gap-3 rounded-xl border border-[#E3E9DF] bg-[#F8FAF6] px-4 py-3">
              {batchYear ? (
                <>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#899188]">
                      Batch
                    </p>
                    <span className="mt-1 inline-flex rounded-md border border-[#DDE7D8] bg-white px-2.5 py-1 text-sm font-semibold text-[#45664A]">
                      {batchYear.batch}
                    </span>
                  </div>

                  <div className="h-8 w-px bg-[#E0E7DC]" />

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#899188]">
                      Service year
                    </p>
                    <span className="mt-1 inline-flex rounded-md border border-[#DDE7D8] bg-white px-2.5 py-1 text-sm font-semibold text-[#45664A]">
                      {batchYear.year}
                    </span>
                  </div>

                  <span className="ml-auto text-xs text-[#899188]">
                    Auto-derived
                  </span>
                </>
              ) : (
                <p className="m-0 text-sm text-[#899188]">
                  Enter a valid state code to calculate the batch and year.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Banking information */}
      <section className="border-t border-[#E9EDE6] pt-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#29392D]">
            Banking details
            <span className="ml-2 text-xs font-normal text-[#899188]">
              Optional
            </span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#899188]">
            Only enter these details if your register requires them.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.slice(8).map(([name, label, type]) => (
            <div key={name}>
              <label htmlFor={`corper-${name}`} className={labelClass}>
                {label}
              </label>

              <input
                id={`corper-${name}`}
                name={name}
                type={type}
                className={inputClass}
                defaultValue={
                  initial ? (initial[name] ?? "") as string : ""
                }
                placeholder={
                  name === "bank_name"
                    ? "Enter bank name"
                    : "Enter account number"
                }
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[#EBCFC7] bg-[#FFF7F4] p-4 text-sm text-[#A34E3B]"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[#EBCFC7] text-xs font-bold">
            !
          </span>
          <p className="m-0 leading-6">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-3 border-t border-[#E9EDE6] bg-white/95 px-5 py-4 backdrop-blur-sm sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#DDE3D9] bg-white px-5 text-sm font-semibold text-[#526353] transition hover:bg-[#F5F7F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57]"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#285239] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E432D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          )}
          {busy
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Add corper"}
        </button>
      </div>
    </form>
  );
}