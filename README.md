
# 🥝 KiwiTeach Deployment Guide

This application is ready to be hosted on **Vercel**.

## Local development

1. Run `npm install` and `npm run dev` from the `Kiwiteach-Quiz` folder.
2. **Supabase:** If you do not create a `.env`, `npm run dev` uses built-in **development defaults** (same project as before) so the app does not white-screen. To point at another project or match production, copy **`.env.example`** → **`.env`** and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. **Gemini:** Set **`VITE_GEMINI_API_KEY`** in `.env` when you use AI features (Neural Studio, refine prompts, etc.).

`.env` is gitignored; never commit secrets.

## Deploy on Vercel

1. **Push to GitHub** (without `.env`).
2. **Import to Vercel** and connect the repo.
3. **Environment variables** (Project → Settings → Environment Variables).  
   Add the **same** names as in `.env.example`, for **Production** (and **Preview** if you use preview deploys):

   | Variable | Notes |
   |----------|--------|
   | `VITE_GEMINI_API_KEY` | Gemini API key |
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |

   Optional aliases also supported: `VITE_GOOGLE_GENAI_API_KEY`, `VITE_GEMINI_KEY`, `VITE_API_KEY` (prefer `VITE_GEMINI_API_KEY`).

4. **Redeploy** after changing env vars so the Vite build picks them up.

## Security notes

- **Gemini:** The key is bundled into the client JS on build. Anyone can open DevTools in production, so treat it as a **quota-limited** key; restrict by HTTP referrer / bundle in Google Cloud if possible.
- **Supabase:** The anon key is **always** visible in the browser for a Vite SPA. Real security is **Row Level Security (RLS)** and policies in Supabase — not hiding the anon key.
- Never commit `.env` or paste production keys into source files.

## Database

Supabase credentials are read from environment variables only (`supabase/client.ts`).
