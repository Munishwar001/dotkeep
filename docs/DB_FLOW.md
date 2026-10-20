# Dotkeep Database Flow (MongoDB), simple guide

Ye guide batati hai ki **database wala hissa kaise kaam karta hai** aur kaun si file kya karti hai. Abhi sirf database ki neev (foundation) bani hai. Signup/login ke routes baad me aayenge.

---

## 1. Ek line me

Hamare paas **ek `users` collection** hai (MongoDB me table jaisi cheez). Usse padhne aur likhne ke liye **sirf ek file** hai: [src/db/users.ts](../src/db/users.ts). Baaki app ko database ke andar ki baatein jaanne ki zaroorat nahi.

---

## 2. Layers (kaun kisse baat karta hai)

```
 API route  (baad me: signup / login)        ← user ki request yahan aati hai
      │
      ▼
 src/db/users.ts       "phone book"          ← user ko save karo / dhundo
      │
      ▼
 src/lib/mongodb.ts    "phone line"          ← MongoDB se connection kholna
      │
      ▼
 MongoDB Atlas         "phone book ka daftar" ← asli data yahan rakha hai
```

Rule: **har layer sirf apne neeche wali layer se baat karti hai.** Isse code samajhna aur badalna aasaan rehta hai.

| File | Kaam | Aise samjho |
|---|---|---|
| [src/lib/mongodb.ts](../src/lib/mongodb.ts) | Connection kholta hai (`MONGODB_URI` se) aur use reuse karta hai | Phone line |
| [src/db/users.ts](../src/db/users.ts) | User ka shape batata hai, aur user save/find karta hai | Phone book |
| [src/lib/password.ts](../src/lib/password.ts) | Password ka hash banata hai aur match karta hai | Tala aur chaabi |
| [src/app/api/health/db/route.ts](../src/app/api/health/db/route.ts) | Check karta hai ki database zinda hai | "Hello, koi hai?" |

---

## 3. Words, SQL (Postgres) se compare

| MongoDB | Postgres me jaisa |
|---|---|
| **Database** (`dotkeep`) | Database |
| **Collection** (`users`) | Table |
| **Document** (ek user) | Row |
| **Field** (`email`) | Column |
| `_id` | Primary key |

Farak: MongoDB me columns pehle se fix nahi hote. Isliye hum code me `UserDoc` type likhte hain, taaki har user ka shape same rahe.

---

## 4. Ek user kaisa dikhta hai

Atlas me `users` collection ke andar ek document aisa hoga:

```json
{
  "_id": "6650f1c2a1b2c3d4e5f60718",
  "name": "Munish",
  "email": "munish@example.com",
  "passwordHash": "a91f...(lambi hash string)",
  "createdAt": "2026-10-15T10:30:00.000Z"
}
```

| Field | Matlab |
|---|---|
| `_id` | MongoDB khud banata hai. Har user ki unique ID. |
| `name` | Signup me daala hua naam. |
| `email` | **Hamesha chhote letters me** save hota hai (neeche samjhaya hai). |
| `passwordHash` | Password ka hash. **Asli password kabhi save nahi hota.** |
| `createdAt` | Account kab bana. |

---

## 5. [users.ts](../src/db/users.ts) ke functions

| Function | Kya karta hai | Kab use hoga |
|---|---|---|
| `createUser({ name, email, passwordHash })` | Naya user save karta hai. Email pehle se ho to `EmailTakenError` deta hai. | **Signup** |
| `findUserByEmail(email)` | Email se user dhundta hai, na mile to `null`. | **Login** |
| `normalizeEmail(email)` | Email ko chhote letters me aur space hata ke deta hai. | Andar apne aap |
| `toPublicUser(user)` | User se `passwordHash` hata deta hai. | Browser ko bhejne se pehle |

---

## 6. Flow: database ke andar kya hota hai

### A) Signup, naya email
```
createUser({ name: "Munish", email: " Munish@Mail.com ", passwordHash })
   1. email ban gaya  →  "munish@mail.com"      (normalizeEmail)
   2. usersCollection() → index pehle se hai? nahi to banao   (neeche section 7)
   3. users.insertOne({...})                    → MongoDB me document save
   4. wapas milta hai: poora user (with _id)
```

### B) Signup, email pehle se hai
```
createUser(...)
   3. insertOne(...)  →  MongoDB error 11000 ("duplicate key")
   4. hum use pakad ke EmailTakenError me badalte hain
   →  route user ko dikhayega: "An account with this email already exists."
```

### C) Login, user mila
```
findUserByEmail("MUNISH@mail.com")
   1. normalize  →  "munish@mail.com"
   2. users.findOne({ email: "munish@mail.com" })
   3. user mila  →  route passwordHash se password match karega (baad me)
```

### D) Login, user nahi mila
`findUserByEmail` `null` deta hai. Route "Incorrect email or password." dikhayega. Ye message jaanbujhkar same rakha jata hai, taaki koi ye na jaan sake ki kaun sa email registered hai.

---

## 7. Do chhoti par zaroori cheezein

### Unique index
`users.ts` me `createIndex({ email: 1 }, { unique: true })` hai. Isse **MongoDB khud** ek email ko do baar save nahi hone deta.

Sirf `findUserByEmail` se pehle check karna kaafi nahi hota. Agar do requests ek hi pal me aayein, to dono check pass kar jati hain aur dono save ho jati hain. Unique index isse rokta hai.

Index pehli baar banta hai, phir har server start par ek baar check hota hai. Dobara banane se kuch bigadta nahi.

### Email chhote letters me kyun
`Munish@Mail.com` aur `munish@mail.com` ek hi insaan ke hain. Sab kuch lowercase me save karte hain, taaki login ke time email ke bade/chhote letters ki wajah se user ko "not found" na mile.

---

## 8. Safety ke niyam (code me laage hain)

1. **Password kabhi plain text me nahi.** `users.ts` sirf `passwordHash` leta hai.
2. **Browser ko `passwordHash` kabhi nahi bhejna.** Isliye `toPublicUser()` hai. Browser ko user bhejne se pehle usse zaroor guzaaro.
3. **`users.ts` me hashing nahi hai.** Wo kaam alag hoga (neeche "Aage kya").
4. **Connection string `.env.local` me hai**, code me nahi. Wo git me nahi jaati.

---

## 9. Data dekhna kahan hai

1. [.env.local](../.env.local) me `MONGODB_URI` bharo (steps pichli guide me).
2. Atlas → **Database → Browse Collections**.
3. `dotkeep` database → `users` collection. Jab pehla user save hoga tab ye dikhega.

Connection check karne ke liye: `npm run dev` chalao aur `http://localhost:3000/api/health/db` kholo. `{"status":"ok"}` aana chahiye.

---

## 10. Password hashing ([password.ts](../src/lib/password.ts))

**Hash kya hota hai?** Password ko ek aisi lambi string me badalna jisse **wapas asli password nahi nikal sakta**. Database me sirf wahi string rakhte hain. Database leak bhi ho jaye to attacker ko password nahi, sirf hash milta hai.

**Do functions:**
| Function | Kaam | Kab |
|---|---|---|
| `hashPassword(password)` | Password se hash banata hai | **Signup** par, `createUser` se pehle |
| `verifyPassword(password, hash)` | Batata hai password sahi hai ya nahi (true/false) | **Login** par |

**Hash ek string me aisa dikhta hai:**
```
scrypt$32768$8$3$<salt>$<hash>
  │      │   │ │    │      └ asli hash
  │      │   │ │    └ salt (random, har user ka alag)
  │      └───┴─┴ settings (kitna mehnat karna hai)
  └ algorithm ka naam
```
Settings hash ke andar hi likhi hoti hain. Isliye baad me settings badal bhi do, to purane users ke hash bhi verify honge.

**Kyun scrypt?** Ye jaanbujhkar **dheema aur memory-bhukha** banaya gaya hai (ek hash me lagbhag 140ms aur 32 MiB memory). Real user ko farak nahi padta, par attacker ko lakhon password guess karne me bahut der lagti hai. Ye Node ke andar hi aata hai, koi extra package nahi.

**Salt kya hai?** Har password ke saath ek random string judti hai. Isse do users ka same password hone par bhi hash alag aate hain. Attacker pehle se bani hui hash-lists (rainbow tables) use nahi kar sakta.

**Teen chhoti suraksha:**
1. **Max 128 characters.** Koi bahut lamba password bhej ke server ko atka na sake.
2. **Unicode normalize.** `é` ko do alag tareekon se type karo to bhi same maana jata hai.
3. **Unknown email par bhi utna hi time.** `verifyPassword(password, null)` ek dummy hash se utna hi kaam karta hai. Isse timing dekh ke koi nahi jaan sakta ki email registered hai ya nahi.

**Signup aur login me kaise lagega (agle step)**
```ts
// Signup
const passwordHash = await hashPassword(password);
await createUser({ name, email, passwordHash });

// Login
const user = await findUserByEmail(email);
const ok = await verifyPassword(password, user?.passwordHash ?? null);
// ok false ho to hamesha wahi message: "Incorrect email or password."
```

---

## 11. Poora flow: Signup, Login, Dashboard, Logout

### Session kya hai?
Login ke baad browser ko ek **cookie** milti hai (`dotkeep_session`). Har request ke saath ye cookie jaati hai, aur server pehchanta hai ki "ye wahi user hai". Cookie me ek **random token** hota hai.

Database ki `sessions` collection me token **ka hash** save hota hai, asli token nahi ([sessions.ts](../src/db/sessions.ts)). Isliye database leak ho jaye to bhi koi cookie nakal nahi kar sakta.

```json
{ "tokenHash": "9f2c…(64 chars)", "userId": "…", "createdAt": "…", "expiresAt": "7 din baad" }
```
7 din baad session apne aap expire hota hai, aur MongoDB use khud delete kar deta hai (TTL index).

### Signup
```
Form (auth-form.tsx)  ── POST /api/auth/signup { name, email, password } ──►  signup/route.ts
   1. Origin + JSON check (CSRF se bachav)
   2. Rate limit (ek IP se ghante me 10 signup)
   3. parseSignup()      → server par dobara validation
   4. hashPassword()     → password.ts
   5. createUser()       → users collection me save (duplicate email → 409)
   6. Verification email bhejna (dekho [EMAIL_VERIFICATION_FLOW.md](EMAIL_VERIFICATION_FLOW.md))
   7. Response 201. **Koi session ya cookie nahi banti**: signup login nahi karata.
Form: response ok  →  router.push("/login?registered=1")
Login page: "We sent a verification link..." dikhata hai. Email verify hone ke baad hi login chalta hai.
```

### Login
```
Form ── POST /api/auth/login { email, password } ──►  login/route.ts
   1. Origin + JSON check
   2. parseLogin()
   3. Rate limit (IP + email par 15 minute me 10 koshish)
   4. findUserByEmail()  → users collection
   5. verifyPassword(password, user?.passwordHash ?? null)
   6. galat ya user nahi mila → 401 "Incorrect email or password."  (dono me same message)
   7. sahi → createSession() + Set-Cookie
Form: response ok  →  router.push("/dashboard")   ← login ke baad dashboard
```

### Dashboard
```
Browser: GET /dashboard
   proxy.ts            cookie hai? nahi → /login par bhejo        (tez check)
   dashboard/page.tsx  getCurrentUser()
        └─ cookie ka token → hash → sessions me dhundo → userId → users me user
        └─ session nahi mila / expire → /login
        └─ mil gaya → "Welcome, <naam>" dikhao
```

### Logout
```
Sign out button ── POST /api/auth/logout ──► sessions se token-hash delete + cookie saaf
→ router.push("/login")
```
Session database se delete hota hai, to purani cookie kisi bhi device par ab kaam nahi karti.

### Suraksha jo laagi hai
| Cheez | Kaise |
|---|---|
| Password | scrypt hash, asli password kahin nahi |
| Cookie | `HttpOnly` (JavaScript padh nahi sakta), `SameSite=Lax`, production me `Secure` |
| CSRF | Origin check + sirf JSON |
| Brute force | Login par rate limit, signup par rate limit |
| Email enumeration | Login me galat password aur unknown email ka message aur time same |
| Server validation | Browser ke checks par bharosa nahi, server dobara check karta hai |

**Rate limit ki seema:** ye memory me hai, to server restart par reset ho jata hai. Agar kabhi ek se zyada server chalao, to ise MongoDB ya Redis me le jana padega.

---

## 12. Abhi kya hai, aage kya

**Abhi bana hai**
- [x] MongoDB connection ([mongodb.ts](../src/lib/mongodb.ts))
- [x] Connection check ([/api/health/db](../src/app/api/health/db/route.ts))
- [x] Users ka shape + save/find ([users.ts](../src/db/users.ts))
- [x] Password hashing ([password.ts](../src/lib/password.ts))

**Ab tak bana**
- [x] MongoDB connection, health check
- [x] Users collection ([users.ts](../src/db/users.ts)) aur password hashing ([password.ts](../src/lib/password.ts))
- [x] Sessions ([sessions.ts](../src/db/sessions.ts)) aur cookie ([session.ts](../src/lib/session.ts))
- [x] Signup, Login, Logout routes ([src/app/api/auth/](../src/app/api/auth/))
- [x] Forms routes se jude hain. Signup ke baad `/login`, login ke baad `/dashboard`
- [x] `/dashboard` protected hai (proxy + session check)

**Abhi nahi bana**
1. Forgot / reset password
2. Email confirmation
3. ~~Asli vault~~ ban gaya hai, dekho [VAULT_FLOW.md](VAULT_FLOW.md)
4. Rate limit ko multi-server ke liye shared banana

**Test status:** poora flow asli local MongoDB aur asli server par test hua hai (signup, cookie, dashboard, duplicate email, galat password, logout, rate limit). Browser me forms ko haath se chalakar dekhna baaki hai.
