import { notFound } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/server/session";
import type { AdminRole } from "./nav";

export type AdminSessionUser = SessionUser & { role: AdminRole };

/** Any admin-area user (ADMIN or MODERATOR). 404s for everyone else so the area stays invisible. */
export async function requireStaff(): Promise<AdminSessionUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "MODERATOR")) notFound();
  return user as AdminSessionUser;
}

/** ADMIN-only sections (billing, system, hub, credits…). */
export async function requireAdmin(): Promise<AdminSessionUser> {
  const user = await requireStaff();
  if (user.role !== "ADMIN") notFound();
  return user;
}
