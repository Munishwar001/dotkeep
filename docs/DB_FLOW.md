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

## 10. Abhi kya hai, aage kya

**Abhi bana hai**
- [x] MongoDB connection ([mongodb.ts](../src/lib/mongodb.ts))
- [x] Connection check ([/api/health/db](../src/app/api/health/db/route.ts))
- [x] Users ka shape + save/find ([users.ts](../src/db/users.ts))

**Abhi nahi bana (agle steps, is order me)**
1. **Password hashing:** password ka hash banana aur match karna. Alag chhoti file me.
2. **Signup route:** form ka data → hash → `createUser`.
3. **Login route:** `findUserByEmail` → hash match.
4. **Session:** login ke baad cookie, taaki user logged-in rahe.
5. **Forms ko routes se jodna**, aur `/dashboard` ko protect karna.

**Dhyan rakho:** `users.ts` ko maine abhi **asli MongoDB ke saath chalakar test nahi kiya**, kyunki `MONGODB_URI` abhi khali hai. Types aur lint pass hain. Jab tum `/api/health/db` se `ok` dikha doge, tab signup banate waqt iska pehla asli test hoga.
