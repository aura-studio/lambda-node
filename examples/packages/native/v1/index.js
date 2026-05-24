"use strict";

async function app(req, res) {
  const body = await readBody(req);
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({
    message: "hello native",
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl || "",
    body,
    target: req.headers["x-example-target"] || "",
    hasOriginalPath: Boolean(req.headers["x-original-path"]),
  }));
}

app.meta = () => ({
  name: "native",
  version: "v1",
  kind: "native-http",
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

module.exports = app;
module.exports.meta = app.meta;
