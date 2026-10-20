# Dotkeep Forgot Password, simple guide

Password bhool gaye to email se naya password set kar sakte ho. Ye email verification wale hi system par bana hai (wahi SMTP, wahi `.env.local` settings, dekho [EMAIL_VERIFICATION_FLOW.md](EMAIL_VERIFICATION_FLOW.md)).

---

## 1. Poora flow

```
1. /login par "Forgot password?"  →  /forgot-password
2. Email daalo, "Send reset link"
3. Jawab hamesha ek hi: "If <email> has an account, we've sent a link..."
4. Email aata hai: "Reset your Dotkeep password" + link
5. Link kholo  →  /reset-password?token=...   (naya password + confirm)
6. "Set new password"  →  /login?reset=1  ("Password updated. Sign in with your new password.")
7. Naye password se login
8. Ek alert email aata hai: "Your Dotkeep password was changed"
```

---

## 2. Link ke niyam

| Baat | Kaise |
|---|---|
| Kitni der | **1 ghanta** (verification link se chhota, kyunki ye zyada sensitive hai) |
| Kitni baar | **Sirf ek baar** |
| Naya link maangne par | Purana turant bekaar |
| Database me | Sirf token ka **hash** (`passwordResets` collection) |
| Link kholna vs use karna | Link kholne par sirf **form** dikhta hai. Token tab kharch hota hai jab naya password submit karo. Email scanners link khol dein to bhi token bachta hai. |
| Galat ya chhota password | **Link kharch nahi hota.** Pehle password check hota hai, phir link use hota hai. Typo se link nahi jaata. |
| Do baar ek saath submit | Sirf ek safal hota hai |

---

## 3. Password badalne ke baad kya hota hai

1. Naya password hash hokar save hota hai.
2. **Saare devices logout** ho jate hain (purane sabhi sessions delete). Isme wo bhi aate hain jo kisi ne chura liya ho.
3. Email ko **verified** maana jata hai. Wajah: reset link sirf us email par jata hai, to link khol pana hi saabit karta hai ki inbox tumhara hai. Isse unverified user bhi password reset karke login kar sakta hai.
4. Pending "verify your email" link hata diya jata hai.
5. Account ke owner ko **"password was changed" alert email** jata hai, jisme likha hota hai ki agar ye tumne nahi kiya to turant reset karo. (Ye alert Settings se password badalne par bhi jata hai.)

---

## 4. Suraksha

| Cheez | Kaise |
|---|---|
| Kaun registered hai | **Pata nahi chalta.** Registered aur anjaan email dono ko ek jaisa jawab, aur ek jaisa time (email bhejna response ke baad hota hai). |
| Email flood | Ek email par **ghante me 5**, ek IP se **ghante me 10**, aur ek email ko **60 second me 1** baar |
| Link ka domain | `APP_URL` se banta hai, `Host` header se nahi. Nakli `Host` bhejne par bhi link sahi jagah gaya (test me check). |
| Naam email me | HTML me escape hota hai |
| Referer leak | Reset page browser ko `no-referrer` bolta hai, taaki token dusri site ko na jaye |
| Email nahi ja saka | Link cancel ho jata hai, taaki turant dobara maang sako. Jawab phir bhi ek jaisa. |

**Rate limit memory me hai**, server restart par reset hota hai.

---

## 5. Kahan kya hai

```
src/app/forgot-password/page.tsx          email daalne ka page
src/app/reset-password/page.tsx           naya password ka page (token check)
src/modules/auth/forgot-password-form.tsx
src/modules/auth/reset-password-form.tsx
src/app/api/auth/forgot-password/route.ts link bhejna
src/app/api/auth/reset-password/route.ts  password badalna
src/db/password-resets.ts                 token ka hash, 1 ghante ka expiry, ek baar ka use
src/lib/password-reset.ts                 reset email aur "password changed" alert
src/lib/mail-html.ts                      emails ka HTML (escaped)
```

---

## 6. Abhi nahi hai

2-step login (2FA), aur "password badla gaya" alert me device ya jagah ki jaankari (hum IP save nahi karte).

**Test:** asli MongoDB, nodemailer aur nakli SMTP server ke saath: API ke 65 checks aur Chrome me poora flow, sab pass. Asli email service ke saath ek baar khud try karna.
