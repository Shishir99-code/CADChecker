# Deployment Guide for CADChecker

This guide walks you through deploying CADChecker to Vercel with a Postgres database, making it accessible to FRC teams worldwide.

## Prerequisites

- [Vercel account](https://vercel.com/signup) (free tier works great)
- Your GitHub repo linked to Vercel
- Onshape OAuth credentials (already registered in your .env)

## Step-by-Step Deployment

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Link Your Project to Vercel

```bash
vercel link
```

This will:
- Prompt you to log into Vercel (if not already)
- Create a new Vercel project linked to your GitHub repo
- Generate a project ID

### 3. Create a Vercel Postgres Database

In the [Vercel Dashboard](https://vercel.com/dashboard):

1. Go to **Storage** → **Create** → **Postgres**
2. Select **Vercel Postgres** as the database type
3. Name it `cadchecker-db`
4. Confirm — Vercel automatically creates the database and links it to your project
5. Go back to your project's **Settings** → **Environment Variables**

### 4. Configure Environment Variables in Vercel

In the Vercel Dashboard, navigate to your project's **Settings** → **Environment Variables** and add:

| Variable Name | Value | Source |
|---|---|---|
| `ONSHAPE_CLIENT_ID` | `26ZHKWYYMGCB6AMEKJMAZIBKA2M45QDDNUYTMIY=` | From your `.env` file |
| `ONSHAPE_CLIENT_SECRET` | (from your `.env`) | From your `.env` file |
| `ONSHAPE_REDIRECT_URI` | `https://<your-vercel-domain>/auth/onshape/callback` | Vercel will assign this after first deploy |
| `SESSION_SECRET` | (from your `.env`, or generate new: `openssl rand -hex 32`) | From your `.env` file |

**Note:** After your first deploy, Vercel will assign you a domain like `cadchecker-<random>.vercel.app`. Update `ONSHAPE_REDIRECT_URI` with that actual domain.

### 5. Update Your Onshape OAuth App

Now that you have your Vercel domain, update your Onshape OAuth application:

1. Go to [Onshape Developer Portal](https://cad.onshape.com/appstore/dev-portal)
2. Select your OAuth application
3. Update **Redirect URIs** to include: `https://<your-vercel-domain>/auth/onshape/callback`
4. Update **Extension Action URL** to: `https://<your-vercel-domain>/`
5. Save

### 6. Deploy to Vercel

```bash
vercel deploy --prod
```

This will:
- Build your app (`npm run build`)
- Upload to Vercel
- Create a live HTTPS endpoint
- Initialize your database schema automatically on first run

**Your live URL will be shown at the end** — something like `https://cadchecker-abc123.vercel.app`

### 7. Verify Deployment

1. Visit your live URL (should redirect to Onshape OAuth login)
2. Click "Connect to Onshape"
3. Authorize with your Onshape account
4. Open an Onshape document with a robot assembly
5. Try running a check — it should pass/fail and show results

## Database Schema

The deployment automatically creates two tables:

**`checks`** — every legality check run
- `id` — unique check ID
- `onshape_user_id` — Onshape user who ran the check
- `onshape_team_id` — user's Onshape team
- `document_id`, `workspace_id`, `element_id` — the assembly checked
- `passed` — boolean: all rules passed?
- `violations` — JSON array of failed rules
- `created_at` — timestamp

**`teams`** (optional for future features)
- Map Onshape team IDs to FRC team numbers

## Sharing on Chief Delphi

Once deployed and tested, share your live URL on Chief Delphi:

> **CADChecker — Free FRC Robot Legality Checker**
> 
> An Onshape extension that checks your robot design against FRC rules in real-time.
> 
> **Try it:** https://your-live-url.vercel.app
> 
> Just click the link, authorize with Onshape, and run a legality check on your assembly. No installation, no fees — all checks are instant and cite the specific rule being verified.

## Troubleshooting

### OAuth redirect fails
- Verify `ONSHAPE_REDIRECT_URI` matches your Vercel domain exactly (case-sensitive)
- Check that it's registered in the [Onshape Developer Portal](https://cad.onshape.com/appstore/dev-portal)

### "Database connection failed"
- Vercel Postgres should auto-link when you create it; if not, manually add `POSTGRES_URL` to Environment Variables (copy it from your database's Connection String in the Vercel Dashboard)

### Checks aren't persisting
- Check Vercel Function logs: **Deployments** → **Recent** → **Functions** tab
- Database schema should auto-create; if tables are missing, redeploy with `vercel deploy --prod`

### Need to redeploy after making changes
```bash
git push  # commit and push to GitHub
vercel deploy --prod  # Vercel auto-deploys on every push if you configure it
```

## Environment Variables Reference

| Variable | Required | Example | Notes |
|---|---|---|---|
| `ONSHAPE_CLIENT_ID` | ✅ | `26ZHKWYYMGCB6...` | From Onshape Dev Portal |
| `ONSHAPE_CLIENT_SECRET` | ✅ | `H74CRKOAWT6A...` | From Onshape Dev Portal, never hardcode |
| `ONSHAPE_REDIRECT_URI` | ✅ | `https://cadchecker-abc.vercel.app/auth/onshape/callback` | Must match OAuth app config |
| `SESSION_SECRET` | ✅ | (random 32-byte hex) | Generate: `openssl rand -hex 32` |
| `PORT` | ❌ | `3000` | Vercel sets this automatically |
| `POSTGRES_URL` | ❌ (auto) | `postgres://user:pass@...` | Vercel injects automatically |

## Monitoring & Maintenance

### View Logs
```bash
vercel logs <your-project-name>
```

### View Database Usage
[Vercel Dashboard](https://vercel.com/dashboard) → **Storage** → **Postgres** → Monitor queries, connections, and storage

### Periodic Backups
Vercel Postgres includes automated backups; you can view them in the Storage tab.

## Next Steps

- **Check history UI** — Add a dashboard so teams can see their past checks
- **Team analytics** — Track which rules fail most often
- **Webhooks** — Auto-check when a team updates their design
- **FeatureScript** — Embed instant checks directly in Onshape (v2+)
