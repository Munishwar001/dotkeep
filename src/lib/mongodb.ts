import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

export const isMongoConfigured = Boolean(uri);

declare global {
  // Reused across hot reloads in development so we don't open a new connection on every edit.
  var __dotkeepMongoClient: MongoClient | undefined;
}

/** Shared MongoDB client. It connects lazily on the first query, not when this file is imported. */
export function getMongoClient() {
  if (!uri) throw new Error("MONGODB_URI is not set. See .env.local.");
  // Fail fast (5s) instead of the 30s default when the database can't be reached. The pool is kept small because on
  // Vercel every server instance has its own pool, and Atlas's free tier allows only 500 connections in total.
  globalThis.__dotkeepMongoClient ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10, maxIdleTimeMS: 60_000 });
  return globalThis.__dotkeepMongoClient;
}

/** The database named in MONGODB_DB, or the one in the connection string. */
export function getDb() {
  return getMongoClient().db(process.env.MONGODB_DB || undefined);
}
