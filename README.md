# Punchlister landing page

Static landing page + a single Vercel serverless function that receives pilot applications and emails them via Resend.

## Local preview

Just open `index.html` in a browser. The form will fail gracefully (the `/api/apply` endpoint only exists when deployed or running `vercel dev`).

To test the full flow locally:

```sh
npm i -g vercel
vercel dev
```

Then visit http://localhost:3000.

## Deploy to Vercel

1. Push the repo to GitHub (or any git host Vercel can reach).
2. On vercel.com → "Add New… → Project" → import this repo. No build step needed; Vercel auto-detects `index.html` + `api/`.
3. In **Project Settings → Environment Variables**, add:

   | Name                | Value                                                    |
   |---------------------|----------------------------------------------------------|
   | `RESEND_API_KEY`    | API key from [resend.com](https://resend.com)            |
   | `LEAD_NOTIFY_EMAIL` | Comma-separated recipients (e.g. `hello@punchlister.com`)|
   | `LEAD_FROM_EMAIL`   | `Punchlister <pilot@yourdomain.com>` (verified in Resend)|

4. Redeploy.

## Changing where applications are sent

Change the `LEAD_NOTIFY_EMAIL` env var in Vercel and redeploy (no code change needed). Multiple addresses are supported, comma-separated:

```
LEAD_NOTIFY_EMAIL=co-founder1@punchlister.com,co-founder2@punchlister.com
```

## Domain verification (Resend)

For production, [verify your sending domain](https://resend.com/domains) in Resend and use a `LEAD_FROM_EMAIL` on that domain. Without verification, Resend only allows `onboarding@resend.dev`, which lands in spam more often.

## Self-service signup (`signup.html`)

`signup.html` is the front door for companies to create an account themselves — separate from the pilot application form on `index.html`.

- Collects **company name**, **admin email**, optional **VAT number**.
- Posts to **`https://app.punchlister.ai/api/signup`** (the app owns signup — it creates the company, invites the admin via Supabase, and links them as company **owner/admin**).
- On success it swaps the form for a "check your mailbox" state. The admin gets a Supabase email, sets a password, logs into the app, then invites their project engineers.
- **No env vars or serverless function needed here** — this page only talks to the app's API. CORS for `punchlister.ai` / `www.punchlister.ai` is allowed on that endpoint.

Linked from every page's nav as **"Start gratis"**; the pilot CTA is unchanged.
# getpunchlisted
