interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  API_ORIGIN?: string
}

const json = (status: number, detail: string) =>
  new Response(JSON.stringify({ detail }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export default {
  // Agendamento (wrangler.jsonc): mantém a API do Render acordada. Só faz GET em /health, não grava nada.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    if (!env.API_ORIGIN) return
    ctx.waitUntil(fetch(new URL('/api/v1/health', env.API_ORIGIN).toString(), { headers: { 'User-Agent': 'terraturn-keepalive' } }).catch(() => undefined))
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!env.API_ORIGIN) return json(503, 'The TerraTurn server is not available yet. Please try again later.')
    const target = new URL(url.pathname + url.search, env.API_ORIGIN)
    const headers = new Headers(request.headers)
    headers.set('X-Forwarded-Host', url.host)
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))
    try {
      return await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      })
    } catch {
      return json(502, 'Cannot reach the TerraTurn server. Please try again in a moment.')
    }
  },
}
