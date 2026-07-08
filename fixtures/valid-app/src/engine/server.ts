const server = Bun.serve({
  port: Number(process.env.PORT ?? "3000"),
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/request-label" && request.method === "POST") {
      return Response.json({ requested: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`fixture server listening on ${server.url}`);
