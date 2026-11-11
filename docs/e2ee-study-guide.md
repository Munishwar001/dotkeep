# End-to-end encryption in Dotkeep: study guide

Yeh file is liye hai ki aap samajh sako ki Dotkeep mein E2EE kaise bana hai, kyun aise bana hai, aur code mein kahan dekhna hai.
Pehle concepts, phir flows, phir file map, phir limits, phir khud practice karne ke sawal.

---

## 1. Problem kya thi

**Pehle (server-side encryption):**

```
Browser --plaintext value--> Server --AES key (VAULT_ENCRYPTION_KEY)--> ciphertext --> MongoDB
```

Server ke paas key hai, isliye woh kabhi bhi decrypt kar sakta hai. Database leak hone par yeh safe hai, par agar server hi
hack ho jaye (ya koi admin galat kare), to secrets padhe ja sakte hain.

**Ab (end-to-end, opt-in):**

```
Browser --encrypts with vault key--> ciphertext --> Server --> MongoDB
```

Key sirf user ke browser mein hoti hai. Server ke paas sirf ciphertext hota hai, to woh padh hi nahi sakta.

> "End-to-end" ka matlab: dono *ends* (aapka browser, aapka browser) par hi plaintext banta hai. Beech wala server kabhi nahi dekhta.

---

## 2. Concepts jo samajhne zaroori hain

### 2.1 AES-256-GCM (value encrypt karne ka tareeka)

- **AES** ek symmetric cipher hai: jis key se encrypt, usi se decrypt.
- **256** = key ki length (256 bits = 32 bytes).
- **GCM** = ek mode jo encrypt ke saath *authentication tag* bhi banata hai. Agar kisi ne ciphertext badla, decrypt **fail** hota hai
  (galat data nahi deta). Isse tamper-proof hota hai.

### 2.2 IV (nonce)

Har encryption ke liye ek naya random 12-byte IV banta hai. Isliye same value do baar encrypt karo to ciphertext alag aata hai.
IV secret nahi hota, ciphertext ke saath store hota hai.

### 2.3 AAD (Additional Authenticated Data)

Ek extra string jo encrypt ke waqt mix hoti hai par ciphertext mein store nahi hoti. Decrypt ke waqt wahi string deni padti hai.
Dotkeep mein AAD = `userId:secretId`.

**Fayda:** agar koi attacker ek secret ka ciphertext copy karke doosre secret par chipka de, to decrypt fail ho jata hai,
kyunki AAD alag hai. Tests mein yeh check hota hai (`tests/unit/e2ee.test.mjs`, "is bound to its owner and secret").

### 2.4 PBKDF2 (passphrase se key banana)

Passphrase seedha key nahi ban sakta (chhota/predictable hota hai). **PBKDF2-SHA256** passphrase + random **salt** ko
**600,000 baar** hash karke 256-bit key banata hai. Itni baar karna *jaan-boojhkar slow* hai: attacker ko passphrase guess karne mein
har guess par itna kaam karna padta hai.

- Salt: 16 random bytes, har user ka alag.
- Server minimum 200,000 iterations accept karta hai (`MIN_KDF_ITERATIONS`), app 600,000 use karta hai.

### 2.5 Key wrapping (key ko key se lock karna)

Yeh sabse important idea hai. Alag-alag keys hain:

| Key | Kahan banti hai | Kya karti hai |
|---|---|---|
| **Vault key** | Browser, random 256-bit, ek baar | Har secret ki value encrypt/decrypt karti hai |
| **Passphrase key** | Passphrase se PBKDF2 se, jab zarurat ho | Vault key ko *wrap* (encrypt) karti hai |
| **Recovery key** | Browser, random 256-bit, ek baar dikhti hai | Vault key ki *doosri copy* wrap karti hai |

Server par jo store hota hai (`VaultKeyRecord`):

```json
{
  "v": 1,
  "kdf": { "name": "PBKDF2-SHA256", "iterations": 600000, "salt": "<base64>" },
  "wrappedByPassphrase": "<iv>$<ciphertext of vault key>",
  "wrappedByRecovery":   "<iv>$<ciphertext of vault key>"
}
```

Yani vault key ki **do locked copies**. Ek ko passphrase kholta hai, doosri ko recovery key. Server dono kholne ki chaabi nahi jaanta.

**Passphrase badalna sasta kyun hai:** sirf `wrappedByPassphrase` dobara banta hai (naye passphrase se). Vault key wahi rehti hai,
isliye har secret dobara encrypt nahi karna padta.

---

## 3. Ek diagram mein poora design

```
passphrase ──PBKDF2──► passphrase key ──AES-GCM──► wrappedByPassphrase ─┐
                                                                        ├──► server mein stored
recovery key ─────────────────────────AES-GCM──► wrappedByRecovery  ───┘
                                          ▲
                                          │ (dono same vault key ko lock karti hain)
                                     vault key (random 256-bit)
                                          │
                                          ▼ AES-GCM, AAD = userId:secretId
                                  "e1$<iv>$<ciphertext>"  ──► secrets.valueEncrypted (MongoDB)
```

**Stored value ka format:**

- `v1$<iv>$<tag>$<ciphertext>` = purana server-side encryption (server khol sakta hai)
- `e1$<iv>$<ciphertext+tag>` = end-to-end (server nahi khol sakta)

Code `valueEncrypted` ke prefix se pehchanta hai ki kaun sa type hai (`isE2eeValue()`).

---

## 4. Flows step by step

### 4.1 E2EE on karna (Settings)

1. User passphrase likhta hai (kam se kam 12 chars) aur confirm karta hai.
2. Browser `createVault()` chalata hai: random vault key + recovery key + salt, dono wrap karta hai.
3. **Recovery key dikhayi jaati hai.** User ko "I saved it" tick karna padta hai.
4. Tick ke baad hi `POST /api/account/e2ee` se record server ko jaata hai. (Pehle show, phir save: taaki user bina key dekhe lock na ho.)
5. Browser vault key memory mein rakh leta hai (unlocked).

Server sirf `vaultKeys` field `users` document mein rakhta hai. Yeh sirf ek baar ho sakta hai (replace karne se saare secrets lock ho jaate).

### 4.2 Unlock (jab vault locked ho)

Vault key sirf **tab ki memory** mein rehti hai. Page reload = locked.

1. Koi cheez encrypt/decrypt karna chahti hai → `sealValue()` / `openValue()` (`vault-key.ts`).
2. Agar locked hai → `UnlockDialog` khulta hai.
3. Dialog `GET /api/account/e2ee` se record laata hai.
4. Passphrase → `unlockVault()` → PBKDF2 → passphrase key → `wrappedByPassphrase` kholta hai → vault key.
5. Galat passphrase to AES-GCM fail hota hai → "That passphrase or recovery key is not correct."

### 4.3 Secret banana

```
Browser:  id = newObjectIdHex()                       (24 hex chars, client chunta hai)
          cipher = encrypt(vaultKey, value, AAD "userId:id")
          POST /api/vault/secrets { projectId, id, cipher, name, ... }   <- value nahi bhejta

Server:   cipher ka sirf *shape* check karta hai (E2EE_VALUE_PATTERN), kholta nahi
          checkStorage(): kya yeh allowed hai? (section 5)
          valueEncrypted = cipher store karta hai, id wahi use karta hai
```

**Client id kyun chunta hai?** AAD mein secretId hai. Agar server id banata, to client ko encrypt karte waqt id pata nahi hoti.
Server check karta hai ki id pehle se use mein na ho.

### 4.4 Reveal / Copy

```
Browser: POST /api/vault/secrets/:id/reveal
Server:  step-up (2FA) check, rate limit, audit log "revealed"
         e1 value ke liye { cipher } bhejta hai (v1 ke liye { value })
Browser: openValue(id, cipher)  -> plaintext, sirf browser mein
```

Server ko pata chal jaata hai *ki* reveal hua (log), par *kya* nahi.

### 4.5 Value badalna aur history

- Naya value: browser naya `cipher` banata hai, `PATCH { cipher }`.
- Purani value `secret_versions` mein ciphertext ki tarah rehti hai (last 20).
- **Restore:** server purana ciphertext seedha wapas current bana deta hai. Yeh **bina decrypt kiye** ho jaata hai, kyunki woh
  ciphertext isi secret ke liye bana tha (AAD wahi hai).

### 4.6 Passphrase badalna / bhool gaye

- **Badalna:** purana passphrase → vault key khulti hai → naye passphrase + naye salt se dobara wrap → `PATCH /api/account/e2ee`.
  Server sirf `wrappedByPassphrase` aur `kdf` badalta hai. `wrappedByRecovery` same rehta hai.
- **Bhool gaye:** recovery key → vault key khulti hai → naya passphrase set → wahi PATCH.
- Server `replacePassphraseWrap()` mein check karta hai ki `wrappedByRecovery` match kare. Isse koi hostile request recovery wrap nahi badal sakti.

### 4.7 Purane secrets ko E2EE mein badalna (migration)

Jo secrets E2EE on karne se pehle bane, woh `v1$` hain. "Encrypt existing secrets" button:

1. `POST /api/vault/e2ee/legacy` → server **plaintext** deta hai (unshared projects ke v1 secrets + unki history). Yeh ek bulk export jaisa hai, isliye 2FA step-up, rate limit aur har secret ka audit log lagta hai.
2. Browser har value (aur har purani version) ko encrypt karta hai, aur **wapas decrypt karke check karta hai** ki same aayi. Koi galti ho to kuch nahi badalta.
3. `POST /api/vault/e2ee/migrate` (50 ke batch) → server current value **aur saari versions** replace karta hai.
4. Pehle versions, aakhir mein current value likhta hai. Beech mein fail ho to retry safe hai.
5. Compare-and-swap: update tabhi hota hai jab stored value wahi ho jo pehle padhi thi (beech mein kisi ne badla to "changed while encrypting").

> Dhyan: migration ke baad bhi purana plaintext purane database backups ya snapshots mein reh sakta hai.

### 4.8 Export

Server E2EE secrets ko `encrypted: [...]` mein ciphertext bhejta hai. Browser unhe kholkar file mein jodta hai
(`src/modules/e2ee/export-merge.ts`). Downloaded file mein real values hoti hain, kisi bhi export ki tarah.

---

## 5. Server ke rules (kaun si value kahan allowed hai)

Yeh `checkStorage()` mein hai (`src/db/secrets.ts`). Yeh sabse zaroori safety code hai.

| Situation | Result |
|---|---|
| `cipher` bheja, par user ne E2EE on nahi kiya | 409 `e2ee_unavailable` |
| `cipher` bheja, project **shared** hai | 409 `e2ee_unavailable` (member ke paas key nahi) |
| `cipher` bheja, par bhejne wala owner nahi | 409 `e2ee_unavailable` |
| Plaintext `value` bheji, user E2EE-on hai, project unshared hai | 409 `e2ee_required` |
| Plaintext `value` bheji, project shared hai | allowed (server-side encryption) |
| E2EE secret par plaintext update | 409 `e2ee_required` (downgrade nahi hone dena) |
| v1 secret par `cipher` update | 409 `e2ee_migrate_first` |
| E2EE secret ko shared project mein move karna | 409 `e2ee_unavailable` |
| E2EE secret wale project mein member invite karna | 409 `e2ee_unavailable` |

**Plaintext rule kyun zaroori hai:** isse koi purana ya malicious client E2EE user ka plaintext server ko chupke se nahi bhej sakta.
Server hi backstop hai.

**Shared projects:** member ko vault key nahi milti, to unhe E2EE secret dikhega par khulega nahi. Isliye shared projects mein
secrets server-side encrypted rehte hain. Yeh Phase 1 ki limit hai.

---

## 6. Code ka map (kaun si file kya karti hai)

**Crypto (browser + Node dono mein chalta hai)**

| File | Kaam |
|---|---|
| `src/lib/e2ee.ts` | Poori crypto: `createVault`, `unlockVault`, `changePassphrase`, `encryptValue`, `decryptValue`, recovery key encode/decode |
| `src/lib/e2ee-input.ts` | Server ke liye key record ka shape check (`parseVaultRecord`) |

**Server (database + routes)**

| File | Kaam |
|---|---|
| `src/db/vault-keys.ts` | Wrapped keys store/read, `projectIsShared`, `projectHasE2eeSecrets` |
| `src/db/secrets.ts` | `checkStorage()` rules, create/update with `cipher`, `revealStored()` |
| `src/db/secret-history.ts` | Version reveal aur restore (ciphertext copy) |
| `src/db/e2ee-migration.ts` | `legacySecrets()` aur `migrateSecrets()` |
| `src/db/secret-import.ts`, `vault-backup.ts` | Export mein `encrypted` list; import E2EE par band |
| `src/db/members.ts` | Invite par E2EE guard |
| `src/db/errors.ts` | `E2eeError` aur uske codes |
| `src/app/api/account/e2ee/route.ts` | GET (keys), POST (setup), PATCH (passphrase badalna) |
| `src/app/api/vault/e2ee/legacy`, `migrate` | Migration routes |

**Client (UI)**

| File | Kaam |
|---|---|
| `src/modules/e2ee/vault-key.ts` | Unlocked key memory mein; `sealValue`, `openValue`, `e2eeStatus` |
| `src/modules/e2ee/unlock-dialog.tsx` | Passphrase / recovery key dialog (layout mein mount) |
| `src/modules/e2ee/export-merge.ts` | Export mein E2EE secrets browser mein khol kar jodna |
| `src/modules/settings/e2ee-form.tsx` | Settings: setup, recovery key, migration, passphrase badalna, lock |
| `src/modules/vault/secret-dialog.tsx` | Secret banate/edit karte waqt encrypt karna |
| `src/modules/vault/use-reveal.ts`, `history-dialog.tsx` | Reveal par decrypt karna |

**Tests**

| File | Kya check karta hai |
|---|---|
| `tests/unit/e2ee.test.mjs` | Crypto: round trip, galat key, tampering, AAD binding, passphrase change |
| `tests/api/e2ee.test.mjs` | Server: ciphertext-only storage, rules (section 5), migration, sharing, export, passphrase change |

---

## 7. Kya protect karta hai, kya nahi

**Protect karta hai:**

- Database leak ya copy: sirf ciphertext aur locked keys milti hain.
- Server ka curious ya compromised hona: server ke paas koi chaabi nahi.
- Ciphertext ko doosre secret par chipkana: AAD ki wajah se fail.
- Ciphertext badalna: GCM tag ki wajah se fail.

**Protect nahi karta / limits:**

| Limit | Matlab |
|---|---|
| Passphrase + recovery key dono kho gaye | Data hamesha ke liye gaya. Koi recover nahi kar sakta |
| Kamzor passphrase | Jo database ya session se locked keys copy kar le, woh offline guess kar sakta hai. PBKDF2 sirf slow karta hai |
| Web app ka JavaScript server se aata hai | Hacked server badla hua code bhej sakta hai. CLI ya extension se yeh solve hoga |
| Metadata plain hai | Naam, environment, type, notes encrypt nahi hote |
| Shared projects | Server-side encryption par hi rehte hain |
| Import / backup restore | E2EE account par band hain |
| Page reload | Vault lock ho jata hai, passphrase dobara |
| E2EE off nahi hota | Abhi koi "turn off" nahi |
| "Protect secret values" (2FA step-up) | E2EE mein yeh sirf *ciphertext dene* ko rokta hai, cryptographic lock nahi |
| Independent review | Design ka bahari security review nahi hua |

---

## 8. Khud chala kar dekho

```bash
npm run test:unit                 # crypto tests, bina server ke
npm run dev                       # alag terminal mein
node --env-file-if-exists=.env.local --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/api/e2ee.test.mjs
```

Browser mein:

1. App mein login karo, **Settings → End-to-end encryption** par jao.
2. Passphrase set karo, recovery key save karo, on karo.
3. Ek secret banao. Phir MongoDB mein `secrets` collection dekho: `valueEncrypted` `e1$...` hona chahiye, plaintext nahi.
4. Page reload karo, secret reveal karo: passphrase poochhi jayegi.

---

## 9. Practice ke sawal (jawab khud code mein dhundo)

1. `encryptValue()` har baar alag ciphertext kyun deta hai? (Hint: IV)
2. Agar attacker `secretA` ka ciphertext `secretB` ke document mein daal de, to kya hoga, aur kyun? (Hint: AAD)
3. Passphrase badalne par secrets dobara encrypt kyun nahi karne padte?
4. Server `PATCH /api/account/e2ee` mein `wrappedByRecovery` match hone ki shart kyun lagata hai?
5. Client secret ka `id` khud kyun chunta hai? Server bana de to kya dikkat hai?
6. E2EE-on user plaintext `value` bheje, to server mana kyun karta hai? Isse kaunsa attack rukta hai?
7. Migration mein pehle versions aur baad mein current value kyun update hoti hai?
8. Shared project mein E2EE secret kyun nahi ho sakta? Ise Phase 2 mein kaise solve karoge? (Hint: har member ka public/private keypair, project key ko har member ki public key se wrap karna)
9. Restore bina decrypt kiye kaise kaam karta hai?
10. "Protect secret values" (2FA step-up) E2EE ke saath cryptographic protection kyun nahi hai?

---

## 10. Aage kya ban sakta hai (Phase 2/3 ideas)

- **Sharing:** har user ka keypair (jaise X25519/RSA-OAEP), har project ki alag key, aur wo key har member ki public key se wrap. Member hataane par project key badalni padegi.
- **Metadata encryption:** naam, notes bhi encrypt, search browser mein.
- **Client-side import / backup restore:** browser parse karke encrypt kare, server ko sirf ciphertext mile.
- **E2EE off karne ka flow:** sab secrets decrypt karke wapas v1 mein.
- **Argon2id:** PBKDF2 ki jagah, memory-hard hone ki wajah se zyada mazboot (WASM dependency chahiye).
- **CLI ya browser extension:** "hacked server badla hua JS bheje" wali limit ko kam karne ke liye.
- **Independent security review.**
