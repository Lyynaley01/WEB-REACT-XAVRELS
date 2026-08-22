export function json(data, status=200, extra={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store, no-cache, must-revalidate", ...extra}
  });
}
export async function body(req) {
  const type=req.headers.get("content-type")||"";
  if(type.includes("application/json")) return await req.json();
  const text=await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}
export function method(req, allowed) {
  return allowed.includes(req.method);
}
