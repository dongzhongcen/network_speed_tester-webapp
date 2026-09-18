/** Latency probe for the speed tester. */
export async function onRequestGet(): Promise<Response> {
  return Response.json(
    { server_time: Date.now() / 1000 },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
