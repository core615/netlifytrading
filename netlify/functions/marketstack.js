/* netlify/functions/marketstack.js (Enhanced V2 with Debugging) */
const BASE = 'https://api.marketstack.com/v2';

exports.handler = async (event) => {
  const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'access-control-allow-origin': ALLOW_ORIGIN,
        'access-control-allow-methods': 'GET,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'cache-control': 'max-age=86400',
      },
      body: '',
    };
  }

  const DEBUG = /^true$/i.test(process.env.DEBUG || '');
  const start = Date.now();
  const request_id = `${start}-${Math.random().toString(36).slice(2, 8)}`;

  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOW_ORIGIN,
  };

  const fail = (status, message, extra = {}) => {
    const body = { error: { message, request_id, ...extra } };
    DEBUG && console.error('[marketstack]', status, body);
    return { statusCode: status, headers, body: JSON.stringify(body) };
  };

  try {
    if (event.httpMethod !== 'GET') return fail(405, 'Method not allowed. Use GET.');
    const qs = event.queryStringParameters || {};

    if (qs.test === '1') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, message: 'Function alive', request_id }),
      };
    }

    const access_key = process.env.MARKETSTACK_KEY;
    if (!access_key) return fail(500, 'Missing MARKETSTACK_KEY environment variable.');

    const rawEndpoint = (qs.endpoint || 'eod/latest').trim();
    const endpoint = rawEndpoint.replace(/[^a-zA-Z0-9_\/-]/g, '');
    if (!endpoint) return fail(400, 'Invalid endpoint.');
    delete qs.endpoint;

    const autoFallback = qs.autoFallback !== '0';
    delete qs.autoFallback;

    const noCache = qs.noCache === '1';
    delete qs.noCache;
    const DEFAULT_CACHE_SMAXAGE = Number(process.env.DEFAULT_CACHE_SMAXAGE || 30);
    headers['cache-control'] = (!noCache && DEFAULT_CACHE_SMAXAGE > 0)
      ? `public, s-maxage=${DEFAULT_CACHE_SMAXAGE}, stale-while-revalidate=30`
      : 'no-store';

    const params = new URLSearchParams({ access_key, ...qs });
    const url = `${BASE}/${endpoint}?${params.toString()}`;

    const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 9000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const text = await upstream.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }

    if (autoFallback && /intraday\/latest$/.test(endpoint) &&
        upstream.status >= 400 && json?.error?.code === 'function_access_restricted') {
      const fbUrl = `${BASE}/eod/latest?${new URLSearchParams({ access_key, ...qs }).toString()}`;
      const fbResp = await fetch(fbUrl);
      const fbText = await fbResp.text();
      let fbJson; try { fbJson = JSON.parse(fbText); } catch { fbJson = fbText; }
      if (fbResp.ok) {
        return { statusCode: 200, headers, body: JSON.stringify({ data: fbJson.data ?? fbJson, meta: { request_id, endpoint, fell_back_from: endpoint } }) };
      }
      return fail(fbResp.status, 'Fallback to eod/latest also failed.', { endpoint, fb_error: fbJson });
    }

    if (!upstream.ok) {
      return fail(upstream.status, 'Upstream API error.', { endpoint, upstream_status: upstream.status, upstream_error: json });
    }

    const body = DEBUG
      ? { data: json.data ?? json, meta: { request_id, endpoint, time_ms: Date.now() - start } }
      : json;
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  } catch (err) {
    const isAbort = /aborted|AbortError/i.test(String(err));
    return fail(504, isAbort ? 'Upstream request timed out.' : 'Unhandled server error.', { detail: String(err) });
  }
};

function hintFromError(json) {
  try {
    const code = json?.error?.code;
    const msg = (json?.error?.message || '').toLowerCase();
    if (code === 'missing_access_key' || /access[_ ]key/.test(msg)) return 'Set MARKETSTACK_KEY in Netlify env vars.';
    if (code === 'function_access_restricted') return 'Plan does not include intraday. Use eod or upgrade.';
    if (code === 'invalid_api_function') return 'Check endpoint. Example: eod/latest or intraday/latest.';
    if (/usage|limit|quota/.test(msg)) return 'Monthly request limit may be reached.';
    return undefined;
  } catch { return undefined; }
}
