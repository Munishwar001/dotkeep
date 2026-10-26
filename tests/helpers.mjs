/**
 * Shared helpers for the API tests in tests/api.
 *
 * The API tests talk to a RUNNING Dotkeep server (`npm run dev`) and the MongoDB it uses. They create their own
 * throw-away users (email `e2e-...@example.com`) and delete them and everything they own when the suite ends,
 * so they leave your other data alone. Users get a session straight from the database instead of going through
 * signup and login, which keeps the tests fast and out of the signup/login rate limits.
 *
 * Environment (loaded from .env.local by `npm test`):
 *   MONGODB_URI, MONGODB_DB     the same database the server uses
 *   TEST_BASE_URL               default http://localhost:3000
 */
import { createHash, randomBytes } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SESSION_COOKIE = "dotkeep_session"; // see src/lib/session-cookie.ts
export const PASSWORD = "Passw0rd!Passw0rd";

/** A fetch wrapper with its own cookie. Returns { status, data } (JSON), or the raw Response when `raw` is true. */
export function client(initialCookie = "") {
  let cookie = initialCookie;
  return async function call(method, path, body, raw = false) {
    const response = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", origin: BASE, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    if (raw) return response;
    return { status: response.status, data: await response.json().catch(() => null) };
  };
}

/**
 * The HTML of a page, as text. `next dev` sometimes answers 500 ("missing bootstrap script") while it is still
 * compiling a page for the first time, so a 5xx is retried a few times before giving up.
 */
async function fetchPage(call, path) {
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await call("GET", path, undefined, true);
    if (response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { status: response.status, html: await response.text() };
}

/**
 * One test suite's world: its own users and a database connection. Call `await world.close()` in `after()`.
 * Every user it creates is deleted again by close().
 */
export async function createWorld() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set. Run the tests with `npm test` (it loads .env.local).");
  try {
    const health = await fetch(`${BASE}/api/health/db`);
    if (!health.ok) throw new Error(`status ${health.status}`);
  } catch (error) {
    throw new Error(`Can't reach the server at ${BASE} (${error.message}). Start it with \`npm run dev\` first.`);
  }

  const mongo = await MongoClient.connect(process.env.MONGODB_URI);
  const db = mongo.db(process.env.MONGODB_DB || undefined);
  const prefix = `e2e-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const created = [];

  async function insertUser(tag, { role, passwordHash = "x" } = {}) {
    const email = `${prefix}-${tag}@example.com`;
    const { insertedId } = await db.collection("users").insertOne({
      name: `User ${tag}`,
      email,
      passwordHash,
      createdAt: new Date(),
      emailVerified: true,
      ...(role ? { role } : {}),
    });
    created.push(insertedId);
    return { id: insertedId.toString(), objectId: insertedId, email, name: `User ${tag}` };
  }

  return {
    db,
    ObjectId,

    /** A signed-in user (session created directly in the database). */
    async user(tag, options) {
      const person = await insertUser(tag, options);
      const token = randomBytes(32).toString("base64url");
      await db.collection("sessions").insertOne({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        userId: person.objectId,
        label: "Test",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const call = client(`${SESSION_COOKIE}=${token}`);
      return { ...person, call, page: (path) => fetchPage(call, path) };
    },

    /** A real account made through the signup API, so it can use /api/auth/login. Not signed in yet. */
    async signedUp(tag) {
      const call = client();
      const email = `${prefix}-${tag}@example.com`;
      const response = await call("POST", "/api/auth/signup", { name: `User ${tag}`, email, password: PASSWORD });
      if (response.status !== 201) throw new Error(`signup failed: ${JSON.stringify(response)}`);
      const doc = await db.collection("users").findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { returnDocument: "after" });
      created.push(doc._id);
      return { id: doc._id.toString(), objectId: doc._id, email, name: `User ${tag}`, call, login: () => call("POST", "/api/auth/login", { email, password: PASSWORD }) };
    },

    /** Deletes every user this world made, with their projects, secrets, versions, events, sessions and shares. */
    async close() {
      for (const collection of ["secrets", "projects", "secret_versions", "secret_events", "sessions", "project_members"]) {
        await db.collection(collection).deleteMany({ $or: [{ userId: { $in: created } }, { ownerId: { $in: created } }] });
      }
      await db.collection("users").deleteMany({ _id: { $in: created } });
      await mongo.close();
    },
  };
}
