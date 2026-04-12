# ShiftPortal — Full Deployment Guide
# Ikan FM Internal Test → Trial Sites → SaaS Launch

---

## Overview

| Layer        | Service  | Cost         | Purpose                          |
|-------------|----------|-------------|----------------------------------|
| Database    | Railway  | ~£4/month   | PostgreSQL — all data            |
| Backend API | Railway  | included    | FastAPI — business logic         |
| Frontend    | Vercel   | Free        | React — staff + HR + superadmin  |
| Domain      | GoDaddy  | You own it  | portal.ikanfm.co.uk via CNAME    |

Total running cost: ~£4/month

---

## PART 1 — Push code to GitHub (5 mins)

### Step 1: Create a GitHub repository

1. Go to github.com → New repository
2. Name: `shiftportal` (or `ikan-saas`)
3. Visibility: **Private**
4. Click Create repository — do NOT add README or .gitignore

### Step 2: Push from your computer

Open Terminal inside the `ikan-saas` folder and run:

```bash
git init
git add .
git commit -m "Initial commit — ShiftPortal multi-tenant SaaS"
git remote add origin https://github.com/YOUR-USERNAME/shiftportal.git
git branch -M main
git push -u origin main
```

---

## PART 2 — Deploy the Backend on Railway (15 mins)

### Step 1: Create a Railway project

1. Go to railway.app and log in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `shiftportal` repository
4. Railway detects it and begins deployment (it will fail at this point — that's expected, you haven't set env vars yet)

### Step 2: Add PostgreSQL database

1. Inside your Railway project, click **+ New Service**
2. Select **Database → PostgreSQL**
3. Railway creates the database and automatically sets `DATABASE_URL` in your backend service

### Step 3: Configure environment variables

In your Railway **backend service** → **Variables** tab, add these (click + Add Variable for each):

```
SECRET_KEY          = (run: python3 -c "import secrets; print(secrets.token_hex(32))")
SUPERADMIN_EMAIL    = admin@ikanfm.co.uk
SUPERADMIN_PASSWORD = (choose a strong password — you'll change it after first login)
```

Note: `DATABASE_URL` is already set automatically by Railway. Do NOT add it manually.

### Step 4: Set root directory

In Railway **backend service** → **Settings → Source**:
- **Root Directory:** leave blank (the Procfile at the root handles it)

Wait 2-3 minutes for Railway to build and deploy. You'll see a green checkmark when done.

### Step 5: Get your Railway URL

In Railway → your backend service → **Settings → Networking → Generate Domain**

Your API URL will look like: `https://shiftportal-production.up.railway.app`

**Test it:** Open `https://YOUR-URL.railway.app/health` in your browser.
You should see: `{"status":"ok"}`

If you see an error, check Railway → **Deployments → Logs** for the specific error.

### Step 6: Run the seed script

This creates your superadmin account, Ikan FM as the first organisation, the HR admin account, and all 22 sites in one go.

**Option A — Railway CLI (recommended):**
```bash
# Install Railway CLI if you haven't
npm install -g @railway/cli

# Login
railway login

# Run the seed script against your live database
railway run python seed_ikan_fm.py
```

**Option B — Railway dashboard:**
1. Go to Railway → your service → **Deploy → Run Command**
2. Enter: `python seed_ikan_fm.py`
3. Click Run

You should see output like:
```
✅ Superadmin created: admin@ikanfm.co.uk
✅ Organisation created: Ikan Facilities Management Limited
✅ 30-day trial subscription created
✅ HR admin created: hr@ikanfm.co.uk
✅ 22 new sites added
```

---

## PART 3 — Deploy the Frontend on Vercel (10 mins)

### Step 1: Import the project

1. Go to vercel.com → New Project
2. Click **Import Git Repository** → select your `shiftportal` repo
3. Vercel detects it as a Vite project

### Step 2: Configure build settings

In the Vercel setup screen:
- **Root Directory:** `frontend`
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

### Step 3: Add environment variable

In **Environment Variables**, add:

```
VITE_API_URL = https://YOUR-RAILWAY-URL.railway.app/api
```

(Replace with your actual Railway URL from Part 2, Step 5)

### Step 4: Deploy

Click **Deploy**. Vercel builds in ~60 seconds.

Your portal will be live at something like: `https://shiftportal.vercel.app`

---

## PART 4 — Connect your domain (10 mins)

To use `portal.ikanfm.co.uk` as the portal URL:

### On Vercel:
1. Your project → **Settings → Domains**
2. Add domain: `portal.ikanfm.co.uk`
3. Vercel shows you a CNAME record to add

### On GoDaddy:
1. Log in → My Products → DNS for `ikanfm.co.uk`
2. Add a new record:
   - **Type:** CNAME
   - **Name:** `portal`
   - **Value:** `cname.vercel-dns.com`
   - **TTL:** 1 hour
3. Save

Wait 10–30 minutes for DNS to propagate globally.

**Test:** Open `https://portal.ikanfm.co.uk` — you should see the Ikan FM login page.

---

## PART 5 — First login and setup (10 mins)

### Login as Superadmin
1. Go to `https://portal.ikanfm.co.uk/login`
2. Email: `admin@ikanfm.co.uk`
3. Password: whatever you set in `SUPERADMIN_PASSWORD` env var

You'll land on the Superadmin dashboard. You should see Ikan FM listed as the first organisation on trial.

### Login as HR Admin
1. Sign out of superadmin
2. Go to `https://portal.ikanfm.co.uk/login/ikan-fm`
   (the `/ikan-fm` slug loads Ikan FM's branding)
3. Email: `hr@ikanfm.co.uk`
4. Password: `IkanFM2026!`

You'll land on the HR dashboard. Immediately:
- Go to **Settings → Branding & Contract** and upload your logo URL
- Check the contract details are correct
- Visit **Settings → Registration Links** to get the QR code and link for staff

### Staff registration link
The link for Ikan FM staff to register is:
```
https://portal.ikanfm.co.uk/register/ikan-fm
```
or the matching QR code from Settings → Registration Links.

---

## PART 6 — Test the full staff flow

1. Open `https://portal.ikanfm.co.uk/register/ikan-fm`
2. Complete the 5-step registration with test details
3. Sign in as HR: you should see the registration in **Registrations** tab
4. Click **Review** → set start date, pay rate, site → **Activate Account**
5. Sign in with the test staff email and password
6. You should land on the light-themed staff dashboard
7. Test adding a timelog — the site dropdown should show all 22 Ikan FM sites
8. Test a holiday request — check the 4-week rule is enforced
9. Test the contract PDF download — check your company name and address appear

---

## PART 7 — Trial at 2-3 sites

Once internal testing passes, share the registration link with staff at your chosen trial sites (e.g. Star City and Harrow):

```
https://portal.ikanfm.co.uk/register/ikan-fm
```

Or print the QR code from Settings → Registration Links and stick it in the site office.

As HR, you review each registration, activate the account, and set the site assignment.

---

## PART 8 — Onboard a new SaaS client

When you're ready to sell this to another business:

1. Log in as superadmin at `portal.ikanfm.co.uk/login`
   (or your own superadmin URL if you've bought a SaaS domain)
2. Go to **New Organisation**
3. Fill in their details — a slug like `security-co`, their HR admin name and a temporary password
4. Click **Create Organisation**
5. Share with the new client:
   - Login URL: `https://portal.ikanfm.co.uk/login/security-co`
   - Register URL: `https://portal.ikanfm.co.uk/register/security-co`
   - HR email and temporary password
6. They log in, set up their own sites, customise their branding colour, and start onboarding their staff

Each organisation's data is completely isolated — their staff cannot see Ikan FM data and vice versa.

---

## Pricing to implement when ready

When you're ready to charge:
- Add Stripe keys to Railway env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- Plans: Starter £49/month (up to 25 staff), Growth £99/month (up to 75 staff), Enterprise £199/month (unlimited)
- The subscription model is already in the database — it just needs Stripe webhooks to update `subscription.status` on payment

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Railway won't deploy | Check Logs → usually a missing package in requirements.txt |
| "CORS error" in browser | Check VITE_API_URL in Vercel matches your Railway URL exactly |
| 401 on login | Seed script hasn't run, or wrong password |
| Sites not appearing in timelog | Log in as HR, go to Settings → Sites, check sites are listed |
| Contract shows wrong company name | HR → Settings → Branding & Contract → update employer name |
| QR code not working | Check the registration link is correct in Settings → Registration Links |
| Domain not working | DNS propagation takes up to 30 mins; check GoDaddy CNAME is `cname.vercel-dns.com` |

---

## Environment Variables — Quick Reference

### Railway (backend)
| Variable | Value |
|---|---|
| `DATABASE_URL` | Set automatically by Railway |
| `SECRET_KEY` | Long random string (32+ hex chars) |
| `SUPERADMIN_EMAIL` | admin@ikanfm.co.uk |
| `SUPERADMIN_PASSWORD` | Your superadmin password |

### Vercel (frontend)
| Variable | Value |
|---|---|
| `VITE_API_URL` | https://YOUR-APP.railway.app/api |

---

## Future additions (roadmap)

- Email notifications (staff activation, holiday approved)
- Payslip generation
- Rota/scheduling
- Mobile app (React Native using same API)
- Stripe billing for SaaS clients
- Custom subdomain per client (security-co.shiftportal.co.uk)
