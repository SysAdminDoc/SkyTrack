export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Missing ?url=', { status: 400, headers: corsHeaders() });
    let parsed;
    try { parsed = new URL(target); } catch (_) {
      return new Response('Invalid target URL', { status: 400, headers: corsHeaders() });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return new Response('Only http(s) targets are allowed', { status: 400, headers: corsHeaders() });
    }
    const upstream = await fetch(parsed, { headers: { 'User-Agent': 'SkyTrack personal proxy' } });
    const headers = new Headers(upstream.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' };
}
