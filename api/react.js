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

    /*
     * Validasi origin.
     */
    if (!sameOrigin(req)) {
      return sendJson(
        res,
        {
          ok: false,
          message:
            "Origin tidak diizinkan.",
        },
        403
      );
    }

    /*
     * Baca request body.
     */
    const b = await body(req);

    const parsed = normalize(
      String(b?.url || "").trim(),
      String(b?.reaction || "").trim()
    );

    if (parsed.error) {
      return sendJson(
        res,
        {
          ok: false,
          message: parsed.error,
        },
        400
      );
    }

    /*
     * Cek apakah user adalah admin.
     */
    const adminResult =
      await requireAdmin(req);

    const isAdmin = adminResult.ok;

    /*
     * Identitas pengguna.
     */
    const identity = hashIdentity(
      getClientIp(req)
    );

    const day = new Date()
      .toISOString()
      .slice(0, 10);

    /*
     * Hitung bonus limit.
     */
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

    const bonus = Number(
      bonusRows?.[0]?.bonus || 0
    );

    const limit =
      BASE_LIMIT + bonus;

    /*
     * Pastikan row usage hari ini ada.
     */
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

    /*
     * User biasa menggunakan 1 quota.
     * Admin tidak mengurangi quota.
     */
    if (!isAdmin) {
      const claimed = await sql`
        UPDATE usage_daily
        SET
          used = used + 1,
          updated_at = NOW()
        WHERE ip_hash = ${identity}
          AND usage_date = ${day}
          AND used < limit_value
        RETURNING used, limit_value
      `;

      if (!claimed.length) {
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

    /*
     * Kirim reaction.
     */
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

        results.push(result);
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

    const ok = results.filter(
      (x) => x?.ok
    );

    const fail = results.filter(
      (x) => !x?.ok
    );

    /*
     * Semua berhasil.
     */
    if (
      ok.length === results.length
    ) {
      const message =
        results.length === 1
          ? "✅ Reaction berhasil!\n\nLihat postingan channel anda 🫡"
          : `✅ Semua ${results.length} reaction berhasil!\n\n${ok
              .map((x) => x.emoji)
              .join("  ")}\n\nLihat postingan channel anda 🫡`;

      return sendJson(res, {
        ok: true,
        message,
      });
    }

    /*
     * Semua gagal.
     */
    if (ok.length === 0) {
      return sendJson(
        res,
        {
          ok: false,
          message: `❌ Semua reaction gagal!\n\n${fail
            .map(
              (x) =>
                `${x.emoji} (${x.message})`
            )
            .join("\n")}`,
        },
        400
      );
    }

    /*
     * Sebagian berhasil.
     */
    return sendJson(
      res,
      {
        ok: false,
        partial: true,
        message: `⚠️ ${ok.length} dari ${results.length} reaction berhasil.\n\n✅ Berhasil: ${ok
          .map((x) => x.emoji)
          .join("  ")}\n❌ Gagal:\n${fail
          .map(
            (x) =>
              `${x.emoji} (${x.message})`
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
