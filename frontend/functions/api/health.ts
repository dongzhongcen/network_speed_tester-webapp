export async function onRequestGet(): Promise<Response> {
  return Response.json({ status: "ok", runtime: "cloudflare-pages" });
}
