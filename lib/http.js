export function json(data, status = 200, extra = {}) {
  return {
    data,
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      ...extra,
    },
  };
}

export function sendJson(res, data, status = 200, extra = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate",
    ...extra,
  };

  res.statusCode = status;

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  res.end(JSON.stringify(data));
}

export async function body(req) {
  // Beberapa environment/framework mungkin sudah mem-parsing body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "object") {
      return req.body;
    }

    if (typeof req.body === "string") {
      return parseBodyString(
        req.body,
        req.headers?.["content-type"] || ""
      );
    }
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

  return parseBodyString(raw, contentType);
}

function parseBodyString(raw, contentType = "") {
  if (
    contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  if (
    contentType
      .toLowerCase()
      .includes(
        "application/x-www-form-urlencoded"
      )
  ) {
    return Object.fromEntries(
      new URLSearchParams(raw)
    );
  }

  // Fallback: coba JSON dulu
  try {
    return JSON.parse(raw);
  } catch {}

  // Fallback: coba form-urlencoded
  try {
    return Object.fromEntries(
      new URLSearchParams(raw)
    );
  } catch {
    return {};
  }
}

export function method(req, allowed) {
  return allowed.includes(req.method);
}
