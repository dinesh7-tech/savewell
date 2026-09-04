import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

export const LOCAL_AUTH_COOKIE = "savewell_session";

function configuredEmail(): string {
  return process.env.SAVEWELL_AUTH_EMAIL?.trim().toLowerCase() ?? "";
}

function configuredPassword(): string {
  return process.env.SAVEWELL_AUTH_PASSWORD ?? "";
}

function sessionSecret(): string {
  return process.env.SAVEWELL_AUTH_SECRET || configuredPassword();
}

function signature(value: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function readCookie(req: Request): string | undefined {
  const header = req.headers.cookie ?? "";
  const value = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${LOCAL_AUTH_COOKIE}=`));
  return value?.slice(LOCAL_AUTH_COOKIE.length + 1);
}

function isValidSession(value: string | undefined): boolean {
  if (!value || !sessionSecret()) return false;
  const [issuedAt, providedSignature] = value.split(".");
  if (!issuedAt || !providedSignature || !/^\d+$/.test(issuedAt)) return false;
  if (Date.now() - Number(issuedAt) > 7 * 24 * 60 * 60 * 1000) return false;
  const expected = signature(issuedAt);
  const provided = Buffer.from(providedSignature, "hex");
  const actual = Buffer.from(expected, "hex");
  return provided.length === actual.length && crypto.timingSafeEqual(provided, actual);
}

export function localAuthConfigured(): boolean {
  return Boolean(configuredEmail() && configuredPassword());
}

export function checkCredentials(email: unknown, password: unknown): boolean {
  return typeof email === "string" && typeof password === "string" &&
    email.trim().toLowerCase() === configuredEmail() && password === configuredPassword();
}

export function setSession(res: Response): void {
  const issuedAt = String(Date.now());
  res.cookie(LOCAL_AUTH_COOKIE, `${issuedAt}.${signature(issuedAt)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(LOCAL_AUTH_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function requireLocalAuth(req: Request, res: Response, next: NextFunction): void {
  if (!localAuthConfigured()) {
    res.status(503).json({ error: "Local authentication is not configured." });
    return;
  }
  if (!isValidSession(readCookie(req))) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  next();
}

export function hasLocalSession(req: Request): boolean {
  return localAuthConfigured() && isValidSession(readCookie(req));
}
