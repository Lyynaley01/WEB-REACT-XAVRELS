import { sql } from "../lib/db.js";
import { sendJson, body } from "../lib/http.js";

import {
  normalize,
  sendReaction,
} from "../lib/reaction.js";

import {
  getClientIp,
  hashIdentity,
  requireAdmin,
  sameOrigin,
} from "../lib/security.js";

const BASE_LIMIT = 10;

export default async function handler(req, res) {
  try {
    // ==============================
    // METHOD
    // ==============================
    if (req.method !== "POST") {
      return sendJson(
        res,
        {
          ok: false,
          message: "Method tidak valid.",
        },
        405
      );
    }

    // ==============================
    // SAME ORIGIN
    // ==============================
    if (!sameOrigin(req)) {
      return sendJson(
        res,
        {
          ok: false,
          message: "Origin tidak diizinkan.",
        },
        403
      );
    }

    // ==============================
    // REQUEST BODY
    // ==============================
    const b = await body(req);

    const targetUrl = String(
      b?.url || ""
    ).trim();

    const rawReaction = String(
      b?.reaction || ""
    ).trim();

    // ==============================
    // NORMALIZE TARGET + REACTION
    // ==============================
    const parsed = normalize(
      targetUrl,
      rawReaction
    );

    if (parsed?.error) {
      return sendJson(
        res,
        {
          ok: false,
          message: parsed.error,
        },
        400
      );
    }

    // ==============================
    // CHECK ADMIN SESSION
    // ==============================
    const adminResult =
      await requireAdmin(req);

    const isAdmin =
      adminResult?.ok === true;

    // ==============================
    // IDENTIFY USER
    // ==============================
    const clientIp =
      getClientIp(req);

    const identity =
      hashIdentity(clientIp);

    const day = new Date()
      .toISOString()
      .slice(0, 10);

    // ==============================
    // BONUS LIMIT
    // ==============================
    let bonus = 0;

    try {
      const bonusRows = await sql`
        SELECT COALESCE(
          SUM(rc.bonus_limit),
          0
        )::int AS bonus
        FROM redemptions r
        JOIN redeem_codes rc
          ON rc.id = r.code_id
        WHERE r.ip_hash = ${identity}
      `;

      bonus = Number(
        bonusRows?.[0]?.bonus || 0
      );
    } catch (error) {
      console.error(
        "BONUS QUERY ERROR:",
        error
      );

      // Jangan membuat request gagal
      // hanya karena bonus gagal dibaca.
      bonus = 0;
    }

    const limit =
      BASE_LIMIT + bonus;

    // ==============================
    // CREATE / UPDATE DAILY USAGE
    // ==============================
    try {
      await sql`
        INSERT INTO usage_daily(
          ip_hash,
          usage_date,
          used,
          limit_value
        )
        VALUES(
          ${identity},
          ${day},
          0,
          ${limit}
        )
        ON CONFLICT(
          ip_hash,
          usage_date
        )
        DO UPDATE SET
          limit_value = ${limit}
      `;
    } catch (error) {
      console.error(
        "USAGE INIT ERROR:",
        error
      );

      return sendJson(
        res,
        {
          ok: false,
          message:
            "Gagal mengakses data penggunaan.",
        },
        500
      );
    }

    // ==============================
    // CONSUME QUOTA
    // ADMIN = UNLIMITED
    // ==============================
    if (!isAdmin) {
      let claimed;

      try {
        claimed = await sql`
          UPDATE usage_daily
          SET
            used = used + 1,
            updated_at = NOW()
          WHERE
            ip_hash = ${identity}
            AND usage_date = ${day}
            AND used < limit_value
          RETURNING
            used,
            limit_value
        `;
      } catch (error) {
        console.error(
          "USAGE CLAIM ERROR:",
          error
        );

        return sendJson(
          res,
          {
            ok: false,
            message:
              "Gagal memeriksa limit harian.",
          },
          500
        );
      }

      if (
        !claimed ||
        claimed.length === 0
      ) {
        return sendJson(
          res,
          {
            ok: false,
            message:
              "Limit harian kamu sudah habis.\nBalik lagi besok ya — limit direset otomatis setiap hari!",
          },
          429
        );
      }
    }

    // ==============================
    // SEND REACTIONS
    // ==============================
    const results = [];

    for (
      const emoji of parsed.reactions
    ) {
      try {
        const result =
          await sendReaction(
            parsed.url,
            emoji
          );

        results.push(
          result || {
            ok: false,
            emoji,
            message:
              "Response reaction kosong.",
          }
        );
      } catch (error) {
        console.error(
          `REACTION ERROR [${emoji}]:`,
          error
        );

        results.push({
          ok: false,
          emoji,
          message:
            "Terjadi kesalahan saat mengirim reaction.",
        });
      }
    }

    // ==============================
    // RESULT
    // ==============================
    const successResults =
      results.filter(
        (item) =>
          item?.ok === true
      );

    const failedResults =
      results.filter(
        (item) =>
          item?.ok !== true
      );

    // ==============================
    // ALL SUCCESS
    // ==============================
    if (
      successResults.length ===
      results.length
    ) {
      if (results.length === 1) {
        return sendJson(
          res,
          {
            ok: true,
            message:
              "✅ Reaction berhasil!\n\nLihat postingan channel anda 🫡",
          },
          200
        );
      }

      return sendJson(
        res,
        {
          ok: true,
          message:
            `✅ Semua ${results.length} reaction berhasil!\n\n` +
            `${successResults
              .map(
                (item) =>
                  item.emoji
              )
              .join("  ")}\n\n` +
            "Lihat postingan channel anda 🫡",
        },
        200
      );
    }

    // ==============================
    // ALL FAILED
    // ==============================
    if (
      successResults.length === 0
    ) {
      return sendJson(
        res,
        {
          ok: false,
          message:
            `❌ Semua reaction gagal!\n\n` +
            `${failedResults
              .map(
                (item) =>
                  `${item.emoji} (${item.message || "Gagal diproses."})`
              )
              .join("\n")}`,
        },
        400
      );
    }

    // ==============================
    // PARTIAL SUCCESS
    // ==============================
    return sendJson(
      res,
      {
        ok: false,
        partial: true,
        message:
          `⚠️ ${successResults.length} dari ${results.length} reaction berhasil.\n\n` +
          `✅ Berhasil: ${successResults
            .map(
              (item) =>
                item.emoji
            )
            .join("  ")}\n` +
          `❌ Gagal:\n${failedResults
            .map(
              (item) =>
                `${item.emoji} (${item.message || "Gagal diproses."})`
            )
            .join("\n")}`,
      },
      207
    );
  } catch (error) {
    console.error(
      "REACT API ERROR:",
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
