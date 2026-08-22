const API_URL = "https://api.nexadev.my.id/api/rch";
const MAX_EMOJI = 5;

export function normalize(url, raw) {
  console.log("🔥 WA REACTION V3");
  console.log("🔥 TARGET URL:", url);

  let u;

  try {
    u = new URL(url);
  } catch {
    return {
      error: "URL target tidak valid.",
    };
  }

  if (!["http:", "https:"].includes(u.protocol)) {
    return {
      error: "URL target tidak valid.",
    };
  }

  const reactions = String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_EMOJI);

  if (!reactions.length) {
    return {
      error: "Tidak ada emoji valid yang ditemukan.",
    };
  }

  return {
    url: u.toString(),
    reactions,
  };
}

export async function sendReaction(url, emoji) {
  const key = process.env.REACTION_API_KEY || "";

  if (!key) {
    return {
      ok: false,
      emoji,
      message:
        "REACTION_API_KEY belum dikonfigurasi di server.",
    };
  }

  const q = new URLSearchParams({
    key,
    url,
    reaction: emoji,
  });

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, 55000);

  try {
    const response = await fetch(
      `${API_URL}?${q.toString()}`,
      {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "WA-Reaction/2.0",
        },
      }
    );

    const text = await response.text();

    if (!text) {
      return {
        ok: false,
        emoji,
        message:
          "API mengembalikan response kosong.",
      };
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        emoji,
        message:
          "Response API tidak valid (bukan JSON).",
      };
    }

    if (data?.result?.success === true) {
      return {
        ok: true,
        emoji,
        message: "Berhasil",
      };
    }

    return {
      ok: false,
      emoji,
      message:
        data?.result?.message ||
        data?.message ||
        `Gagal diproses (HTTP ${response.status}).`,
    };
  } catch (error) {
    return {
      ok: false,
      emoji,
      message:
        error?.name === "AbortError"
          ? "Request timeout."
          : `Request gagal: ${
              error?.message || "Unknown error"
            }`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export { MAX_EMOJI };
