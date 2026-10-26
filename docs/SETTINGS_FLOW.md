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

Email badalna, email verify karna, password reset (bhoolne par), 2-step login (2FA), aur theme (dark mode).

**Test:** asli MongoDB aur asli Chrome ke saath: API ke 76 checks aur UI ke 40+ checks, sab pass.
