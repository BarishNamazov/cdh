const server = Bun.serve({
  port: Number(process.env.PORT ?? "3000"),
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Server listening on ${server.url}`);
