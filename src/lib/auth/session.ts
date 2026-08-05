import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, userGroupPermissions, users } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/constants";

const secretValue = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "development-only-secret-change-me");
if (!secretValue) throw new Error("Thiếu AUTH_SECRET trong môi trường production.");
const secret = new TextEncoder().encode(secretValue);

export type GroupPermission = {
  groupId: string;
  groupCode: string;
  groupName: string;
  level: "operator" | "manager";
  isPrimary: boolean;
};

export type AuthContext = {
  userId: string;
  username: string;
  fullName: string;
  employeeCode: string;
  accountStatus: "pending" | "active" | "rejected" | "blocked";
  isAdmin: boolean;
  isWsManager: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  primaryGroupId: string | null;
  primaryGroupName: string | null;
  permissions: GroupPermission[];
};

export async function createSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

export async function setSessionCookie(userId: string, sessionVersion: number) {
  const token = await createSessionToken(userId, sessionVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;

    const [profile] = await db
      .select({
        userId: users.id,
        username: users.username,
        fullName: users.fullName,
        employeeCode: users.employeeCode,
        accountStatus: users.accountStatus,
        isAdmin: users.isAdmin,
        isWsManager: users.isWsManager,
        mustChangePassword: users.mustChangePassword,
        sessionVersion: users.sessionVersion,
        primaryGroupId: users.primaryGroupId,
        primaryGroupName: groups.name,
      })
      .from(users)
      .leftJoin(groups, eq(users.primaryGroupId, groups.id))
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!profile || profile.sessionVersion !== Number(payload.sessionVersion)) return null;

    const permissions = await db
      .select({
        groupId: userGroupPermissions.groupId,
        groupCode: groups.code,
        groupName: groups.name,
        level: userGroupPermissions.permissionLevel,
        isPrimary: userGroupPermissions.isPrimary,
      })
      .from(userGroupPermissions)
      .innerJoin(groups, eq(userGroupPermissions.groupId, groups.id))
      .where(and(eq(userGroupPermissions.userId, profile.userId), eq(userGroupPermissions.isActive, true), eq(groups.isActive, true)));

    return { ...profile, permissions };
  } catch {
    return null;
  }
}
