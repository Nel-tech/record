# NYSC Corper Register

A private, mobile-first register for NYSC CLOs and CDS presidents. It uses Next.js App Router, TypeScript, Tailwind CSS v4, Supabase Auth/Postgres with row-level security, and the Gemini API for optional register-photo extraction.

## Requirements

- Node.js 20 or newer
- A Supabase project (or the Supabase CLI for local development)
- A Gemini API key to enable photo scanning (Google AI Studio offers a free tier, subject to model availability, quotas, and its terms)

## Environment

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key used by the browser and server session client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used for first CLO setup and the seed script; never expose it to the browser |
| `GEMINI_API_KEY` | Server-only Gemini API key for photo scanning |
| `GEMINI_MODEL` | Gemini model name; defaults to `gemini-2.5-flash` |
| `CLO_SETUP_CODE` | Strong, temporary secret required to create the first CLO account |

The service-role, Gemini, and CLO setup secrets must only be configured in server environments. Do not prefix them with `NEXT_PUBLIC_`. The Gemini free tier may use submitted content to improve Google's products; review its current terms and quotas before scanning personal information.

## Supabase setup

1. Create a Supabase project, then install the Supabase CLI. For a hosted project, run `supabase login` and `supabase link --project-ref <project-ref>`.
2. Apply all migrations in `supabase/migrations` in filename order, including `202610240001_initial_clo_signup.sql`. You can run `supabase db push` or paste each migration into the Supabase SQL Editor in order.
3. The migrations create the schema, approval and scan-rate-limit RPCs, RLS policies, and signup choices for `Nsit-Ibom, Akwa Ibom` with its Agro-Allied, Anti-Corruption, Medicals, Sanitation, SDG, Education, Gender and Charity, and Sports CDS groups. A fictional `Demo State / Central LGA` catalog is also included. Only LGA and CDS group names/IDs are readable before sign-in; profiles and corper data remain private. Add other catalog choices with SQL as needed.
4. Add a strong random `CLO_SETUP_CODE` to `.env.local` (for example, generate one with PowerShell: `$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); [Convert]::ToBase64String($bytes)`) and restart the app. Give this code privately to the first CLO.
5. On the CLO tab, choose **Create account**, enter the setup code, select the LGA, and register the CLO email and password. The app approves this first CLO automatically. After setup succeeds, remove `CLO_SETUP_CODE` from the server environment and restart/redeploy. The database also enforces that only one self-service CLO signup can succeed; subsequent signups are rejected even if the setup code remains configured.
6. Set the Supabase project's Site URL and redirect URLs to the deployed app origin. Presidents create fresh accounts through the CDS president tab, choose an LGA and CDS group, and wait for a CLO in that LGA to approve access. Existing CDL logins are not used.

The location-options endpoint uses the anon key and returns only LGA/CDS group names and IDs to populate signup. The signup catalog is intentionally public; corper data and user profiles remain protected by RLS. Apply all migrations before loading the signup form.

## Run locally

For a local Supabase stack, run `supabase start`, then use `supabase status -o env` to get the local API URL, anon key, and service-role key for `.env.local`. Copy them into the `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` variables. Set a strong `CLO_SETUP_CODE` for the first CLO signup. Create a Gemini API key in Google AI Studio and set `GEMINI_API_KEY` if you want to test photo scanning.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. To seed fictional corper records after setting up an approved CLO:

```sh
npm run seed
```

The seed script uses the first approved CLO profile and first CDS group in that CLO's LGA. Its sample people and state codes are fictional.

## Deploy a production test on Vercel

1. Push this project to a private GitHub repository. Do not commit `.env.local`, API keys, or the Supabase service-role key; `.gitignore` excludes local environment files and Vercel output.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the project root as the repository root. The included `vercel.json` selects Next.js and uses `npm ci` followed by `npm run build`.
3. Before the first deployment, add these environment variables in **Project Settings → Environment Variables** for the **Production** environment:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CLO_SETUP_CODE` (a long random, one-time code to create the first CLO)
   - `GEMINI_API_KEY` and `GEMINI_MODEL` only if you want to test photo scanning
4. Apply all SQL migrations to the Supabase project used by those variables before testing signup. Set Supabase **Authentication → URL Configuration → Site URL** to the Vercel production URL, and add that URL (and any Vercel preview URLs you plan to use) to the allowed redirect URLs.
5. Deploy. Create the first CLO using the setup code. Once that succeeds, remove `CLO_SETUP_CODE` from the Vercel Production environment variables and redeploy. The database blocks later CLO self-signups regardless.
6. Test sign-in, approval, roster access, and imports using fictional test records first. The app does not bundle or migrate your Supabase database automatically. Keep real personal information out of a public test deployment.

Vercel needs a Git repository connection or an authenticated Vercel CLI session to deploy. This workspace has not been linked to a Git remote or Vercel project, so importing it and providing the environment variables are required to publish it.

## Database tests

The RLS test suite is in `supabase/tests/corper_rls.test.sql`. With the Supabase CLI installed:

```sh
supabase start
supabase test db
```

It verifies CLO LGA isolation, president CDS-group isolation, pending-president denial, allowed/denied president writes, and president delete denial.

## Photo scanning

The CLO-only scan flow accepts up to 10 JPEG, PNG, or WebP images (8 MB each). The browser resizes them to a maximum 1600-pixel edge before posting to `/api/scan`. The server applies an atomic per-user limit of five scan requests per minute, calls Gemini (default model `gemini-2.5-flash`), validates the response with Zod, and returns entries to the editable import preview. Images are processed in memory and are not stored by this app. Google's own processing and retention terms still apply; the free tier may use submitted content to improve its products.

## Register rules

- State codes must match `AK/26B/2400`. The two-digit year maps to 20YY and the A/B/C letter plus the selected 1/2 stream forms the batch.
- State codes are unique. The database also checks the derived batch and year.
- CLOs can manage all corpers and approve presidents in their LGA. Approved presidents can view, add, and update corpers only in their own LGA and CDS group. The UI limits edit/delete actions to CLOs.
- RLS is enforced in Postgres independently of the UI. No anonymous role has corper or profile access.
