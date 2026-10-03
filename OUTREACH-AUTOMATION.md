# 🤖 OUTREACH AUTOMATION — Gmail se daily personalized emails (FREE)

> **Kya ye karta hai:** Roz subah tumhari site se 25 leads aati hain (naam, city, **asli is-hafte ki filings count**, AI-personalized pehli line) → Google Sheet me girti hain → tumhare Gmail se personalized email chalti hai. **Tum sirf replies ka jawab dete ho.** Cost: ₹0 (Gmail + Groq free tier + Google Sheets free).

---

## SETUP (ek baar, 15 minute)

### Step 1 — Site pe AI keys daalo (Vercel → Settings → Environment Variables)
```
GROQ_API_KEY=gsk_...        ← console.groq.com se FREE (preferred, fast)
# ya
GEMINI_API_KEY=AIza...      ← aistudio.google.com se FREE
```
(Key nahi bhi daalo to bhi chalega — smart template line use hoti hai.)

### Step 2 — State me prospects harvest karo (ek baar)
Apna control room kholo → **PROSPECT FINDER** → apna state RUN karo (TX/FL pehle).
(Ye attorneys/insurance/beverage-sellers nikalta hai — jo tumhari site KHARIDENGE.)

### Step 3 — Google Sheet banao
- Naya Google Sheet → naam "Last Call Outreach"
- Row 1 me ye headers (A se I):
```
FirstName | Company | Email | County/City | Filings | Status | SentDate | FollowDate | AiLine
```

### Step 4 — Apps Script paste karo
Google Sheet me: **Extensions → Apps Script** → purana code delete → neeche ka pura code paste → Save.

### Step 5 — Script me sirf 4 cheezein badlo (upar wale CONFIG block me)
```
SITE_URL    = "https://tumhari-site.vercel.app"
ADMIN_KEY   = "tumhara-admin-key"
FROM_NAME   = "Amrit"
POSTAL_ADDRESS = "apna real address (CAN-SPAM law)"
```
**STATE KA KOI JHANJHAT NAHI** — script `state=AUTO` maangta hai. Site khud
hafta-war state rotate karti hai (jis states me prospects harvested hain unme
ghoomta hai). Prospects ka pool bhi apne aap badhta hai (roz ek naya state
daily job se judta hai). Tumhe kuch nahi badalna — kabhi nahi.

### Step 6 — Ek baar `setupDailyTrigger` function RUN karo
(Functions dropdown me `setupDailyTrigger` select → Run → permission allow)
Ho gaya. **Ab roz 9 AM US-Eastern automatic chalega.**

---

## APPS SCRIPT v2 (purA code — copy paste)

```javascript
// ============================================================
// LAST CALL LEADS — Outreach Automation v2
// Roz: site se 25 AI-personalized leads pull + 4-step email sequence
// Setup: OUTREACH-AUTOMATION.md ke Steps follow karo
// ============================================================

const SHEET_NAME = "Leads";
const FROM_NAME  = "Amrit";
const SITE_URL   = "https://tumhari-site.vercel.app";   // ← BADLO
const ADMIN_KEY  = "TUMHARA-ADMIN-KEY";                  // ← BADLO
const DAILY_LIMIT = 25;

const POSTAL_ADDRESS = "APNA REAL POSTAL ADDRESS";       // ← BADLO (CAN-SPAM)
const FOOTER = `

--
If you'd rather not hear from me, just reply "stop" and I won't email again.
Last Call Leads, ${POSTAL_ADDRESS}`;

const COL = {
  firstName: 1, company: 2, email: 3, county: 4, filings: 5,
  status: 6, sentDate: 7, followDate: 8, aiLine: 9,
};

// ============================================================
// STEP 1 — site se aaj ki leads pull karo (AI line + real filings ke saath)
// ============================================================
function pullLeads() {
  const url = `${SITE_URL}/api/admin/outreach?state=AUTO&key=${ADMIN_KEY}&limit=25`; // AUTO = site khud rotate karti hai
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    Logger.log(`Site se leads nahi aayi: ${res.getContentText().slice(0, 200)}`);
    return;
  }
  const data = JSON.parse(res.getContentText());
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log(`Sheet "${SHEET_NAME}" nahi mili`); return; }

  // already-listed companies skip (duplicate protection)
  const seen = new Set(
    sheet.getRange(2, COL.company, Math.max(sheet.getLastRow() - 1, 1), 1)
      .getValues().flat().map(v => String(v).trim().toLowerCase())
  );

  let added = 0;
  data.leads.forEach(l => {
    if (seen.has(l.company.toLowerCase())) return;
    sheet.appendRow([
      l.contactName || guessFirst(l.company),  // FirstName
      l.company,                               // Company
      l.email || "",                           // Email (guessed info@ ya khali)
      l.city || "",                            // City
      l.filingsThisWeek,                       // asli filings count
      "NEW",                                   // Status
      "", "",                                  // SentDate, FollowDate
      l.aiLine,                                // AI personalized line
    ]);
    seen.add(l.company.toLowerCase());
    added++;
  });
  Logger.log(`✅ ${added} nayi leads add hui (${data.leads.length} me se). Filings this week: ${data.filingsThisWeek}`);
}

function guessFirst(company) {
  const m = company.match(/\b([A-Z][a-z]+)\s+(Insurance|Agency|Group|Law|LLC|Co)/);
  return m ? m[1] : "there";
}

// ============================================================
// STEP 2 — emails (AI line pehli email me inject hoti hai)
// ============================================================
function email1(firstName, company, county, filings, aiLine) {
  const hook = aiLine && aiLine.length > 20
    ? aiLine
    : `${filings} new venues filed liquor licenses in ${county} this week.`;
  return {
    subject: `New bar filings in ${county} this week`,
    body:
`Hi ${firstName},

${hook}

These venues are 60-90 days from opening and haven't picked their suppliers yet.

Want the free list for your county? Just reply "yes" — no card, no call.

Sample: ${SITE_URL}/sample

${FROM_NAME}
Last Call Leads`
  };
}

function email2(firstName, county, filings) {
  return {
    subject: `Re: New bar filings in ${county}`,
    body:
`Hi ${firstName},

Following up — ${filings} new filings in ${county} this week alone.

Most distributors find out about a new bar after it already has a supplier. We flag it the day the license is filed — 60-90 days before opening.

Worth a look? Just reply and I'll send the full list.

${FROM_NAME}`
  };
}

function email3(firstName) {
  return {
    subject: `How this works`,
    body:
`Hi ${firstName},

Quick overview — $129/month gets you:

- Daily email every morning
- Every new liquor license filed in your state
- Name, address, county, license type, phone where published
- Only genuinely new filings (no repeats)

Free sample for your county first if you want to test before paying.

Worth 2 minutes? Reply here and I'll set it up.

${FROM_NAME}`
  };
}

function email4(firstName) {
  return {
    subject: `Leaving the door open`,
    body:
`Hi ${firstName},

Last note — no pressure either way.

If new-bar leads ever become useful, the free sample is always here: ${SITE_URL}/sample

Good luck this quarter.

${FROM_NAME}`
  };
}

// ============================================================
// STEP 3 — roz ka sender (sequence + follow-ups)
// ============================================================
function runDailyOutreach() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let sentToday = 0;
  const today = new Date();

  for (let i = 1; i < data.length; i++) {
    if (sentToday >= DAILY_LIMIT) break;

    const row = data[i];
    const firstName = row[COL.firstName - 1] || "there";
    const company   = row[COL.company - 1]   || "";
    const email     = String(row[COL.email - 1] || "").trim();
    const county    = row[COL.county - 1]    || "your county";
    const filings   = row[COL.filings - 1]   || "several";
    const status    = row[COL.status - 1]    || "NEW";
    const followDate = row[COL.followDate - 1];
    const aiLine    = row[COL.aiLine - 1]    || "";

    if (!email) continue; // email nahi hai → phone-only lead, CALL karo
    if (status === "REPLIED" || status === "SKIP" || status === "DONE") continue;
    if (status !== "NEW" && new Date(followDate) > today) continue;

    let template;
    if (status === "NEW")         template = email1(firstName, company, county, filings, aiLine);
    else if (status === "SENT_1") template = email2(firstName, county, filings);
    else if (status === "SENT_2") template = email3(firstName);
    else if (status === "SENT_3") template = email4(firstName);
    else continue;

    try {
      GmailApp.sendEmail(email, template.subject, template.body + FOOTER, {
        name: `${FROM_NAME} — Last Call Leads`,
      });

      const nextStatus = { NEW: "SENT_1", SENT_1: "SENT_2", SENT_2: "SENT_3", SENT_3: "DONE" }[status];
      const days = { NEW: 4, SENT_1: 4, SENT_2: 6, SENT_3: 0 }[status];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + days);

      sheet.getRange(i + 1, COL.status).setValue(nextStatus);
      sheet.getRange(i + 1, COL.sentDate).setValue(today.toDateString());
      sheet.getRange(i + 1, COL.followDate).setValue(nextDate.toDateString());
      sentToday++;
      Logger.log(`✅ Sent to ${email} (${company}) — ${nextStatus}`);
    } catch (err) {
      Logger.log(`❌ Failed ${email}: ${err}`);
    }

    if (sentToday < DAILY_LIMIT) Utilities.sleep(8000);
  }
  Logger.log(`Done. ${sentToday} emails sent.`);
}

// ============================================================
// DAILY JOB — ye trigger chalata hai (pull + send)
// ============================================================
function dailyJob() {
  pullLeads();
  runDailyOutreach();
}

// EK BAAR CHALAO — daily trigger set
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("dailyJob")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
  Logger.log("✅ Daily trigger set — roz 9 AM (sheet ka timezone) pull+send automatic");
}
```

---

## REPLY AAYE TO (5 min/din)
1. **"Yes" / interested** → unke county ke 3-5 latest filings ka naam+address bhejo (site `/feed?state=XX` se) + trial link: `tumhari-site.vercel.app` pe sign up bol do (7 din free, card nahi)
2. **Objection "data kaise?"** → `/sample` link + `/coverage` link
3. **"Stop"** → Sheet me us row ka Status = `SKIP`

## ⚠️ DELIVERABILITY RULES (Gmail protect karne ke liye)
- **25/day se zyada mat bhejo** (naya Gmail account ho to pehle hafte 10/day)
- Guessed `info@` emails pe bounce aaye to Sheet me Status = `SKIP` kar do (bounce Gmail reputation kharab karta hai)
- Reply ka rate > 5% aa raha hai = sab sahi chal raha hai
- Subject me kabhi "FREE!!!" ya sab-caps mat likhna

## ROTATION — 100% AUTOMATIC (tumhe kuch nahi karna)
- Site khud decide karti hai is hafte kaunsa state (jahan prospects + filings sabse ready hain)
- Prospects ka pool roz apne aap badhta hai (daily job ek naya state harvest karta hai jab tak 5 na ho)
- TX/FL/CA jaise bade states ke liye ek baar dashboard → PROSPECT FINDER → RUN daba dena (optional, zyada leads ke liye)
- Har Monday ko tumhe recap email aayega: "is hafte ka state, kitni filings aayi, biggest fish kaun"
