export function json(data, status = 200, extra = {}) {
  return {
    data,
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control":
        "no-store, no-cache, must-revalidate",
      ...extra
    }
  };
}

export function sendJson(res, data, status = 200, extra = {}) {
  res.statusCode = status;

  const headers = {
    "content-type":
      "application/json; charset=utf-8",
    "cache-control":
      "no-store, no-cache, must-revalidate",
    ...extra
  };

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  res.end(JSON.stringify(data));
}

export async function body(req) {
  // Jika body sudah diproses sebelumnya
  if (req.body !== undefined) {
    return req.body || {};
  }

  const contentType =
    req.headers?.["content-type"] || "";

  let raw = "";

  for await (const chunk of req) {
    raw += chunk.toString();
  }

  if (!raw) {
    return {};
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (
    contentType.includes(
      "application/x-www-form-urlencoded"
    )
  ) {
    return Object.fromEntries(
      new URLSearchParams(raw)
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(
      new URLSearchParams(raw)
    );
  }
}

export function method(req, allowed) {
  return allowed.includes(req.method);
}
