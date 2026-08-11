import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
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
  level: "viewer" | "operator" | "manager";
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
  isWorkshopAdmin: boolean;
  isReadOnlyViewer: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  primaryGroupId: string | null;
  primaryGroupName: string | null;
  permissions: GroupPermission[];
};

export type AuthFailureReason =
  | "missing_cookie"
  | "invalid_token"
  | "missing_subject"
  | "user_not_found"
  | "session_version_mismatch";

export type AuthResult =
  | { auth: AuthContext; reason: null }
  | { auth: null; reason: AuthFailureReason };

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
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  // V2 dùng tên cookie mới để loại trừ cookie cũ/stale từ các bản trước.
  // Lax vẫn bảo vệ tốt cho ứng dụng nội bộ và ổn định hơn Strict với điều hướng/refresh.
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    expires,
    priority: "high",
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getAuthResult(): Promise<AuthResult> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { auth: null, reason: "missing_cookie" };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secret));
  } catch (error) {
    console.warn("[auth] JWT verification failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { auth: null, reason: "invalid_token" };
  }

  if (!payload.sub) return { auth: null, reason: "missing_subject" };

  const [profile] = await db
    .select({
      userId: users.id,
      username: users.username,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      accountStatus: users.accountStatus,
      isAdmin: users.isAdmin,
      isWsManager: users.isWsManager,
      isReadOnlyViewer: users.isReadOnlyViewer,
      mustChangePassword: users.mustChangePassword,
      sessionVersion: users.sessionVersion,
      primaryGroupId: users.primaryGroupId,
      primaryGroupName: groups.name,
    })
    .from(users)
    .leftJoin(groups, eq(users.primaryGroupId, groups.id))
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!profile) return { auth: null, reason: "user_not_found" };

  const tokenVersion = Number(payload.sessionVersion);
  if (!Number.isInteger(tokenVersion) || profile.sessionVersion !== tokenVersion) {
    console.warn("[auth] Session version mismatch", {
      userId: profile.userId,
      databaseVersion: profile.sessionVersion,
      tokenVersion: Number.isFinite(tokenVersion) ? tokenVersion : null,
    });
    return { auth: null, reason: "session_version_mismatch" };
  }

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

  return { auth: { ...profile, isWorkshopAdmin: profile.isAdmin || profile.isWsManager, permissions }, reason: null };
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const result = await getAuthResult();
  return result.auth;
}
