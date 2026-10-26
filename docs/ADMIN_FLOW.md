# Dotkeep Admin, simple guide

Admin wo user hai jo dekh sakta hai ki **kitne log register hue aur kitne login hue.** Admin ko kisi ke **secrets, projects ya values kabhi nahi dikhte**, sirf ginti dikhti hai.

---

## 1. Admin kaise banate hain

Website se koi admin **nahi** ban sakta. Sirf ek command se:

```bash
npm run make-admin -- tumhara@email.com      # admin banao
npm run remove-admin -- tumhara@email.com    # admin hatao
```

Steps:
1. Pehle website par `/signup` se normal account banao. Signup ke baad tum **login page** par pahunchoge.
2. Terminal me upar wali command chalao (apna email daalo).
3. Login page par sign in karo. Sidebar me **Admin** dikhega.

Command `.env.local` se `MONGODB_URI` padhti hai. Admin banne ya hatne ka asar **turant** hota hai, dobara login nahi karna padta.

### Kaunsa database? (local ya production)

`make-admin` wahi database badalta hai jis par `.env.local` ki `MONGODB_URI` aur `MONGODB_DB` point karti hain. Isliye pehle dekh lo ki abhi kahan point kar rahi hai:

| `.env.local` me | Admin banega |
|---|---|
| `mongodb://localhost:27017/` | Local database me |
| `mongodb+srv://...mongodb.net/` (Atlas) | Atlas (production) me |

**Production (Atlas) me admin banana:**
1. Deploy ki hui site par `/signup` se account banao, aur email ka verify link kholo. Google se sign in kiya to email apne aap verified hota hai.
2. `.env.local` me kuch der ke liye Atlas wali `MONGODB_URI` aur `MONGODB_DB=dotkeep` rakho.
3. Command chalao:
   ```bash
   npm run make-admin -- tumhara@email.com
   ```
4. Output me `Done: ... is now an admin` aaye to `.env.local` ko turant wapas local wali values par kar do. Production ki URI local file me chhodna risky hai, `npm run dev` se production ka data badal sakta hai.
5. Site par page refresh karo. Sidebar me **Admin** dikhega.

Agar `No user with the email ...` aaye to ya to us database me wo user hai hi nahi (galat database par ho), ya email me spelling galat hai.

Atlas se connect na ho to Atlas me **Network Access** me tumhara IP allowed hona chahiye.

### Ye tareeka kyun?
Agar `.env` me `ADMIN_EMAIL=...` rakhte, to jo bhi pehle us email se signup kar leta wo admin ban jata, chahe wo email uska na ho (email verify hone se pehle bhi account ban jata hai). Isliye admin banane ka koi web rasta hai hi nahi, aur koi "pehla user admin" ya "default admin" bhi nahi hai. Signup me `role: "admin"` bhejne par bhi wo ignore hota hai (test me check kiya).

---

## 2. Admin ko kya dikhta hai

Page: `/dashboard/admin` (sidebar me **Admin**, sirf admin ko).

| Cheez | Matlab |
|---|---|
| **Registered users** | Kul kitne accounts bane, kitne admin hain, aur kitne ne abhi tak email verify nahi kiya ("N unverified") |
| **New in 7 days** | Pichle 7 din me kitne naye signup |
| **Active in 24 hours** | Pichle 24 ghante me kitne alag-alag users ne login kiya (7 din ka number niche likha hota hai) |
| **Total logins** | Kul login (sirf asli login, signup login nahi ginta, kyunki signup ke baad user ko login page par bheja jata hai) |
| **Logins per day** | Pichle 14 din ka bar chart (UTC din ke hisaab se) |
| **Users table** | Naam, email, role, joined, last login, logins, projects ki ginti, secrets ki ginti. Jis ne email verify nahi kiya uske naam ke bagal me **Unverified** ka nishaan. Search aur 20-20 ke page |

### Admin ko kya NAHI dikhta
- Kisi ka secret, uska naam, ya value
- Kisi ke project ka naam
- Password ya password hash

Table me projects aur secrets ki sirf **ginti (number)** hoti hai. Admin dusre user ka secret vault API se bhi nahi khol sakta (404 aata hai).

### Dhyan rakho
Admin ko users ke **naam aur email** dikhte hain. Ye admin ke kaam ka hissa hai.

---

## 3. Login ka record kaise rakha jata hai

| Kahan | Kya |
|---|---|
| `users` me `lastLoginAt` | Aakhri baar kab login hua |
| `users` me `loginCount` | Kitni baar login hua |
| `loginEvents` collection | Har login ka ek chhota record: **kaun (userId) aur kab (at)** |

- **IP address, device ya location save nahi hota.**
- `loginEvents` 90 din baad **apne aap delete** ho jata hai (TTL index). Isliye chart sirf pichle 14 din dikhata hai, aur `loginCount` hamesha ka total hai.
- Login record karne me gadbad ho jaye to bhi **login nahi rukta**. Error sirf log hota hai.

### Purane users
Jo users pehle se register hain unke paas ye fields nahi hain. Unhe `role: user`, `loginCount: 0` aur last login "Never" maana jata hai, jab tak wo agli baar login na karein. Unki registration ki ginti purani `createdAt` se sahi aati hai. Koi migration nahi chahiye.

---

## 4. Suraksha

| Cheez | Kaise |
|---|---|
| Admin page | Har request par database se role check hota hai. Admin nahi ho to **"not found"** (page ka exist karna hi nahi batata) |
| Sidebar ka Admin link | Sirf admin ko dikhta hai |
| Admin hatana | Turant lagu: purani cookie se bhi page nahi khulta |
| Role badalna | Sirf `make-admin` / `remove-admin` command se. Koi API ya page nahi |
| Search | Special characters (jaise `.*`) simple text maane jate hain |
| Page number | Galat ya bahut bada number ho to sahi page par aa jata hai |

Admin page me koi **delete, block ya role badalne ka button nahi** hai. Wo read-only hai.

---

## 5. Files

```
scripts/admin-role.mjs            make-admin / remove-admin command
src/db/admin.ts                   Admin ke numbers (sirf padhna, passwordHash kabhi nahi)
src/db/login-events.ts            loginEvents collection (90 din ka TTL)
src/db/users.ts                   role, lastLoginAt, loginCount, recordLogin()
src/modules/dashboard/data.ts     requireAdmin(): admin nahi to not found
src/modules/admin/admin-view.tsx  Tiles, chart, users table
src/app/dashboard/admin/page.tsx  Admin page
```

---

## 6. Jo abhi nahi hai

User ko delete, block ya role badalna UI se. Login ka device ya IP record. Email ko mask karna (`ab***@gmail.com`). Ye sab baad ke kaam hain.

**Test:** 50 se zyada checks asli MongoDB aur asli Chrome ke saath hue (admin banna, access control, ginti, privacy, search, pages, turant demotion).

---

## 5. Block, delete aur email mask

Users table me har user (admin ko chhodke) ke row par **"..."** menu hai.

| Option | Kya hota hai |
|---|---|
| **Block** | User turant har jagah se logout (saari sessions delete). Sahi password ke baad bhi login par "This account has been blocked" aata hai. Uske projects aur secrets bache rehte hain. Row par **Blocked** nishaan aur stats me "N blocked" |
| **Unblock** | Wapas login kar sakta hai |
| **Delete account** | Account, uske saare projects aur secrets (jo dusron ke saath share the wo bhi), sessions, aur dusron ke projects me uski membership, sab permanently delete. Confirm popup aata hai. Wapas nahi aata |

Rules:
- Admin **apne aap par** ya **kisi dusre admin par** block/delete nahi chala sakta (403). Pehle `npm run remove-admin -- email` se admin role hatao. Isse "last admin delete ho gaya" jaisa hadsa bhi nahi hota.
- Ye sab sirf admin ke liye hai. Non-admin ko in APIs par 404 milta hai: `PATCH/DELETE /api/admin/users/:id`, `PATCH /api/admin/preferences`.
- Block/delete server log me likhe jaate hain (kaun admin, kis user par). Abhi alag admin audit log nahi hai.
- Login par blocked ka message sirf **sahi password** ke baad aata hai, taaki bahar wala is se ye na jaan sake ki kiske paas account hai.

**Email mask:** Users panel ke upar **Mask emails** button. On karne par dusron ke emails `j***@g***.com` jaise dikhte hain. Masking **server par** hoti hai, asli email browser tak jaata hi nahi. Mask on ho to search sirf **naam** par chalti hai (warna email guess karke pata chal jata). Ye har admin ki apni setting hai (default off).
