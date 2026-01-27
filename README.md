
# 🥝 KiwiTeach Deployment Guide

This application is ready to be hosted on **Vercel**.

## Steps to Deploy

1. **Push to GitHub**: Upload this directory to a new GitHub repository.
2. **Import to Vercel**: Connect your GitHub account to Vercel and import the repository.
3. **Environment Variables**:
   In the Vercel project settings, add the following Environment Variable:
   - `API_KEY`: Your Google Gemini API Key (obtained from [Google AI Studio](https://aistudio.google.com/)).
4. **Deploy**: Click "Deploy". Vercel will automatically run the build script and host your site.

## Database Note
The Supabase connection is currently hardcoded in `supabase/client.ts`. For production environments, it is recommended to move `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Vercel Environment Variables as well.
