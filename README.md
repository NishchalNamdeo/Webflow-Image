# Bulk Image Cleaner (Webflow Designer Extension + Backend OAuth)

## What you get
- **Backend (Node/Express + TypeScript + Redis optional)**
  - Same OAuth workflow as your CMS app
  - `GET /auth` → redirects to Webflow OAuth
  - `GET /auth/callback` → stores token/session → redirects to **https://webflow.com/dashboard** (or a safe `redirectTo`)
  - No frontend "Authorize" button is needed

- **Frontend (Webflow Designer Extension, React + TS + Webpack + Tailwind)**
  - Runs directly inside Designer
  - Scans **only images** (assets panel)
  - Detects usage in:
    - Image elements
    - Page OG/Search images
    - Styles/background images (best-effort)
  - Lets you select and delete unused images (with progress + confirm)


## Setup (Local)

### 1) Backend

```bash
cd backend
cp .env.example .env
npm i
npm run dev
```

Set your env values in `backend/.env`:
- `PORT=3001`
- `FRONTEND_URL=http://localhost:1337`
- `FRONTEND_ORIGINS=http://localhost:1337,http://127.0.0.1:1337`
- `SESSION_SECRET=...`
- `WEBFLOW_CLIENT_ID=...`
- `WEBFLOW_CLIENT_SECRET=...`
- `WEBFLOW_REDIRECT_URI=http://localhost:3001/auth/callback`
- `REDIS_URL=` (optional)


### 2) Frontend (Designer Extension)

```bash
cd frontend
cp .env.example .env
npm i
npm run dev
```

This starts:
- Webflow extension server at `http://localhost:1337`
- Webpack watcher
- Tailwind watcher


## OAuth flow (same as CMS app)

1. Open your backend:
   - `http://localhost:3001/auth?redirectTo=https://webflow.com/dashboard`
2. Authorize in Webflow
3. You will be redirected to `https://webflow.com/dashboard`
4. Open your Designer Extension — it will work directly.


## Notes
- Images referenced inside **custom code / embeds** may not be detected.
- Deleting assets is irreversible.
