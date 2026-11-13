# SCS Management — A to Z ডিপ্লয়মেন্ট নোট (Netlify + Supabase)

> এই ফাইলটা প্রতিবার কোড বদলানোর পর আপডেট রাখা হয়। নতুন Netlify বা Supabase অ্যাকাউন্টে শুরু থেকে সেটআপ করতে শুধু এই নোট অনুসরণ করুন।
> শেষ আপডেট: 2026-11-13 (ডাটাবেস ভার্সন 3)

## 🔄 আপডেট লগ — প্রতিবার কী Run/আপলোড করতে হবে

SQL কোড সবসময় `supabase/schema.sql` ফাইলে থাকে। এটা পুরোটা আবার Run করা নিরাপদ, আগের ডাটা মুছে না।

| তারিখ | SQL Run লাগবে? | কী আপলোড করবেন | কী বদলেছে |
|---|---|---|---|
| 2026-11-13 (v3.1) | **না** — নতুন SQL লাগবে না (v3-এর `schema.sql` আগে Run করে থাকলে যথেষ্ট) | `admin.html`, `index.html`, `activity.html`, `assets/scs-core.js`, `assets/portal.css` | ইউজার ক্লিক করলে "উধাও" হওয়া ঠিক (কারণ: ব্রাউজার সেভ করা ইমেইল সার্চ বক্সে অটোফিল করছিল), নতুন Users & access UI (পরিসংখ্যান কার্ড, অনুমোদনের অপেক্ষার তালিকা, ক্লিক করলে ম্যানেজ পপআপ), হোম পেজ থেকে Recent activity সরিয়ে টপ বারে 🕘 আইকন |
| 2026-11-13 (v3) | **হ্যাঁ** — পুরো `supabase/schema.sql` | সব ফাইল (বিশেষ করে `index.html`, `admin.html`, `profile.html`, `assets/`, `apps/`, `netlify/functions/`, `netlify.toml`) | SMS কোড দিয়ে অ্যাকাউন্ট খোলা/লগইন, "Unregistered API key" ঠিক, অনুমোদন ঠিক, Employee ID বদলানো যায়, টপ বারে হোম বাটন, গোলাপি হোম পেজ, Google Drive অটো ব্যাকআপ + রিস্টোর |
| 2026-11-13 (v2) | হ্যাঁ | সব ফাইল | প্রোফাইল = এমপ্লয়ি, অ্যাডমিন পিন, নোটিফিকেশন, লোগো, Admin Console |

> ডাটাবেস আপডেট হয়েছে কি না: Admin Console খুললে উপরে লাল সতর্কবার্তা না এলে ঠিক আছে।
> SQL Run-এর পর "Success. No rows returned" দেখালেই সফল।

## যা যা লাগবে

| জিনিস | কোথা থেকে | কোথায় বসবে |
|---|---|---|
| Supabase **Project URL** | Supabase → Project Settings → Data API (বা API) | `assets/config.js` + Netlify env var |
| Supabase **anon / publishable key** | Project Settings → API Keys | `assets/config.js` + Netlify env var |
| Supabase **service_role / secret key** (গোপন) | ওই একই পেজ | **শুধু** Netlify env var — কোনো ফাইলে কখনো না |

> **কী-এর দুই রকম ফরম্যাট আছে, দুটোই চলে।** পুরনোটা "Legacy API keys" ট্যাবে থাকে, `eyJ...` দিয়ে শুরু (anon + service_role)।
> নতুনটা `sb_publishable_...` আর `sb_secret_...`। যেটাই নিন, **তিনটা মান অবশ্যই একই প্রজেক্টের** হতে হবে।
> কী Rotate বা বদলালে Netlify আর `config.js` দুই জায়গাতেই নতুনটা বসাতে হবে। নইলে "Unregistered API key" দেখায়।
| Netlify সাইট ঠিকানা (যেমন `https://scs-xyz.netlify.app`) | Netlify → Site overview | Supabase → Authentication → URL Configuration |

---

## A. Supabase (ডাটাবেস + লগইন)

> আগের Supabase প্রজেক্টই ব্যবহার করলে A1 বাদ দিন। ডাটা যেমন আছে তেমনই থাকবে।

**A1. নতুন প্রজেক্ট (শুধু একদম নতুন হলে)**
supabase.com → New project → Region: Singapore → নাম আর ডাটাবেস পাসওয়ার্ড দিয়ে Create।

**A2. ডাটাবেস তৈরি / আপডেট**
SQL Editor → New query → `supabase/schema.sql` ফাইলের **পুরোটা** পেস্ট → Run → "Success" দেখাবে।
কোড আপডেটের পর আবার Run করা নিরাপদ, আগের ডাটা মুছে যায় না।

**A3. লগইনের ঠিকানা (প্রতিবার Netlify ঠিকানা বদলালে আবার করবেন)**
Authentication → URL Configuration:
- **Site URL** = `https://<আপনার-সাইট>.netlify.app`
- **Redirect URLs** → Add URL → `https://<আপনার-সাইট>.netlify.app/**`

এটা না করলে কনফার্মেশন আর রিসেট লিংক `localhost`-এ যায়, তখন লিংক "connect হয় না"।

**A4. পাসওয়ার্ড রিসেটের ইমেইলে কোড**
Authentication → Emails → Templates → **Reset Password** → Message body-তে নিচেরটা পেস্ট করে Save:
```html
<h2>Reset your SCS Management password</h2>
<p>Your reset code:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Enter this code on the "Reset password" page, or click: <a href="{{ .ConfirmationURL }}">Reset password</a></p>
```

**A5. ইমেইল কনফার্মেশন বন্ধ রাখা (সুপারিশ)**
Supabase-এর নিজের ইমেইল সার্ভিস ঘণ্টায় মাত্র ২–৩টা ইমেইল পাঠায়। বেশি হলে অ্যাকাউন্ট খোলার সময় "email rate limit exceeded" দেখায়।
প্রতিটা অ্যাকাউন্ট এমনিতেই অ্যাডমিন অনুমোদন না দেওয়া পর্যন্ত কোনো অ্যাপে ঢুকতে পারে না, তাই ইমেইল কনফার্মেশন বন্ধ রাখলেও নিরাপদ:
Authentication → **Sign In / Providers** → **Email** → **Confirm email** = OFF → Save।
(Supabase-এর নতুন ড্যাশবোর্ডে অপশনটা Authentication → Settings-এও থাকতে পারে।)

**A6. (সুপারিশ) নিজের SMTP — ইমেইল রিসেট কোডের জন্য**
Authentication → Emails → **SMTP Settings** → Enable custom SMTP। উদাহরণ, Gmail:
- Host `smtp.gmail.com`, Port `465`, Username = আপনার Gmail
- Password = Google Account → Security → 2-Step Verification চালু করে → **App passwords** থেকে বানানো ১৬ অক্ষরের পাসওয়ার্ড
- Sender email = ওই Gmail, Sender name = `SCS Management`

এরপর Authentication → **Rate Limits**-এ "emails per hour" বাড়ানো যায় (যেমন 30)।
মোবাইল SMS দিয়ে রিসেট (Admin Console → SMS gateway) ইমেইল ছাড়াই কাজ করে।

**A7. কী তিনটা কপি করুন:** Project URL, anon public key, service_role key।

---

## B. কোডে Supabase কী বসানো

`assets/config.js`:
```js
SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',   // anon public key (service_role না!)
```

---

## C. GitHub

1. github.com → New repository → Private → Create।
   আগের repo-তেই কাজ চালিয়ে গেলে এই ধাপ বাদ দিন।
2. "uploading an existing file" (বা Add file → Upload files) → `SCS Management` ফোল্ডারের **ভেতরের সব কিছু** টেনে ছাড়ুন → Commit।
   - `config.js`-এ আসল কী বসানো থাকতে হবে। লোকাল ফাইলে placeholder থাকলে সেটা আপলোড করবেন না, নইলে সাইটে "Setup pending" দেখাবে।
   - `service_role` key কোনো ফাইলে যেন না থাকে।

---

## D. Netlify

1. app.netlify.com → **Add new project → Import an existing project → GitHub** → অনুমতি দিন → repo বাছুন।
   - GitHub repo অন্য জিমেইলের অ্যাকাউন্টে থাকলেও চলবে। GitHub অনুমতির পেজে "Configure the Netlify app on GitHub" দিয়ে সেই repo-র access দিন।
2. Build settings: **Build command ফাঁকা**, **Publish directory `.`**, Functions directory `netlify/functions`।
   এগুলো `netlify.toml` নিজেই সেট করে দেয়।
3. Deploy চাপার আগে বা পরে, **Project configuration → Environment variables → Add a variable**-এ এই তিনটা যোগ করুন:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |

   Scope: All scopes। Values: Same value for all deploy contexts।
4. **Deploys → Trigger deploy → Deploy project**, যাতে ভেরিয়েবলগুলো কাজে লাগে।
5. সাইটের ঠিকানা কপি করে **A3**-এ বসান।
   চাইলে Site configuration → Change site name দিয়ে ঠিকানা বদলাতে পারেন, কিন্তু বদলালে A3 আবার করতে হবে।

**Secret scanning:** `netlify.toml`-এ `SECRETS_SCAN_OMIT_KEYS = "SUPABASE_URL,SUPABASE_ANON_KEY"` আছে, কারণ এই দুটো ইচ্ছে করেই পাবলিক।
service_role key কোনো ফাইলে পাওয়া গেলে ডিপ্লয় আটকে যাবে, এটাই হওয়া উচিত।

**Credit বাঁচানো:** ফ্রি প্ল্যানে প্রতিটা production deploy-এ credit খরচ হয়।
- অনেকগুলো ফাইল একবারে আপলোড/commit করুন, বারবার ছোট ছোট commit করবেন না।
- দরকার হলে Site configuration → Build & deploy → Continuous deployment-এ "Deploy Previews" বন্ধ রাখুন।

> Drag & Drop (app.netlify.com/drop) ডিপ্লয়ে সার্ভার ফাংশন যায় না, তাই SMS, মোবাইলে রিসেট কোড আর পুশ নোটিফিকেশন চলবে না। সবসময় GitHub দিয়ে ডিপ্লয় করুন।

---

## E. প্রথম Super Admin

1. সাইট খুলে নিজের ইমেইল দিয়ে **Create account** → (Confirm email চালু থাকলে ইমেইলের লিংকে কনফার্ম) → লগইন → প্রোফাইল ছবি দিন।
2. Supabase → SQL Editor → **New query** → নিচের কোড (শুরুতে `--` ছাড়া) পেস্ট করে নিজের ইমেইল বসিয়ে Run:
   ```sql
   insert into public.profiles (id, email, status, is_super_admin)
   select id, email, 'active', true from auth.users where lower(email) = lower('your-email@example.com')
   on conflict (id) do update set status = 'active', is_super_admin = true;
   ```
3. সাইটে রিফ্রেশ → ⚙️ → **Admin Console** দেখা যাবে।

আগের Supabase প্রজেক্ট রেখে শুধু Netlify বদলালে এই ধাপ লাগবে না, আগের Super Admin থেকে যাবে।

---

## F. Admin Console-এ প্রথম কাজ

1. **Apps & admin PINs** → প্রতিটা অ্যাপের ৪ সংখ্যার পিন বদলান (ডিফল্ট `2026`)।
2. **SMS gateway** → প্রথমে **Server check** চাপুন। সব ✅ হলে এন্ডপয়েন্ট URL, API key আর Sender ID দিয়ে Save → Send test SMS।
   - Server check-এ ❌ "Supabase key ভুল" দেখালে D3 ধাপের Netlify env vars ঠিক করে Trigger deploy দিন।
   - টেস্ট SMS-এ "SMS provider: ..." error দেখালে মেসেজটা আপনার SMS কোম্পানির। API key, Sender ID বা ব্যালান্স চেক করুন।
   - SMS কাজ করলে নতুন অ্যাকাউন্ট খোলা, লগইন আর পাসওয়ার্ড রিসেট মোবাইল কোড দিয়েই হবে। ইমেইল লিমিটের সমস্যা আর থাকবে না।
3. **Logo** → দরকার হলে নতুন লোগো আপলোড করুন।
4. **Users & access** → "Waiting for your approval" কার্ডে **Approve & give access** চাপুন। পপআপে প্রতিটা অ্যাপে No access / User / Admin বেছে নিন, দরকার হলে Employee ID দিন, তারপর **Approve & save**। পরে যেকোনো ইউজারের উপর ক্লিক করলে একই পপআপে সব বদলানো যায়।
5. Chemical Order → Admin (পিন দিয়ে) → SMS Setup আর PDF & Letterhead আবার চেক করুন।
6. **Backup** → Google Drive অটো ব্যাকআপ (নিচে H দেখুন)।

---

## H. Google Drive অটো ব্যাকআপ (একবার সেটআপ)

এখানে সব অ্যাপের পুরো লাইফটাইম ডাটা একটা JSON ফাইলে যায়, আর সেটা দিয়েই রিস্টোর করা যায়।
ব্যাকআপ Supabase নিজেই সময়মতো পাঠায় (pg_cron + pg_net), তাই Netlify credit খরচ হয় না।

1. Google Drive-এ একটা ফোল্ডার বানান, যেমন "SCS Backup"। তার লিংক কপি করুন।
2. Admin Console → **Backup** → "One-time setup" খুলে **Copy Apps Script code** চাপুন। কোডে টোকেন আগেই বসানো থাকে।
   - ফাইলটা প্রজেক্টের `google-drive-backup/Code.gs`-এও আছে। সেটা ব্যবহার করলে TOKEN নিজে বসাতে হবে।
3. script.google.com → New project → কোড পেস্ট → ফাংশন **authorize** বেছে Run → অনুমতি দিন।
4. Deploy → **New deployment** → Web app → Execute as **Me** → Who has access **Anyone** → Deploy → **Web app URL** কপি করুন।
5. Admin Console-এ Drive ফোল্ডারের লিংক আর Web app URL বসিয়ে সময় বেছে নিন: প্রতি মিনিট, ঘণ্টা, দিন, ইত্যাদি। কয়টা ফাইল রাখবেন সেটাও দিন। তারপর **Save & schedule**।
6. **Send to Drive now** চাপুন। কয়েক সেকেন্ড পর **Refresh status**-এ ✅ 200 বা 302 দেখালে Drive-এ ফাইল চলে গেছে।
- "pg_net" বা "pg_cron" error এলে: Supabase → **Database → Extensions** → `pg_net` আর `pg_cron` চালু করে `schema.sql` আবার Run করুন।
- **রিস্টোর:** Admin Console → Backup → **Restore from file** → Drive থেকে নামানো JSON দিন। শুধু যেগুলো নেই সেগুলো যোগ হয়, আগের ডাটা বদলায় না।
  একদম নতুন Supabase প্রজেক্টে রিস্টোর করলে আগে ইউজারদের আবার অ্যাকাউন্ট খুলতে হবে। প্রোফাইল তখনই জোড়া লাগে, কারণ লগইন পাসওয়ার্ড ব্যাকআপে থাকে না।
- ছবি আর PDF Supabase Storage-এ থাকে, JSON-এ না।

---

## G. চেকলিস্ট (সব ঠিক আছে কি না)

- [ ] সাইট খুললে লগইন পেজ আসে, "Setup pending" নয় → `config.js` ঠিক আছে।
- [ ] অ্যাকাউন্ট খোলার কনফার্মেশন লিংক Netlify সাইটে নিয়ে যায় → A3 ঠিক আছে।
- [ ] Forgot password → By email → কোড আসে আর কাজ করে → A4 ঠিক আছে।
- [ ] Forgot password → By mobile SMS → কোড আসে → Netlify env vars + SMS gateway ঠিক আছে।
- [ ] Create account → মোবাইলে কোড আসে → অ্যাকাউন্ট খুলে যায় (ইমেইল লাগে না)।
- [ ] লগইন পেজে মোবাইল নম্বর + পাসওয়ার্ড, আর "Log in with SMS code" দুটোই কাজ করে।
- [ ] Admin Console → Backup → Send to Drive now → Drive ফোল্ডারে JSON ফাইল আসে।
- [ ] ⚙️ → Push notifications → ON → আবার চাপলে OK = টেস্ট নোটিফিকেশন আসে।
- [ ] অ্যাপের Admin ট্যাবে পিন চায়, আর User রোলে ঢুকতে দেয় না।

## সমস্যা হলে

| দেখাচ্ছে | কারণ / সমাধান |
|---|---|
| "Setup pending" | `config.js`-এ URL বা anon key নেই বা ভুল |
| "email rate limit exceeded" | Supabase-এর ফ্রি ইমেইল লিমিট শেষ। A5 অনুযায়ী Confirm email বন্ধ করুন, আর/অথবা A6 অনুযায়ী নিজের SMTP দিন |
| Build fail: "Secrets scanning" | কোনো ফাইলে service_role key আছে, সেটা মুছুন। অথবা `netlify.toml` আপলোড হয়নি |
| রিসেট/কনফার্ম লিংক localhost-এ যায় | A3 করা হয়নি বা পুরনো ঠিকানা আছে |
| "Netlify function not found" / SMS যায় না | Drag & Drop দিয়ে ডিপ্লয় হয়েছে, GitHub দিয়ে করুন। অথবা env vars নেই, যোগ করে Trigger deploy দিন |
| "Unregistered API key" / "Invalid API key" | Netlify env var-এর Supabase key ভুল, অন্য প্রজেক্টের, বা rotate করা পুরনো key। Supabase থেকে আবার কপি করে বসান (আগে-পিছে ফাঁকা জায়গা ছাড়া) → Trigger deploy। Admin Console → SMS gateway → **Server check** দিয়ে যাচাই করুন |
| SMS টেস্টে "SMS provider: ..." | এই মেসেজ SMS কোম্পানির: API key, Sender ID, ব্যালান্স বা IP whitelist চেক করুন |
| Admin Console-এ লাল "database is not up to date" | সর্বশেষ `supabase/schema.sql` পুরোটা Run করুন |
| ইউজার তালিকা থেকে কেউ "উধাও" হয়ে যায় | সার্চ বক্সে কিছু লেখা আছে কি না দেখুন। হলুদ "Search: … showing x / y" বারে **Clear search** চাপুন (v3.1-এ ব্রাউজারের অটোফিল বন্ধ করা হয়েছে) |
| অনুমোদন/অ্যাক্সেস সেভ হয় না | লাল বার্তায় কারণ দেখাবে। সাধারণত schema.sql পুরনো, অথবা আপনি Super Admin নন (E ধাপ) |
| কোনো অ্যাপে অ্যাডমিন পিন চায় না | GitHub-এ সেই অ্যাপের `apps/<app>/app.js` আর `backend.js` পুরনো রয়ে গেছে। নতুনগুলো আপলোড করুন, তারপর ব্রাউজারে Ctrl+F5 |
| "Permission denied" | অ্যাকাউন্টের ওই অ্যাপে অ্যাক্সেস নেই, Admin Console থেকে দিন |
| লগইন করে অনুমোদনের অপেক্ষা দেখায় | Admin Console-এ অনুমোদন দিন, অথবা প্রথমবার হলে E ধাপ করুন |
