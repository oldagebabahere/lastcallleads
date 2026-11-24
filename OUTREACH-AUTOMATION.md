# Last Call Leads — Simple 1-Time Launch Guide ($0 Monthly Cost)

Bas yeh **5 kaam 1 baar** karne hain. Iske baad pura system 24/7 apne aap chalega — na dashboard button dabana hai, na phone/laptop on rakhna hai.

---

## Step 1 — 3 Naye Free Gmail Accounts Banao (Outreach Ke Liye)
Apna `supportlastcallleads@gmail.com` sirf support ke liye rakho. Outreach ke liye **3 naye free Gmail accounts** banao (jaise `alex.lastcallleads@gmail.com`, `sam.lastcallleads@gmail.com`, `ryan.lastcallleads@gmail.com`).

Har Gmail account me (4 total: 1 support + 3 outreach):
1. `myaccount.google.com` → **Security** → **2-Step Verification ON** karo.
2. Search bar me likho **App Passwords** → koi bhi naam daalo (jaise `LastCall`) → **16-letter password** milega, note kar lo.

---

## Step 2 — Resend Free Account (`resend.com`) + Cloudflare Domain Connect Karo
1. `resend.com` pe free account banao ($0/month = 3,000 emails/month free).
2. **Domains → Add Domain** → apna Cloudflare domain daalo → **Automatic Cloudflare DNS Verify** click karo.
3. **API Keys → Create API Key** → key copy kar lo (`re_...`).
4. Cloudflare Email Routing already `support@yourdomain.com` ke replies tumhare `supportlastcallleads@gmail.com` me bhej dega.

---

## Step 3 — Free Database (`neon.tech`) + Payment (`dodopayments.com`)
1. `neon.tech` pe free PostgreSQL project banao → `DATABASE_URL` copy karo.
2. `dodopayments.com` pe 2 monthly USD products banao:
   - **Territory** (`$129/mo`) → Product ID copy karo (`DODO_PRODUCT_SOLO`)
   - **Multi-State** (`$249/mo`) → Product ID copy karo (`DODO_PRODUCT_PRO`)
   - Webhook URL add karo: `https://YOUR-DOMAIN.com/api/webhooks/dodopayments` → Secret copy karo (`DODO_WEBHOOK_SECRET`).

---

## Step 4 — Vercel Hobby (Free) Pe Deploy + Env Vars Paste Karo
GitHub pe push karke Vercel me import karo, aur **Project → Settings → Environment Variables** me `.env.example` wali values daalo:
- `DATABASE_URL` (Neon se)
- `ADMIN_KEY`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET` (koi bhi 3 alag lambe random passwords)
- `NEXT_PUBLIC_SITE_URL` (`https://yourdomain.com`)
- `NEXT_PUBLIC_CONTACT_EMAIL` (`support@yourdomain.com`)
- `NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS` (apna city/state address)
- `RESEND_API_KEY` + `ALERT_FROM_EMAIL="Last Call Leads <alerts@yourdomain.com>"`
- `SMTP_USER="supportlastcallleads@gmail.com"` + `SMTP_PASS="16-letter-app-pass"` (auto-failover backup!)
- `OUTREACH_SMTP_ACCOUNTS="gmail1@gmail.com:apppass1, gmail2@gmail.com:apppass2, gmail3@gmail.com:apppass3"`
- `DODO_API_KEY`, `DODO_PRODUCT_SOLO`, `DODO_PRODUCT_PRO`, `DODO_WEBHOOK_SECRET`
- **Free Phone Alerts (Optional):** Telegram me `@BotFather` se free bot banao → `TELEGRAM_BOT_TOKEN` aur `TELEGRAM_CHAT_ID` daalo.

Deploy hone ke baad `https://yourdomain.com/api/health` kholo — `ok: true` aur `outreachActive: true` dikhna chahiye.

---

## Step 5 — Google Apps Script Free 24/7 Alarm Clock Set Karo (1 Minute)
1. `https://script.google.com` kholo → **New Project**.
2. `scripts/google-apps-script-cron.gs` ka pura code copy karke paste karo.
3. Top pe `SITE_URL` aur `CRON_SECRET` bharo.
4. Dropdown me **`installAutopilotTriggers`** select karke **Run** dabao → Allow permissions.

**KHATAM!** Ab:
- Pehla 9-state data pull khud ho jayega (no manual dashboard clicks).
- Har 2 ghante (US business hours) me 5 human-paced cold emails + automatic 3-day warm follow-ups 3 Gmails me rotate hoke jayengi.
- Roz subah paid & trial customers ko unke territory ke naye bars + interactive map + Google Maps route email hoga.
- Har Mon/Wed/Fri Telegram pe ready-to-paste LinkedIn post aayega (10 second me share kar dena).
- `https://yourdomain.com/sitemap.xml` ko **Google Search Console** me submit kar do taaki free Google SEO traffic start ho!
