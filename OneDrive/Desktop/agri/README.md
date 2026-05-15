# Agri — Fertilizer & Liquid Shop

This repo contains a prototype full-stack agriculture ecommerce app (React + Vite frontend, Express backend).

Quick start

1. Copy environment variables into `.env` (optional): `MONGO_URI`, `OPENWEATHER_API_KEY`, `HF_API_KEY`, `HF_MODEL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `AWS_REGION`, `SHOP_PHONE`.
2. Install dependencies:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
```

3. Start backend and frontend in separate terminals:

```bash
node backend/server.js
npm --prefix frontend run dev
```

Notes
- The backend will use an in-memory fallback for products, orders and chat when `MONGO_URI` is not provided. To enable persistence, set `MONGO_URI` and restart.
- The `/api/checkout/whatsapp` endpoint returns a WhatsApp URL for COD orders using `SHOP_PHONE` (E.164 format).
- S3/Hugging Face/Twilio integrations are optional and enabled when respective env vars are present.

CI
- Basic CI runs smoke tests in `backend/` defined in `.github/workflows/ci.yml`.
# GreenGrow Fertilizers — Starter Monorepo

This repository is a starter scaffold for the GreenGrow Fertilizers website: a React + Vite frontend and an Express backend.

Quick start (Windows PowerShell):

1. Install root dev tools:

```powershell
npm install
```

2. Install backend and frontend deps:

```powershell
npm install --prefix backend
npm install --prefix frontend
```

3. Start (run server and client separately):

```powershell
npm run start:server
npm run start:client
```

Or install `concurrently` and run `npm run dev` from repo root.
