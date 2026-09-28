export const prerender = false;

import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params }) => {
  const pollId = params.id || "general";

  // Real-time edge dynamic data (could read from KV, D1, or external service)
  return new Response(
    JSON.stringify({
      pollId,
      count: 128,
      status: "open",
      updatedAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=60, max-age=10",
      },
    }
  );
};
