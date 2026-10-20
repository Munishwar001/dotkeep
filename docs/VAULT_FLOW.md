# Dotkeep Vault aur Projects, simple guide

Ye guide batati hai ki **Vault (secrets)** aur **Projects** kaise kaam karte hain, secrets kaise encrypt hote hain, aur kaun si file kya karti hai.

---

## 1. Ek line me

Tum **Projects** banate ho (jaise "Launchpad"), aur har project ke andar **Secrets** rakhte ho (API key, token, webhook, database URL). Secret ki value MongoDB me **encrypt hokar** save hoti hai, aur list me kabhi nahi dikhti. Tum jab **Reveal** dabate ho tab hi wo ek value alag request se aati hai, aur 15 second baad apne aap chhup jati hai.

---

## 2. Data kaisa dikhta hai

```
User ──► Project ("Launchpad") ──► Secret ("DATABASE_URL", Production, Database URL, value=????)
         └─ Project ("Portfolio")   └─ Secret ("DATABASE_URL", Local, ...)   ← same naam, alag environment = theek hai
```

**`projects` collection**
| Field | Matlab |
|---|---|
| `userId` | Kis user ka hai. **Har query me isi se filter hota hai.** |
| `name`, `description` | Naam (≤ 60) aur description (≤ 280) |
| `nameKey` | Naam ka lowercase, "ek user ke do project same naam ke nahi" rokne ke liye |

**`secrets` collection**
| Field | Matlab |
|---|---|
| `userId`, `projectId` | Kis user ka, kis project ka |
| `name` | Jaise `DATABASE_URL` (≤ 80) |
| `environment` | `local`, `staging` ya `production` |
| `type` | API key, Access token, Webhook URL, Database URL, Environment variable, Other |
| `valueEncrypted` | **Encrypted value.** Asli value kahin save nahi hoti. |

Rule: ek project me **same naam + same environment** do baar nahi ho sakta. Same naam alag environment me ho sakta hai.

---

## 3. Encryption kaise hoti hai

File: [src/lib/vault-crypto.ts](../src/lib/vault-crypto.ts)

- **Algorithm:** AES-256-GCM. Ye maanya aur tez encryption hai.
- **Chaabi (key):** `.env.local` ki `VAULT_ENCRYPTION_KEY`. Ye 32 random bytes hoti hain.
- **Har value ka apna random IV**, to ek hi secret do baar encrypt karo to alag dikhega.
- **Tamper-proof:** koi database me encrypted data badle to decrypt fail ho jata hai, galat data nahi milta.
- **Context binding:** encryption me `userId + secretId` joda jata hai. Koi encrypted value ek secret se dusre secret par copy kare to wo khulti nahi.

Database me value aisi dikhti hai: `v1$<iv>$<tag>$<data>`.

### Zaroori baatein
1. **Chaabi ka backup rakho.** Ye kho gayi to saare secrets hamesha ke liye gaye. Koi recover nahi kar sakta.
2. **Ghar ya dusre computer par wahi chaabi** `.env.local` me daalni hogi, warna wahan ke secrets nahi khulenge.
3. **Chaabi kabhi git me mat daalo** (`.env.local` pehle se ignore hoti hai).
4. **Ye end-to-end encryption nahi hai.** Server chaabi jaanta hai, to wo decrypt kar sakta hai. Matlab: database leak ho jaye to secrets safe, par server hi compromise ho jaye to nahi. Isko UI ya docs me "end-to-end" ya "certified" mat likhna.

---

## 4. Flow: secret banana, dekhna, copy karna

### Secret banana
```
New secret dialog ── POST /api/vault/secrets { projectId, name, environment, type, value }
   1. authorize()       login hai? same-origin hai? vault configured hai?
   2. parseSecretCreate() server par dobara validation
   3. project tumhara hai? (nahi → 404)      limit 1000 secrets
   4. encryptSecret(value, userId:secretId)
   5. MongoDB me save (valueEncrypted)
   6. Response: secret ki details, VALUE NAHI
```

### List dikhana
Server seedhe database se secrets padhta hai aur **value ka field kabhi nahi bhejta**. Isliye page ke HTML me value hoti hi nahi (test me check kiya gaya).

### Reveal
```
Reveal button ── POST /api/vault/secrets/:id/reveal
   1. authorize()  +  rate limit (1 minute me 30)
   2. secret tumhara hai? (nahi → 404)
   3. decryptSecret()  →  { value }       ← yahi ek jagah hai jahan value decrypt hoti hai
Browser: value dikhata hai, 15 second baad khud chhupa deta hai
```

### Copy
Copy dabane par value reveal wale rasta se aati hai aur clipboard me jati hai. Value screen par dikhana zaroori nahi.

### Edit
Naam, environment, type badal sakte ho. **Value khali chhodo to purani wahi rehti hai.** Project badalna abhi nahi hai.

### Delete
- **Secret:** confirmation popup ke baad delete.
- **Project:** popup me bataya jata hai ki kitne secrets bhi delete honge. Project aur uske saare secrets ek saath jaate hain.

---

## 5. Pages

| Page | Kaam |
|---|---|
| `/dashboard` | Overview: asli counts (Secrets, Projects, Environments) aur "Get started" steps jo khud tick hote hain |
| `/dashboard/vault` | Saare projects ke saare secrets. Search aur project/environment/type ke filters |
| `/dashboard/projects` | Projects ke cards, naya project, edit, delete |
| `/dashboard/projects/[id]` | Ek project ke secrets |

Sab pages login ke baad hi khulte hain.

---

## 6. API

| Request | Kaam |
|---|---|
| `GET /api/vault/projects` | Tumhare projects |
| `POST /api/vault/projects` | Naya project |
| `PATCH` / `DELETE /api/vault/projects/:id` | Project edit / delete |
| `GET /api/vault/secrets` | Secrets (value ke bina). `?projectId=` se filter |
| `POST /api/vault/secrets` | Naya secret |
| `PATCH` / `DELETE /api/vault/secrets/:id` | Secret edit / delete |
| `POST /api/vault/secrets/:id/reveal` | Ek secret ki value |

Har request: login zaroori (401), same-origin JSON (403), aur **sirf tumhara data** milta hai. Dusre ke data ki id do to "not found" (404) aata hai, jaise wo exist hi nahi karta.

---

## 7. Suraksha jo laagi hai

| Cheez | Kaise |
|---|---|
| Value database me | AES-256-GCM se encrypted |
| Value list ya page me | Kabhi nahi bheji jati |
| Dusre user ka data | Har query me `userId` filter. Test me ek user dusre ka data na dekh paya, na badal paya, na delete kar paya |
| Reveal ka misuse | Rate limit (30 per minute) |
| CSRF | Origin check + sirf JSON |
| Server par validation | Naam, environment, type, value ki limit sab server par check hoti hai |
| Limits | 100 projects, 1,000 secrets per user, value ≤ 10,000 characters |
| Encrypted data se chhedchhad | Decrypt fail hota hai |

---

## 8. Files ka naksha

```
src/
├─ lib/
│  ├─ vault-crypto.ts          Encryption / decryption (AES-256-GCM)
│  ├─ vault-input.ts           Server-side validation
│  └─ api-guard.ts             Har vault API ka pehla kadam: login, origin, config check
├─ db/
│  ├─ collections.ts           projects aur secrets collections + indexes
│  ├─ projects.ts              Projects ke functions
│  ├─ secrets.ts               Secrets ke functions (reveal yahin se)
│  └─ errors.ts                Duplicate naam, limit jaise errors
├─ app/
│  ├─ api/vault/...            Upar wali API
│  └─ dashboard/
│     ├─ page.tsx              Overview
│     ├─ vault/page.tsx
│     └─ projects/page.tsx, projects/[id]/page.tsx
└─ modules/
   ├─ vault/                   Table, dialogs, project card, constants
   └─ dashboard/               Frame, sidebar, overview, user menu
```

---

## 9. Setup

`.env.local` me ye teen cheezein chahiye (sample `.env.example` me hai):
```
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB=dotkeep
VAULT_ENCRYPTION_KEY=<32 random bytes, base64>
```
Chaabi banane ke liye:
```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
`.env.local` badalne ke baad `npm run dev` dobara chalao.

Agar `VAULT_ENCRYPTION_KEY` nahi hai, to Vault aur Projects pages ek saaf message dikhate hain ki kya set karna hai, crash nahi hote.

---

## 10. Abhi nahi hai

Custom tags, aur poori teams/organisation (abhi sirf project-level sharing hai, section 12).

---

## 11. Naye features: .env, history, audit log, bulk

| Feature | Kaise kaam karta hai |
|---|---|
| **.env import** | Vault toolbar ke `.env` menu se. File ya paste, project + environment chuno. Har `NAME=value` encrypted secret (type: Environment variable) banta hai. "Replace" tick karo to maujood values badal jati hain (purani history me jati hai). Parser: `src/lib/dotenv.ts` |
| **.env export** | Same menu se. Ek project + environment ke saare secrets decrypt hokar `.env.<environment>` file me download. Rate limit 10/min. Jin naamo me space jaisi cheez hai (valid variable naam nahi) wo chhod diye jaate hain aur bataye jaate hain |
| **Version history** | Value badalne par purani value `secret_versions` me encrypted rehti hai (last 20). Row menu → History → Versions: reveal, copy, **Restore**. Restore karne par jo value hat rahi hai wo bhi history me chali jati hai |
| **Audit log** | `secret_events` collection. Created, Viewed (reveal/copy), Edited, Value changed, Moved, Restored, Imported, Exported, Deleted. Sirf metadata, value kabhi nahi. Secret delete hone ke baad bhi log rehta hai. Page: `/dashboard/activity`, aur har secret ke History → Activity me |
| **Dusre project me le jana** | Edit dialog me Project badlo (ab disabled nahi). Same naam + environment target me pehle se ho to 409 |
| **Bulk edit / delete** | Rows tick karo → bar me **Edit / move** (project, environment, type ek saath) ya **Delete**. Jo secret change nahi le sakta (naam target me maujood) wo alag se bataya jata hai, baaki ho jate hain. Ek baar me max 200 |

Naye API: `POST /api/vault/import`, `POST /api/vault/export`, `POST /api/vault/secrets/bulk`, `GET /api/vault/secrets/:id/versions`, `POST .../versions/:versionId/reveal`, `POST .../versions/:versionId/restore`, `GET /api/vault/secrets/:id/activity`. `PATCH /api/vault/secrets/:id` ab `projectId` bhi leta hai.

Note: audit log likhna fail ho jaye to action nahi rukta (error server log me jata hai). Account delete par versions aur events bhi delete hote hain.

Sab test asli MongoDB aur asli Chrome ke saath hue hain: API ke 47 checks (encryption, ownership, tampering, limits, rate limit) aur UI ke 46 checks (create, reveal, auto-hide, copy, filter, edit, delete, mobile).

---

## 12. Sharing (small teams) aur Environments view

**Model:** har project ka **ek owner** hota hai. Owner dusre logon ko project par role de sakta hai (collection `project_members`):

| Role | Kya kar sakta hai |
|---|---|
| **Owner** | Sab kuch: share, rename, delete project, members badalna/hatana |
| **Editor** | Secrets add / edit / move / delete, .env import, history se restore |
| **Viewer** | Dekhna: reveal, copy, .env export, history aur activity padhna. Badal kuch nahi sakta |

- Share karne ke liye owner project page par **Share** dabata hai, verified Dotkeep account ki email aur role deta hai. Rate limit: 20 invites per ghanta (jawab se pata chalta hai email ka account hai ya nahi).
- Secret hamesha **owner ka** rehta hai (`secret.userId` = owner), chahe kisi editor ne banaya ho. Isliye encryption context (`ownerId:secretId`) nahi badalta aur sharing me ciphertext ko chhua nahi jata.
- Isi wajah se secret sirf **same owner ke projects** ke beech move ho sakta hai.
- Access nahi hai to API **404** deti hai (jaise exist hi nahi karta). Role kam hai to **403**.
- Member kabhi bhi **Leave project** kar sakta hai. Owner kisi ko hata de to access turant band, par unhone jo values dekh li hain unki copy ho sakti hai.
- Audit log me ab **kisne** kiya wo bhi likha jata hai (`actorName`). Project ke saare members project ka log dekh sakte hain.
- Project delete hone par sharing bhi hat jati hai. Account delete par uske projects ki sharing aur dusron ke projects me uski membership hat jati hai.
- Access ka poora logic: `src/db/access.ts`. Routes pehle `projectAccess` / `secretAccess` se role nikalte hain, phir owner ki id se db functions chalate hain.

**Environments view:** project page par List / Environments toggle. Environments me ek row = ek secret naam, teen columns = Local, Staging, Production. Jo environment me secret nahi hai wahan **Add** button (naam aur environment pehle se bhara hua) aur row par "Missing in ..." likha aata hai.

Naye API: `GET/POST /api/vault/projects/:id/members`, `PATCH/DELETE /api/vault/projects/:id/members/:userId`.
