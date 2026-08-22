import crypto from "node:crypto";

import { sql } from "../lib/db.js";
import { body, sendJson } from "../lib/http.js";

import {
  sessionCookie,
  clearCookie,
  parseSession,
  csrfOk,
  sameOrigin,
  getClientIp,
  hashIdentity,
  audit,
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

  // Kalau req.url sudah berupa absolute URL
  if (/^https?:\/\//i.test(rawUrl)) {
    return new URL(rawUrl);
  }

  const host =
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host;

  if (!host) {
    throw new Error(
      "Request host tidak tersedia."
    );
  }

  const protocol =
    req?.headers?.["x-forwarded-proto"] ||
    "https";

  return new URL(
    rawUrl,
    `${protocol}://${host}`
  );
}

async function handle(req, res) {
  try {
    const url = getRequestUrl(req);
    const action =
      url.searchParams.get("action") || "";

    /*
     * GET /api/auth?action=me
     */
    if (
      req.method === "GET" &&
      action === "me"
    ) {
      const session = parseSession(req);

      if (!session) {
        return sendJson(
          res,
          {
            ok: false,
            message: "Unauthorized.",
          },
          401
        );
      }

      return sendJson(res, {
        ok: true,
        csrf: session.csrf,
        expiresAt: session.exp,
      });
    }

    /*
     * Hanya POST yang membutuhkan Origin check.
     */
    if (
      req.method === "POST" &&
      !sameOrigin(req)
    ) {
      return sendJson(
        res,
        {
          ok: false,
          message: "Origin tidak diizinkan.",
        },
        403
      );
    }

    /*
     * POST /api/auth
     */
    if (req.method === "POST") {
      const b = await body(req);
      const act = b?.action || "login";

      /*
       * LOGIN
       */
      if (act === "login") {
        const password = String(
          b?.password || ""
        );

        const ip = hashIdentity(
          getClientIp(req)
        );

        /*
         * Rate limit login.
         */
        const recent = await sql`
          SELECT COUNT(*)::int AS n
          FROM auth_attempts
          WHERE ip_hash = ${ip}
            AND created_at >
                NOW() - INTERVAL '15 minutes'
        `;

        const attempts = Number(
          recent?.[0]?.n || 0
        );

        if (attempts >= 10) {
          return sendJson(
            res,
            {
              ok: false,
              message:
                "Terlalu banyak percobaan login. Coba lagi nanti.",
            },
            429
          );
        }

        /*
         * Simpan percobaan login.
         */
        await sql`
          INSERT INTO auth_attempts(ip_hash)
          VALUES(${ip})
        `;

        /*
         * Cek password.
         */
        if (!passwordOk(password)) {
          return sendJson(
            res,
            {
              ok: false,
              message:
                "Password salah. Coba lagi.",
            },
            401
          );
        }

        /*
         * Buat CSRF token.
         */
        const csrf =
          crypto
            .randomBytes(24)
            .toString("hex");

        const now = Date.now();

        const payload = {
          iat: now,
          exp:
            now +
            12 * 60 * 60 * 1000,
          csrf,
        };

        /*
         * Audit login.
         */
        await audit(
          "admin_login",
          ip
        );

        /*
         * Set session cookie.
         */
        return sendJson(
          res,
          {
            ok: true,
          },
          200,
          {
            "set-cookie":
              sessionCookie(payload),
          }
        );
      }

      /*
       * LOGOUT
       */
      if (act === "logout") {
        const session =
          parseSession(req);

        if (
          session &&
          !csrfOk(req, session)
        ) {
          return sendJson(
            res,
            {
              ok: false,
              message:
                "CSRF token tidak valid.",
            },
            403
          );
        }

        return sendJson(
          res,
          {
            ok: true,
          },
          200,
          {
            "set-cookie":
              clearCookie(),
          }
        );
      }

      /*
       * Action tidak dikenal.
       */
      return sendJson(
        res,
        {
          ok: false,
          message:
            "Action tidak dikenal.",
        },
        400
      );
    }

    /*
     * Method selain GET/POST.
     */
    return sendJson(
      res,
      {
        ok: false,
        message:
          "Method tidak valid.",
      },
      405
    );
  } catch (error) {
    console.error(
      "AUTH API ERROR:",
      error
    );

    return sendJson(
      res,
      {
        ok: false,
        message:
          "Terjadi kesalahan pada server.",
      },
      500
    );
  }
}

export default handle;
