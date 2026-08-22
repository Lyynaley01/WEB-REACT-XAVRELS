import crypto from "node:crypto";
import { sql } from "../lib/db.js";
import { json, body } from "../lib/http.js";
import {
  sessionCookie,
  clearCookie,
  parseSession,
  csrfOk,
  sameOrigin,
  getClientIp,
  hashIdentity,
  audit
} from "../lib/security.js";

function passwordOk(input) {
  const actual = process.env.ADMIN_PASSWORD || "";

  if (!actual || !input) {
    return false;
  }

  const a = Buffer.from(String(input));
  const b = Buffer.from(String(actual));

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

function getRequestUrl(req) {
  const rawUrl = req?.url || "/";

  // Kalau sudah absolute URL
  if (/^https?:\/\//i.test(rawUrl)) {
    return new URL(rawUrl);
  }

  const host =
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host;

  const protocol =
    req?.headers?.["x-forwarded-proto"] ||
    "https";

  if (!host) {
    throw new Error("Request host tidak tersedia.");
  }

  return new URL(
    rawUrl,
    `${protocol}://${host}`
  );
}

export default async function handler(req) {
  const url = getRequestUrl(req);
  const action = url.searchParams.get("action") || "";

  // =========================
  // GET /api/auth?action=me
  // =========================
  if (req.method === "GET" && action === "me") {
    const session = parseSession(req);

    if (!session) {
      return json(
        {
          ok: false,
          message: "Unauthorized."
        },
        401
      );
    }

    return json({
      ok: true,
      csrf: session.csrf,
      expiresAt: session.exp
    });
  }

  // =========================
  // POST SECURITY
  // =========================
  if (
    req.method === "POST" &&
    !sameOrigin(req)
  ) {
    return json(
      {
        ok: false,
        message: "Origin tidak diizinkan."
      },
      403
    );
  }

  // =========================
  // POST /api/auth
  // =========================
  if (req.method === "POST") {
    const b = await body(req);
    const act = b?.action || "login";

    // =========================
    // LOGIN
    // =========================
    if (act === "login") {
      const ip = hashIdentity(
        getClientIp(req)
      );

      const recent = await sql`
        SELECT COUNT(*)::int AS n
        FROM auth_attempts
        WHERE ip_hash = ${ip}
          AND created_at > NOW() - INTERVAL '15 minutes'
      `;

      const attempts = Number(
        recent?.[0]?.n || 0
      );

      if (attempts >= 10) {
        return json(
          {
            ok: false,
            message:
              "Terlalu banyak percobaan login. Coba lagi nanti."
          },
          429
        );
      }

      await sql`
        INSERT INTO auth_attempts(ip_hash)
        VALUES(${ip})
      `;

      const password = String(
        b?.password || ""
      );

      if (!passwordOk(password)) {
        return json(
          {
            ok: false,
            message:
              "Password salah. Coba lagi."
          },
          401
        );
      }

      // =========================
      // CREATE SESSION
      // =========================
      const csrf =
        crypto
          .randomBytes(24)
          .toString("hex");

      const now = Date.now();

      const payload = {
        iat: now,
        exp: now + 12 * 60 * 60 * 1000,
        csrf
      };

      await audit(
        "admin_login",
        ip
      );

      return json(
        {
          ok: true
        },
        200,
        {
          "set-cookie":
            sessionCookie(payload)
        }
      );
    }

    // =========================
    // LOGOUT
    // =========================
    if (act === "logout") {
      const session = parseSession(req);

      if (
        session &&
        !csrfOk(req, session)
      ) {
        return json(
          {
            ok: false,
            message:
              "CSRF token tidak valid."
          },
          403
        );
      }

      return json(
        {
          ok: true
        },
        200,
        {
          "set-cookie":
            clearCookie()
        }
      );
    }

    // =========================
    // UNKNOWN ACTION
    // =========================
    return json(
      {
        ok: false,
        message: "Action tidak dikenal."
      },
      400
    );
  }

  // =========================
  // METHOD NOT ALLOWED
  // =========================
  return json(
    {
      ok: false,
      message: "Method tidak valid."
    },
    405
  );
}
