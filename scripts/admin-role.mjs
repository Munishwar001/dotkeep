// Gives or removes the admin role. This is the ONLY way to become an admin: there is no page or API for it,
// so nobody can promote themselves from the website.
//
//   npm run make-admin -- you@example.com      (the person must have signed up first)
//   npm run remove-admin -- you@example.com
//
// It reads MONGODB_URI (and MONGODB_DB) from .env.local.
import { MongoClient } from "mongodb";

const [, , action, rawEmail] = process.argv;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!["grant", "revoke"].includes(action) || !rawEmail) {
  fail("Usage: npm run make-admin -- <email>   or   npm run remove-admin -- <email>");
}
if (!process.env.MONGODB_URI) fail("MONGODB_URI is not set. Add it to .env.local first.");

const email = rawEmail.trim().toLowerCase(); // emails are stored in lowercase
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

try {
  const users = client.db(process.env.MONGODB_DB || undefined).collection("users");
  const user = await users.findOne({ email });
  if (!user) fail(`No user with the email ${email}. They need to sign up on the website first.`);

  const role = action === "grant" ? "admin" : "user";
  if ((user.role ?? "user") === role) {
    console.log(`\n${email} is already ${role === "admin" ? "an admin" : "a regular user"}. Nothing changed.\n`);
  } else {
    await users.updateOne({ _id: user._id }, { $set: { role } });
    console.log(`\nDone: ${email} is now ${role === "admin" ? "an admin" : "a regular user"}. It takes effect immediately.\n`);
  }
} catch (error) {
  fail(`Could not reach MongoDB: ${error.message}`);
} finally {
  await client.close();
}
