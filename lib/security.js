import crypto from "node:crypto";
import { sql } from "./db.js";

const COOKIE = "wa_admin_session";
const TTL = 12 * 60 * 60 * 1000;

const secret = () => {
  const value = process.env.SESSION_SECRET;

  if (!value) {
    throw new Error("SESSION_SECRET environment variable is missing");
  }

  return value;
};

function getHeader(req, name) {
  const headers = req?.headers;

  if (!headers) return "";

  // Node.js / Vercel
  if (typeof headers.get !== "function") {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value || "";
  }

  // Web Request compatibility
  return headers.get(name) || "";
}

function getRequestUrl(req) {
  const rawUrl = req?.url || "/";

  // Jika sudah absolute URL
  try {
    return new URL(rawUrl);
  } catch {}

  // Vercel / Node.js biasanya memberikan URL relatif
  const host =
    getHeader(req, "x-forwarded-host") ||
    getHeader(req, "host");

  const protocol =
    getHeader(req, "x-forwarded-proto") ||
    "https";

  if (!host) return null;

  try {
    return new URL(rawUrl, `${protocol}://${host}`);
  } catch {
    return null;
  }
}

function b64(x) {
  return Buffer.from(x).toString("base64url");
}

function unb64(x) {
  return Buffer.from(x, "base64url").toString();
}

function sign(value) {
  return crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
}

export function sessionCookie(payload) {
  const value = b64(JSON.stringify(payload));

  return `${COOKIE}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(TTL / 1000)}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function parseSession(req) {
  const cookieHeader = getHeader(req, "cookie");

  const raw = cookieHeader
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${COOKIE}=`));

  if (!raw) return null;

  const token = raw.slice(COOKIE.length + 1);
  const dot = token.lastIndexOf(".");

  if (dot < 1) return null;

  const value = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(value);

  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expected)
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(unb64(value));

    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function csrfOk(req, session) {
  const token = getHeader(req, "x-csrf-token");

  return !!session?.csrf && token === session.csrf;
}

export function sameOrigin(req) {
  const origin = getHeader(req, "origin");

  // Browser request tanpa Origin masih diperbolehkan
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = getRequestUrl(req);

    if (!requestUrl) return false;

    return originUrl.origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export function getClientIp(req) {
  const forwarded = getHeader(req, "x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = getHeader(req, "x-real-ip");

  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

export function hashIdentity(value) {
  return crypto
    .createHash("sha256")
    .update(
      `${process.env.IP_HASH_SALT || secret()}:${value}`
    )
    .digest("hex");
}

export async function requireAdmin(req) {
  const session = parseSession(req);

  if (!session) {
    return {
      ok: false,
      status: 401,
    };
  }

  return {
    ok: true,
    session,
  };
}

export async function audit(action, ipHash, meta = {}) {
  try {
    await sql`
      INSERT INTO audit_log(action, ip_hash, meta)
      VALUES(
        ${action},
        ${ipHash},
        ${JSON.stringify(meta)}::jsonb
      )
    `;
  } catch {}
}
