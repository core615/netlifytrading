exports.handler = async (event, context) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const endpoint = (params.get("endpoint") || "eod").replace(/^\//, "");
    params.delete("endpoint");

    // Find API key from any of these env vars
    const access_key = process.env.REACT_APP_MARKETSTACK_KEY 
                    || process.env.MARKETSTACK_KEY 
                    || process.env.REACT_APP_API_KEY;
    console.log('API Key source:', process.env.REACT_APP_MARKETSTACK_KEY ? 'REACT_APP_MARKETSTACK_KEY' : 
                process.env.MARKETSTACK_KEY ? 'MARKETSTACK_KEY' : 
                process.env.REACT_APP_API_KEY ? 'REACT_APP_API_KEY' : 'None');

    if (!access_key) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing Marketstack key in env (REACT_APP_MARKETSTACK_KEY or MARKETSTACK_KEY)" })
      };
    }

    params.set("access_key", access_key);

    const base = `https://api.marketstack.com/v2/${endpoint}`;
    const fullUrl = `${base}?${params.toString()}`;

    const fetchHttps = (url) => new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => data += chunk);
        res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }).on("error", reject);
    });

    const upstream = await fetchHttps(fullUrl);

    console.log('Upstream response:', { statusCode: upstream.statusCode, body: upstream.body.substring(0, 100) + (upstream.body.length > 100 ? '...' : '') });

    return {
      statusCode: upstream.statusCode || 200,
      headers: {
        "content-type": upstream.headers["content-type"] || "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS"
      },
      body: upstream.body
    };
  } catch (err) {
    console.error('Proxy error:', err.message);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      body: JSON.stringify({ ok: false, error: err.message || String(err) })
    };
  }
};
