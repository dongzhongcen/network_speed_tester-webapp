/** Accept binary body for upload speed testing. */

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  const buf = await context.request.arrayBuffer();
  return Response.json(
    {
      received_bytes: buf.byteLength,
      server_time: Date.now() / 1000,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
