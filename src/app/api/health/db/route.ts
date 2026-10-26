import { connection, NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongodb";

// Visit /api/health/db to check that MongoDB is reachable.
export async function GET() {
  await connection(); // only run at request time, never during the build

  if (!isMongoConfigured) {
    return NextResponse.json(
      { status: "not_configured", message: "Set MONGODB_URI in .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  try {
    const db = getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ status: "ok", database: db.databaseName });
  } catch (error) {
    // Only the error type is returned, never the connection string or password.
    return NextResponse.json(
      { status: "error", message: "Could not connect to MongoDB.", reason: error instanceof Error ? error.name : "Unknown" },
      { status: 500 },
    );
  }
}
