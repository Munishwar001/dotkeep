# Dotkeep Settings, simple guide

Page: `/dashboard/settings` (sidebar me **Settings**, ya mobile par user menu me).

---

## 1. Isme kya hai

| Hissa | Kya kar sakte ho |
|---|---|
| **Profile** | Apna naam badalo. Email dikhta hai par **badal nahi sakte** (abhi email verify nahi hota, isliye jaanbujhkar band). |
| **Password** | Purana password daalke naya set karo. Badalne par **baaki saare devices logout** ho jate hain, ye wala device logged in rehta hai. |
| **Vault** | Reveal hone ke baad secret kitne second me chhupe: 5, 15 (default), 30 ya 60. Chunte hi save ho jata hai. |
| **Where you're signed in** | Jahan-jahan logged in ho unki list. Ek device ko "Sign out" karo, ya **"Sign out everywhere else"**. |
| **Delete account** | Account hamesha ke liye delete. Password dobara daalna padta hai. |

---

## 2. Har cheez andar se kaise chalti hai

| Kaam | Request | Kya hota hai |
|---|---|---|
| Naam | `PATCH /api/account/profile` | Naam trim hota hai (1 se 100 characters). Sirf naam badalta hai, body me `role` ya `email` bhejo to ignore hota hai. |
| Password | `POST /api/account/password` | Purana password verify, naya (8 se 128 characters, purane se alag) hash karke save, baaki sessions delete. |
| Vault preference | `PATCH /api/account/preferences` | Sirf 5, 15, 30, 60 allowed. Baaki sab 400. |
| Ek device logout | `DELETE /api/account/sessions/:id` | Sirf **tumhara apna** session. Dusre ka id do to 404. |
| Baaki sab logout | `DELETE /api/account/sessions/others` | Ye wala session bachta hai, baaki sab delete. |
| Account delete | `DELETE /api/account` | Password verify, phir sab delete, cookie saaf. |

Sab me: login zaroori (401), same-origin JSON (403), aur sirf apna data badalta hai.

---

## 3. Sessions ki list kaise bani

Login par hum ek **chhota label** save karte hain, jaise "Chrome on Windows" ya "Safari on iOS", jo User-Agent se nikalta hai ([device-label.ts](../src/lib/device-label.ts)).

- **IP address aur poora User-Agent save nahi hota.** Sirf label aur kab login hua.
- Jo sessions is feature se pehle ke hain unka label "Unknown device" dikhta hai.
- Session 7 din me apne aap expire ho jata hai.
- List me token ya hash kabhi nahi jata.

---

## 4. Account delete karne par kya jata hai

Is order me delete hota hai: sessions, secrets, projects, login events, aur **aakhir me user.** User sabse last isliye, ki beech me kuch fail ho jaye to bhi login chalta rahe aur dobara try kar sako.

- **Akela admin delete nahi ho sakta.** Message aata hai: "You are the only admin. Make someone else an admin first." Pehle `npm run make-admin -- <email>` se kisi aur ko admin banao.
- Delete ke baad wahi email se dobara naya account ban sakta hai.
- Jo kuch delete hua wo wapas nahi aata.

---

## 5. Suraksha

| Cheez | Kaise |
|---|---|
| Password badalna / account delete | **Purana password zaroori.** Chori hui session se koi password nahi badal sakta ya account nahi hata sakta |
| Password guess karna | Dono routes ka ek hi counter: **15 minute me 5 koshish**, phir 429 |
| Dusre ka session | Sirf apne sessions dikhte aur hatte hain |
| Password badalne ke baad | Baaki saare devices turant logout |
| Delete ke baad | Purani cookie turant kaam nahi karti |
| Vault ki chaabi | Settings usse bina bhi chalti hai |

Rate limit memory me hai, server restart par reset hota hai (jaise login ka).

---

## 6. Mobile par navigation

Chhoti screen par sidebar chhup jati hai, isliye **user menu me** ab links hain: Overview, Vault, Projects, Settings (aur admin ko Admin). Bade screen par ye links menu me nahi dikhte kyunki sidebar hai.

---

## 7. Files

```
src/app/dashboard/settings/page.tsx     Settings page
src/app/api/account/...                 profile, password, preferences, sessions, delete
src/db/account.ts                       naam, password, preference, account delete
src/db/sessions.ts                      sessions ki list, ek ya baaki sab hatana
src/lib/device-label.ts                 User-Agent se "Chrome on Windows" jaisa label
src/lib/account-input.ts                server par validation
src/modules/settings/                   forms, sessions list, delete dialog
```

---

## 8. Abhi nahi hai

Email badalna, aur theme (dark mode). Admin ke paas kisi user ka 2FA band karne ka button bhi nahi hai.

---

## 9. Two-factor authentication (2FA)

Settings me **Two-factor authentication** section. Authenticator app (Google Authenticator, Authy, 1Password...) ke 6-digit code se login ka dusra step.

**Chalu karna** (password dobara poochta hai):

1. `POST /api/account/2fa/setup { password }` secret banata hai, QR aur key wapas deta hai. Secret abhi **pending** hai, kuch active nahi.
2. App me QR scan karo, uska code daalo: `POST /api/account/2fa/enable { code }`. Sahi code par 2FA chalu, aur **8 recovery codes ek hi baar** dikhte hain.

**Login par:**

- Password sahi (ya Google se aaye) aur 2FA on hai, to **session nahi banta.** Ek 5 minute ka *challenge* banta hai (cookie `dotkeep_2fa`, sirf `/api/auth/2fa` ko jati hai).
- `POST /api/auth/2fa { code }` sahi code par asli session banata hai. Code ya to app ka 6-digit code, ya ek recovery code (har ek sirf ek baar chalta hai).
- **5 galat code** ke baad challenge khatam, password dobara daalna padta hai. Upar se 20 koshish / 15 minute har account par, 100 har IP par.
- Wahi code do baar nahi chalta (`lastStep` aage badhta hai), isliye kisi ne dekh bhi liya to replay nahi kar sakta.

**Band karna / naye recovery codes:** `POST /api/account/2fa/disable` aur `/recovery-codes`, dono me **password + abhi ka code (ya recovery code)** chahiye. Chori hui session se 2FA band nahi hoti. Settings ke 2FA routes ka ek counter: 10 koshish / 15 minute.

**Kaise store hota hai:** secret `VAULT_ENCRYPTION_KEY` se encrypt (AES-256-GCM, user ke saath bandha). Recovery codes sirf SHA-256 hash me. Isliye 2FA ko bhi wahi key chahiye jo vault ko. **Key kho gayi to 2FA wale log login nahi kar paayenge**, backup rakho.

**Files:** `src/lib/totp.ts` (code banana/check karna), `src/db/two-factor.ts`, `src/app/api/auth/2fa/`, `src/app/api/account/2fa/`, `src/modules/settings/two-factor-form.tsx`, `src/modules/auth/two-factor-step.tsx`.

**Abhi nahi:** recovery codes khatam hone par alert, aur "2FA chalu/band hua" email.

**Test:** asli MongoDB aur asli Chrome ke saath: API ke 76 checks aur UI ke 40+ checks, sab pass.
