/**
 * Two-factor sign-in: setup, the code step at login, replay and brute-force limits, recovery codes, turning it off.
 * Needs `npm run dev` running (see tests/helpers.mjs).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PASSWORD, client, createWorld } from "../helpers.mjs";
import { totpCodeAt } from "../../src/lib/totp.ts";

const STEP = 30_000;
let world, person, secret, recoveryCodes;

const userDoc = () => world.db.collection("users").findOne({ _id: person.objectId });
// Every sign-in attempt gets its own cookie jar, like a separate browser.
const startLogin = async () => {
  const call = client();
  const login = await call("POST", "/api/auth/login", { email: person.email, password: PASSWORD });
  return { call, login };
};

before(async () => {
  world = await createWorld();
  person = await world.signedUp("tf");
  // Sign in once the normal way (2FA is still off) to get a session for Settings.
  assert.equal((await person.login()).status, 200);
});
const clearLimits = () => world.db.collection("rateLimits").deleteMany({ _id: { $in: [`2fa-settings:${person.id}`, `2fa:user:${person.id}`, `2fa-stepup:${person.id}`] } });
after(async () => {
  await clearLimits();
  await world.db.collection("twoFactorChallenges").deleteMany({ userId: person.objectId });
  await world.close();
});

describe("turning it on", () => {
  it("won't start without the right password", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/setup", { password: "wrong-password" })).status, 400);
  });

  it("returns a secret and QR, and stores the secret encrypted", async () => {
    const { status, data } = await person.call("POST", "/api/account/2fa/setup", { password: PASSWORD });
    assert.equal(status, 200);
    assert.match(data.secret, /^[A-Z2-7]{32}$/);
    assert.ok(data.qr.startsWith("data:image/png;base64,"));
    secret = data.secret;
    const doc = await userDoc();
    assert.ok(doc.twoFactorPending && !doc.twoFactor, "pending only, not active yet");
    assert.ok(!JSON.stringify(doc).includes(secret), "the plain secret is never stored");
  });

  it("stays off until a correct code arrives", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/enable", { code: "000000" })).status, 400);
    assert.equal((await userDoc()).twoFactor, undefined);
  });

  it("turns on with a correct code and returns 8 recovery codes once", async () => {
    // One step in the past, so the next two steps are still free for the sign-in tests.
    const { status, data } = await person.call("POST", "/api/account/2fa/enable", { code: totpCodeAt(secret, Date.now() - STEP) });
    assert.equal(status, 200);
    assert.equal(data.recoveryCodes.length, 8);
    recoveryCodes = data.recoveryCodes;
    const doc = await userDoc();
    assert.equal(doc.twoFactor.recoveryHashes.length, 8);
    assert.ok(!JSON.stringify(doc).includes(recoveryCodes[0]), "recovery codes are stored hashed");
    assert.equal(doc.twoFactorPending, undefined);
  });

  it("refuses a second setup while it is on", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/setup", { password: PASSWORD })).status, 409);
  });
});

describe("signing in", () => {
  it("gives a challenge instead of a session after the password", async () => {
    const { call, login } = await startLogin();
    assert.equal(login.status, 200);
    assert.deepEqual(login.data, { twoFactorRequired: true });
    assert.equal((await call("PATCH", "/api/account/preferences", { revealSeconds: 15 })).status, 401, "no session yet");
  });

  it("completes with a correct code, and refuses the same code twice", async () => {
    const code = totpCodeAt(secret);
    const first = await startLogin();
    assert.equal((await first.call("POST", "/api/auth/2fa", { code: "111111" })).status, 401);
    const ok = await first.call("POST", "/api/auth/2fa", { code });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.email, person.email);
    assert.equal((await first.call("PATCH", "/api/account/preferences", { revealSeconds: 15 })).status, 200, "now signed in");

    const replay = await startLogin();
    assert.equal((await replay.call("POST", "/api/auth/2fa", { code })).status, 401, "a used code can't be replayed");
    assert.equal((await replay.call("POST", "/api/auth/2fa", { code: totpCodeAt(secret, Date.now() + STEP) })).status, 200, "the next code works");
  });

  it("needs the challenge cookie", async () => {
    const res = await client()("POST", "/api/auth/2fa", { code: totpCodeAt(secret) });
    assert.equal(res.status, 401);
    assert.equal(res.data.code, "challenge_expired");
  });

  it("ends the challenge after 5 wrong codes, even if the 6th is right", async () => {
    const { call } = await startLogin();
    for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/api/auth/2fa", { code: "000000" })).status, 401);
    const late = await call("POST", "/api/auth/2fa", { code: recoveryCodes[7] });
    assert.equal(late.status, 401);
    assert.equal(late.data.code, "challenge_expired");
  });

  it("accepts each recovery code once, in any case", async () => {
    const code = recoveryCodes[0].toUpperCase();
    const first = await startLogin();
    assert.equal((await first.call("POST", "/api/auth/2fa", { code })).status, 200);
    const second = await startLogin();
    assert.equal((await second.call("POST", "/api/auth/2fa", { code })).status, 401);
    assert.equal((await userDoc()).twoFactor.recoveryHashes.length, 7);
  });
});

describe("protecting secret values with a code (opt-in)", () => {
  let project, secret;
  before(clearLimits); // the sections above already used some of the 10 tries per 15 minutes
  const expire = () => world.db.collection("sessions").updateMany({ userId: person.objectId }, { $unset: { stepUpUntil: "" } });
  const reveal = (who = person) => who.call("POST", `/api/vault/secrets/${secret.id}/reveal`);
  const exportEnv = () => person.call("POST", "/api/vault/export", { projectId: project.id, environment: "production" });
  const lock = (body) => person.call("POST", "/api/account/2fa/secrets-lock", body);

  before(async () => {
    project = (await person.call("POST", "/api/vault/projects", { name: "TF", description: "" })).data.project;
    secret = (await person.call("POST", "/api/vault/secrets", { projectId: project.id, name: "TOKEN", environment: "production", type: "other", value: "s3cret" })).data.secret;
  });

  it("is off by default: 2FA alone doesn't change how reveal works", async () => {
    await expire();
    assert.equal((await userDoc()).secretsNeedCode, undefined);
    const res = await reveal();
    assert.equal(res.status, 200);
    assert.equal(res.data.value, "s3cret");
  });

  it("can't be switched on without 2FA", async () => {
    const plain = await world.user("nofa");
    assert.equal((await plain.call("POST", "/api/account/2fa/secrets-lock", { enabled: true })).status, 409);
  });

  it("switches on with one request", async () => {
    assert.equal((await lock({ enabled: "yes" })).status, 400);
    assert.equal((await lock({ enabled: true })).status, 200);
    assert.equal((await userDoc()).secretsNeedCode, true);
  });

  it("then refuses reveal, version reveal and export without a recent code, with a code the page can act on", async () => {
    await expire();
    for (const res of [
      await reveal(),
      await person.call("POST", `/api/vault/secrets/${secret.id}/versions/${"0".repeat(24)}/reveal`),
      await exportEnv(),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(res.data.code, "step_up_required");
      assert.ok(!JSON.stringify(res.data).includes("s3cret"));
    }
  });

  it("still lets you see names and everything that isn't a value", async () => {
    const res = await person.call("GET", `/api/vault/secrets?projectId=${project.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.secrets.length, 1);
    assert.ok(!JSON.stringify(res.data).includes("s3cret"));
  });

  it("rejects a wrong code and stays locked", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/verify", { code: "000000" })).status, 400);
    assert.equal((await reveal()).status, 403);
  });

  it("unlocks reveal and export with a valid code (a recovery code works too)", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/verify", { code: recoveryCodes[3] })).status, 200);
    assert.equal((await reveal()).data.value, "s3cret");
    const exported = await exportEnv();
    assert.equal(exported.status, 200);
    assert.match(exported.data.content, /TOKEN=s3cret/);
  });

  it("asks again after the window has passed", async () => {
    await world.db.collection("sessions").updateMany({ userId: person.objectId }, { $set: { stepUpUntil: new Date(Date.now() - 1000) } });
    assert.equal((await reveal()).status, 403);
  });

  it("lets a fresh 2FA sign-in reveal straight away", async () => {
    const { call } = await startLogin();
    assert.equal((await call("POST", "/api/auth/2fa", { code: recoveryCodes[4] })).status, 200);
    assert.equal((await call("POST", `/api/vault/secrets/${secret.id}/reveal`)).data.value, "s3cret");
  });

  it("switches off only with the password and a valid code", async () => {
    assert.equal((await lock({ enabled: false })).status, 400);
    assert.equal((await lock({ enabled: false, password: "wrong", code: recoveryCodes[5] })).status, 400);
    assert.equal((await lock({ enabled: false, password: PASSWORD, code: "000000" })).status, 400);
    assert.equal((await userDoc()).secretsNeedCode, true, "still on after the failed attempts");

    assert.equal((await lock({ enabled: false, password: PASSWORD, code: recoveryCodes[5] })).status, 200);
    assert.equal((await userDoc()).secretsNeedCode, undefined);
    await expire();
    assert.equal((await reveal()).status, 200, "no code asked once it's off");
  });

  it("is left on for the next section, which turns 2FA off and checks it goes too", async () => {
    assert.equal((await lock({ enabled: true })).status, 200);
    // left on here on purpose: the "changing it" section below turns 2FA off and checks the flag goes with it
    assert.equal((await userDoc()).secretsNeedCode, true);
  });
});

describe("changing it", () => {
  before(clearLimits); // the sections above already used most of the 10 tries per 15 minutes
  it("makes new recovery codes only with the password and a code, and the old ones stop working", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/recovery-codes", { password: PASSWORD, code: "000000" })).status, 400);
    const { status, data } = await person.call("POST", "/api/account/2fa/recovery-codes", { password: PASSWORD, code: recoveryCodes[1] });
    assert.equal(status, 200);
    assert.equal(data.recoveryCodes.length, 8);
    assert.equal((await userDoc()).twoFactor.recoveryHashes.length, 8);
    const old = await person.call("POST", "/api/account/2fa/disable", { password: PASSWORD, code: recoveryCodes[2] });
    assert.equal(old.status, 400, "an old recovery code no longer works");
    recoveryCodes = data.recoveryCodes;
  });

  it("turns off only with the password and a valid code", async () => {
    assert.equal((await person.call("POST", "/api/account/2fa/disable", { password: "wrong", code: recoveryCodes[0] })).status, 400);
    assert.equal((await person.call("POST", "/api/account/2fa/disable", { password: PASSWORD, code: "000000" })).status, 400);
    assert.notEqual((await userDoc()).twoFactor, undefined);

    assert.equal((await person.call("POST", "/api/account/2fa/disable", { password: PASSWORD, code: recoveryCodes[0] })).status, 200);
    assert.equal((await userDoc()).twoFactor, undefined);
    assert.equal((await userDoc()).secretsNeedCode, undefined, "the secrets lock goes with 2FA");
  });

  it("signs in with just the password again afterwards", async () => {
    const { login } = await startLogin();
    assert.equal(login.status, 200);
    assert.ok(login.data.user && !login.data.twoFactorRequired);
  });
});
