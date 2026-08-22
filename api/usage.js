import { sql } from "../lib/db.js";
import { sendJson } from "../lib/http.js";
import {
  getClientIp,
  hashIdentity,
} from "../lib/security.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return sendJson(
        res,
        {
          ok: false,
          message: "Method tidak valid.",
        },
        405
      );
    }

    const identity = hashIdentity(
      getClientIp(req)
    );

    const day = new Date()
      .toISOString()
      .slice(0, 10);

    const bonus = await sql`
      SELECT COALESCE(
        SUM(rc.bonus_limit),
        0
      )::int AS n
      FROM redemptions r
      JOIN redeem_codes rc
        ON rc.id = r.code_id
      WHERE r.ip_hash = ${identity}
    `;

    const row = await sql`
      SELECT used, limit_value
      FROM usage_daily
      WHERE ip_hash = ${identity}
        AND usage_date = ${day}
      LIMIT 1
    `;

    const bonusLimit = Number(
      bonus?.[0]?.n || 0
    );

    const limit = 10 + bonusLimit;

    const used = Number(
      row?.[0]?.used || 0
    );

    return sendJson(res, {
      ok: true,
      used,
      limit,
      remaining: Math.max(
        0,
        limit - used
      ),
    });
  } catch (error) {
    console.error(
      "USAGE API ERROR:",
      error
    );

    return sendJson(
      res,
      {
        ok: false,
        message:
          "Gagal mengambil data penggunaan.",
      },
      500
    );
  }
}
