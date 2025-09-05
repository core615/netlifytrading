exports.handler = async (event, context) => {
  const keys = [
    "REACT_APP_MARKETSTACK_KEY",
    "MARKETSTACK_KEY",
    "REACT_APP_API_KEY"
  ];
  const present = {};
  keys.forEach(k => {
    present[k] = process.env[k] ? true : false;
  });
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      message: "Env check",
      present,
      sample: {
        NODE_ENV: process.env.NODE_ENV || null,
        NETLIFY: process.env.NETLIFY || null,
        CONTEXT: process.env.CONTEXT || null
      }
    })
  };
};
