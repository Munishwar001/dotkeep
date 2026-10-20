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
1. Pehle website par `/signup` se normal account banao.
2. Terminal me upar wali command chalao (apna email daalo).
3. Browser me dobara `/dashboard` kholo. Sidebar me **Admin** dikhega.

Command `.env.local` se `MONGODB_URI` padhti hai. Admin banne ya hatne ka asar **turant** hota hai, dobara login nahi karna padta.

### Ye tareeka kyun?
Abhi signup par email verify nahi hota. Agar `.env` me `ADMIN_EMAIL=...` rakhte, to jo bhi pehle us email se signup kar leta wo admin ban jata, chahe wo email uska na ho. Isliye admin banane ka koi web rasta hai hi nahi. Signup me `role: "admin"` bhejne par bhi wo ignore hota hai (test me check kiya).

---

## 2. Admin ko kya dikhta hai

Page: `/dashboard/admin` (sidebar me **Admin**, sirf admin ko).

| Cheez | Matlab |
|---|---|
| **Registered users** | Kul kitne accounts bane, aur kitne admin hain |
| **New in 7 days** | Pichle 7 din me kitne naye signup |
| **Active in 24 hours** | Pichle 24 ghante me kitne alag-alag users ne login kiya (7 din ka number niche likha hota hai) |
| **Total logins** | Kul login. Signup bhi ek login gina jata hai, kyunki signup ke baad user login ho jata hai |
| **Logins per day** | Pichle 14 din ka bar chart (UTC din ke hisaab se) |
| **Users table** | Naam, email, role, joined, last login, logins, projects ki ginti, secrets ki ginti. Search aur 20-20 ke page |

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
