# Dotkeep Email Verification, simple guide

Naya user pehle apna email verify karta hai, tab hi login kar sakta hai. Isse koi bhi kisi dusre ka email lagakar account nahi bana sakta.

---

## 1. Poora flow

```
1. /signup           naam, email, password
2. Account banta hai (emailVerified: false). Koi login ya cookie nahi.
3. Email jata hai: "Verify your email for Dotkeep" + ek link
4. /login?registered=1   "We sent a verification link..."
5. User email kholta hai, link par click
6. /verify-email?token=...   page par ek "Verify my email" button
7. Button dabane par email verify hota hai  →  /login?verified=1
8. Ab login chalta hai  →  /dashboard
```

**Verify se pehle login karne par:** sahi password daalne par message aata hai "Please verify your email before signing in", saath me **"Resend verification email"** ka button. (Galat password ya anjaan email par normal "Incorrect email or password" hi aata hai, isliye koi ye nahi jaan sakta ki kaun registered hai.)

---

## 2. Link kaise kaam karta hai

| Baat | Kaise |
|---|---|
| Token | 32 random bytes. Link me wahi jata hai. |
| Database me | Sirf token ka **hash** (`emailVerifications` collection). Database leak ho to bhi koi kisi ka email verify nahi kar sakta. |
| Kitne din | **24 ghante** me expire. MongoDB expire hue links khud delete kar deta hai. |
| Kitni baar | **Sirf ek baar.** Dusri baar kholne par "invalid or has expired". |
| Naya link maangne par | Purana link turant bekaar ho jata hai. |
| Link kholna vs verify karna | Link kholne par sirf **button** dikhta hai. Verify tab hota hai jab button dabao. Kuch email scanners har link khud khol dete hain, isse token kharch ho jata. |

---

## 3. Resend ke niyam

- **60 second me ek hi baar.** Usse jaldi maango to naya email nahi jata.
- **Ek email par ghante me 5 baar.** Ek IP se ghante me 10 baar.
- **Jawab hamesha ek jaisa:** "If your account is waiting for verification, a new link is on its way." Chahe email registered ho ya na ho. Isse pata nahi chalta ki kaun registered hai.
- **Jawab ka time bhi ek jaisa** (email bhejna response ke baad hota hai).
- Email jaane me fail ho jaye to link cancel ho jata hai, taaki dobara turant maang sako.

---

## 4. Email kaise jata hai

File: [src/lib/mail.ts](../src/lib/mail.ts). Ye **SMTP** se bhejta hai (`nodemailer`), to kisi bhi service ke saath chalta hai: Gmail (app password), Brevo, Mailgun, Resend ka SMTP, ya apna mail server.

`.env.local` me:
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=Dotkeep <no-reply@yourdomain.com>
APP_URL=http://localhost:3000
```

| Halat | Kya hota hai |
|---|---|
| **Development, SMTP set nahi** | Email **terminal me print** hota hai (link ke saath). Bina kisi service ke test kar sakte ho. |
| **Development, SMTP set hai** | Asli email jata hai. |
| **Production, SMTP set nahi** | Email nahi jata. Account ban jata hai, par signup "email nahi gaya" batata hai aur log me saaf error aata hai. Link kahin print ya leak nahi hota. |
| **Production, `APP_URL` set nahi** | Wahi: email nahi jata aur log me likha aata hai ki `APP_URL` set karo. |

### `APP_URL` kyun zaroori hai
Email ka link `APP_URL` se banta hai, **request ke `Host` header se nahi.** Warna koi nakli `Host` bhejkar kisi ko aisa link bhijwa sakta hai jo kisi aur site par jaye. Test me nakli `Host` ke saath bhi link `APP_URL` par hi gaya.

### Email ki suraksha
User ka naam email ke HTML me **escape** hota hai (`<script>` jaisa naam text ban jata hai). Naam kabhi email ke header me nahi jata.

---

## 5. Purane users

Jinke document me `emailVerified` field nahi hai, unhe **verified maana jata hai**, taaki koi bahar na ho jaye. Sirf naye signup `emailVerified: false` se shuru hote hain.

---

## 6. Kahan dikhta hai

- **Admin page:** unverified user ke naam ke bagal me **Unverified** ka nishaan, aur "Registered users" tile me "N unverified".
- **Settings:** email ke neeche **Verified** (login ke liye verify zaroori hai, isliye logged-in user hamesha verified hota hai).

---

## 7. Files

```
src/lib/mail.ts                         SMTP se email, dev me terminal fallback, APP_URL
src/lib/email-verification.ts           email banana aur bhejna
src/db/email-verifications.ts           token ka hash, expiry, ek baar ka use
src/db/users.ts                         emailVerified, isEmailVerified(), markEmailVerified()
src/app/api/auth/signup/route.ts        signup + email
src/app/api/auth/login/route.ts         verify na ho to 403
src/app/api/auth/resend-verification    naya link
src/app/api/auth/verify-email           asli verify (POST)
src/app/verify-email/page.tsx           link ka page
src/modules/auth/verify-email-button.tsx
```

---

## 8. Abhi nahi hai

Unverified accounts ko X din baad apne aap delete karna, email badalna (ab possible hai par alag kaam), aur password reset (wo bhi isi email system par banega).

**Test:** asli MongoDB, asli nodemailer aur ek **nakli SMTP server** ke saath (mail kahin bahar nahi gayi): API ke 70+ checks aur Chrome me poora flow, sab pass. Asli email service (Gmail, Brevo wagairah) ke saath tumhe ek baar khud try karna hoga.
