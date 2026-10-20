/**
 * Read-only numbers for the admin page.
 *
 * Privacy rules this file follows:
 *  - It never reads passwordHash (it is excluded in every query).
 *  - It never reads secrets or projects themselves, only COUNTS of them per user.
 * Only call these functions after checking that the current user is an admin (see requireAdmin()).
 */
import { collections } from "./collections";
import { loginEventsCollection } from "./login-events";
import { usersCollection } from "./users";

const DAY = 24 * 60 * 60 * 1000;
export const ADMIN_PAGE_SIZE = 20;

export type AdminStats = {
  totalUsers: number;
  newUsers7d: number;
  active24h: number; // distinct users who logged in
  active7d: number;
  totalLogins: number;
  admins: number;
  unverified: number; // signed up but never confirmed their email
  loginsByDay: { date: string; count: number }[]; // last 14 days, oldest first, UTC days
};

export async function getAdminStats(): Promise<AdminStats> {
  const [users, events] = await Promise.all([usersCollection(), loginEventsCollection()]);
  const now = Date.now();
  const startOfToday = new Date(new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z").getTime();
  const chartStart = new Date(startOfToday - 13 * DAY);

  const [totalUsers, newUsers7d, admins, unverified, loginTotals, active24, active7, perDay] = await Promise.all([
    users.countDocuments({}),
    users.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY) } }),
    users.countDocuments({ role: "admin" }),
    users.countDocuments({ emailVerified: false }),
    users.aggregate<{ n: number }>([{ $group: { _id: null, n: { $sum: { $ifNull: ["$loginCount", 0] } } } }]).toArray(),
    events.distinct("userId", { at: { $gte: new Date(now - DAY) } }),
    events.distinct("userId", { at: { $gte: new Date(now - 7 * DAY) } }),
    events
      .aggregate<{ _id: string; n: number }>([
        { $match: { at: { $gte: chartStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at" } }, n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const byDay = new Map(perDay.map((row) => [row._id, row.n]));
  const loginsByDay = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(chartStart.getTime() + i * DAY).toISOString().slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });

  return {
    totalUsers,
    newUsers7d,
    admins,
    unverified,
    active24h: active24.length,
    active7d: active7.length,
    totalLogins: loginTotals[0]?.n ?? 0,
    loginsByDay,
  };
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  loginCount: number;
  projectCount: number; // numbers only: an admin never sees what is inside
  secretCount: number;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listAdminUsers(options: { query?: string; page: number }): Promise<{ users: AdminUserRow[]; total: number; pages: number; page: number }> {
  const users = await usersCollection();
  const query = options.query?.trim().slice(0, 80);
  const filter = query ? { $or: [{ email: new RegExp(escapeRegExp(query), "i") }, { name: new RegExp(escapeRegExp(query), "i") }] } : {};

  const total = await users.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page), pages);

  const docs = await users
    .find(filter, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .skip((page - 1) * ADMIN_PAGE_SIZE)
    .limit(ADMIN_PAGE_SIZE)
    .toArray();

  const ids = docs.map((doc) => doc._id);
  const { projects, secrets } = await collections();
  const [projectCounts, secretCounts] = await Promise.all([
    projects.aggregate<{ _id: unknown; n: number }>([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]).toArray(),
    secrets.aggregate<{ _id: unknown; n: number }>([{ $match: { userId: { $in: ids } } }, { $group: { _id: "$userId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const projectsBy = new Map(projectCounts.map((row) => [String(row._id), row.n]));
  const secretsBy = new Map(secretCounts.map((row) => [String(row._id), row.n]));

  return {
    total,
    pages,
    page,
    users: docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      role: doc.role ?? "user",
      emailVerified: doc.emailVerified !== false,
      createdAt: doc.createdAt.toISOString(),
      lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
      loginCount: doc.loginCount ?? 0,
      projectCount: projectsBy.get(doc._id.toString()) ?? 0,
      secretCount: secretsBy.get(doc._id.toString()) ?? 0,
    })),
  };
}
