/**
 * Production entry: static assets only. There is no application, auth,
 * database, image-processing, or gameplay logic on the server.
 */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return env.ASSETS.fetch(
      new Request(new URL("/index.html", request.url), request),
    );
  },
};

export default worker;
