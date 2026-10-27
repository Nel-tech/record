"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LocationOption } from "@/lib/types";

type LocationData = { lgas: (LocationOption & { state_name: string })[]; groups: LocationOption[] };

export function AuthScreen() {
  const router = useRouter();
  const [role, setRole] = useState<"clo" | "president">("clo");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [locations, setLocations] = useState<LocationData>({ lgas: [], groups: [] });
  const [lgaId, setLgaId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/locations").then(async (response) => {
      const result: LocationData | { error: string } = await response.json();
      if (!response.ok || "error" in result) throw new Error("error" in result ? result.error : "Unable to load account options.");
      setLocations(result);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load account options."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    try {
      if (role === "president" && mode === "signup") {
        if (!lgaId || !groupId) throw new Error("Choose your LGA and CDS group to request an account.");
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role: "president", lga_id: lgaId, cds_group_id: groupId } },
        });
        if (signupError) throw signupError;
        if (data.session) {
          setNotice("Your account request is awaiting approval from a CLO in your LGA.");
          router.push("/register");
          router.refresh();
        } else {
          setNotice("Account created. Check your email to confirm, then wait for a CLO to approve access.");
        }
      } else if (role === "clo" && mode === "signup") {
        if (!lgaId) throw new Error("Choose your LGA.");
        const response = await fetch("/api/clo-signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            lgaId,
            setupCode: String(form.get("setup-code") ?? ""),
          }),
        });
        const result: { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to create the CLO account.");
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
        if (signinError) throw signinError;
        router.push("/register");
        router.refresh();
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
        if (signinError) throw signinError;
        router.push("/register");
        router.refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete sign in.");
    } finally {
      setBusy(false);
    }
  }

  const groups = locations.groups.filter((group) => group.lga_id === lgaId);

  
   
return (
  <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[#F5F6F2] font-sans text-[#202B23] selection:bg-[#DCE8D8]">
    {/* Subtle background detail */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        backgroundImage:
          "radial-gradient(#B9C6B6 0.7px, transparent 0.7px)",
        backgroundSize: "22px 22px",
      }}
    />

    {/* Application header */}
    <header className="relative z-10 border-b border-[#E5E8E0] bg-[#F9FAF7]/90">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <a
          href="/"
          className="flex items-center gap-3 no-underline"
          aria-label="Corper Register home"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-[#244B35] text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" />
              <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H20" />
              <path d="M9 7h6M9 10h6" />
            </svg>
          </div>

          <div>
            <p className="text-[14px] font-bold tracking-[-0.03em]">
              Corper Register
            </p>
            <p className="mt-0.5 text-[11px] font-medium tracking-wide text-[#7A867B]">
              NYSC COMMUNITY TOOLS
            </p>
          </div>
        </a>

        <div className="hidden items-center gap-2 rounded-full border border-[#DFE6DC] bg-white px-3 py-2 sm:flex">
          <span className="size-2 rounded-full bg-[#58825B]" />
          <span className="text-xs font-medium text-[#536654]">
            Secure account access
          </span>
        </div>

        <div className="flex size-9 items-center justify-center rounded-full border border-[#E0E5DC] bg-white text-sm font-semibold text-[#49644D] sm:hidden">
          CR
        </div>
      </div>
    </header>

    {/* Main content */}
    <section className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
      <div className="w-full max-w-[440px]">

        {/* Intro */}
        <div className="mb-7">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#DCE5D9] bg-white/80 px-3 py-1.5">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-4 text-[#416849]"
              aria-hidden="true"
            >
              <rect x="3.5" y="8" width="13" height="9" rx="2" />
              <path d="M6.5 8V5.5a3.5 3.5 0 0 1 7 0V8M10 11v3" />
            </svg>
            <span className="text-xs font-semibold text-[#49664D]">
              PRIVATE REGISTER
            </span>
          </div>

          <h1 className="text-[32px] font-semibold tracking-[-0.055em] sm:text-[36px]">
            {mode === "signup"
              ? "Request access"
              : "Welcome back"}
          </h1>

          <p className="mt-2 text-[14px] leading-6 text-[#788279]">
            {mode === "signup"
              ? "Submit a request to join your CDS register."
              : "Sign in to continue to your community register."}
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-[#E0E5DC] bg-white p-5 shadow-[0_8px_35px_rgba(34,54,37,0.045)] sm:p-7">

          {/* Role selector */}
          <div
            className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-[#F1F3EE] p-1"
            role="tablist"
            aria-label="Account role"
          >
            <button
              type="button"
              role="tab"
              aria-selected={role === "clo"}
              onClick={() => {
                setRole("clo");
                setMode("signin");
                setError("");
                setNotice("");
              }}
              className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-[13px] font-semibold transition-all ${
                role === "clo"
                  ? "bg-white text-[#244B35] shadow-sm ring-1 ring-black/[0.04]"
                  : "text-[#7A847B] hover:text-[#344B39]"
              }`}
            >
              CLO
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={role === "president"}
              onClick={() => {
                setRole("president");
                setMode("signin");
                setError("");
                setNotice("");
              }}
              className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-[13px] font-semibold transition-all ${
                role === "president"
                  ? "bg-white text-[#244B35] shadow-sm ring-1 ring-black/[0.04]"
                  : "text-[#7A847B] hover:text-[#344B39]"
              }`}
            >
              CDS President
            </button>
          </div>

          <form onSubmit={submit} className="space-y-5">

            {/* President registration fields */}
            {mode === "signup" && (
              <div className="space-y-4 rounded-xl border border-[#E5E9E1] bg-[#F8F9F6] p-4">
                <div>
                  <label
                    htmlFor="signup-lga"
                    className="mb-2 block text-[13px] font-semibold text-[#344638]"
                  >
                    Local Government Area
                  </label>

                  <select
                    id="signup-lga"
                    className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-[13px] text-[#26382A] outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                    value={lgaId}
                    onChange={(event) => {
                      setLgaId(event.target.value);
                      setGroupId("");
                    }}
                    required
                  >
                    <option value="">Select your LGA</option>
                    {locations.lgas.map((lga) => (
                      <option key={lga.id} value={lga.id}>
                        {lga.name} · {lga.state_name}
                      </option>
                    ))}
                  </select>
                </div>

                {role === "president" && <div>
                  <label
                    htmlFor="signup-group"
                    className="mb-2 block text-[13px] font-semibold text-[#344638]"
                  >
                    CDS group
                  </label>

                  <select
                    id="signup-group"
                    className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-[13px] text-[#26382A] outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10 disabled:cursor-not-allowed disabled:bg-[#F0F2ED] disabled:text-[#A0A8A0]"
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                    required
                    disabled={!lgaId}
                  >
                    <option value="">Select your CDS group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>}
                {role === "clo" && <div>
                  <label
                    htmlFor="setup-code"
                    className="mb-2 block text-[13px] font-semibold text-[#344638]"
                  >
                    CLO setup code
                  </label>
                  <input
                    id="setup-code"
                    name="setup-code"
                    type="password"
                    autoComplete="off"
                    required
                    className="min-h-11 w-full rounded-lg border border-[#DDE3D9] bg-white px-3 text-[13px] text-[#26382A] outline-none transition focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
                  />
                  <p className="mt-2 text-xs text-[#879087]">
                    Ask the app administrator for the one-time setup code.
                  </p>
                </div>}
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-[13px] font-semibold text-[#344638]"
              >
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
                className="min-h-12 w-full rounded-lg border border-[#DDE3D9] bg-white px-3.5 text-sm text-[#26382A] outline-none transition placeholder:text-[#A2AAA1] hover:border-[#C5D0C2] focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[13px] font-semibold text-[#344638]"
              >
                Password
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                minLength={8}
                placeholder="Enter your password"
                required
                className="min-h-12 w-full rounded-lg border border-[#DDE3D9] bg-white px-3.5 text-sm text-[#26382A] outline-none transition placeholder:text-[#A2AAA1] hover:border-[#C5D0C2] focus:border-[#527A57] focus:ring-4 focus:ring-[#527A57]/10"
              />

              {mode === "signup" && (
                <p className="mt-2 text-xs text-[#879087]">
                  Use at least 8 characters.
                </p>
              )}
            </div>

            {/* Feedback */}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[#F0D6D0] bg-[#FFF7F5] px-3.5 py-3 text-[13px] leading-5 text-[#A34E3B]"
              >
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                className="rounded-lg border border-[#D7E8D7] bg-[#F2F8F0] px-3.5 py-3 text-[13px] leading-5 text-[#386542]"
              >
                {notice}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={busy || (mode === "signup" && locations.lgas.length === 0)}
              className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#285239] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E432D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#527A57] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? role === "clo" ? "Create CLO account" : "Request access"
                    : "Sign in"}
              </span>

              {!busy && (
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                >
                  <path d="M4 10h12M10 4l6 6-6 6" />
                </svg>
              )}
            </button>
          </form>

          {/* Registration mode */}
          {(role === "president" || role === "clo") && (
            <div className="mt-6 border-t border-[#EDF0EA] pt-5 text-center">
              <p className="text-[13px] text-[#7A847B]">
                {mode === "signin"
                  ? role === "clo" ? "First CLO setup?" : "New CDS president?"
                  : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="font-semibold text-[#285239] underline decoration-[#A5BCA6] underline-offset-4 transition hover:text-[#193A27]"
                  onClick={() => {
                    setMode(
                      mode === "signin" ? "signup" : "signin"
                    );
                    setError("");
                    setNotice("");
                  }}
                >
                  {mode === "signin"
                    ? role === "clo" ? "Create account" : "Request access"
                    : "Sign in"}
                </button>
              </p>
            </div>
          )}
        </div>

        {/* Supporting information */}
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#E3E7DE] bg-white/65 px-4 py-3.5">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mt-0.5 size-4 shrink-0 text-[#67816A]"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 9v4M10 6.5h.01" />
          </svg>

          <p className="text-xs leading-5 text-[#7B857B]">
            {role === "clo"
              ? mode === "signup"
                ? "Only the first CLO can register. After the first account is created, CLO signup closes automatically."
                : "Sign in with your CLO account, or use the one-time setup code to create the first CLO account."
              : "CDS presidents can request access using their LGA and CDS group details."}
          </p>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="relative z-10 border-t border-[#E5E8E0] bg-[#F9FAF7]/80 px-5 py-4">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-[11px] text-[#899188] sm:flex-row">
        <p>Corper Register</p>
        <p>Local Government Area · CDS Service</p>
      </div>
    </footer>
  </main>
);

  
}
