/**
 * Build-only prerender entry. `vinext build` calls this without Cloudflare
 * bindings to render the static export. The verified artifact replaces this
 * module with `static-worker.js`, so no application server ships.
 */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS?: Fetcher;
}

const worker = {
  async fetch(
    request: Request,
    env: Env | undefined,
    context: ExecutionContext,
  ): Promise<Response> {
    if (!env?.ASSETS) {
      return handler.fetch(request, env, context);
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) {
      return response;
    }
    const fallback = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(fallback, request));
  },
};

export default worker;
