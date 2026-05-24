"use strict";

const calls = [];

async function handler(req, res) {
  const route = req.meta?.route || req.meta?.Path || "";
  const payload = decodeJSON(req.data);

  calls.push({
    route,
    payload,
    meta: req.meta || {},
  });

  if (route === "/error") {
    throw new Error("example envelope failure");
  }

  if (route === "/meta-error") {
    res.meta = { Error: "example response meta failure" };
    res.data = "";
    return;
  }

  if (route === "/plain") {
    res.meta = { ContentType: "text/plain", Status: 201 };
    res.data = encodeText(`plain:${payload.name || payload.message || "anonymous"}`);
    return;
  }

  if (route === "/state") {
    res.meta = { handler: "state" };
    res.data = encodeJSON({
      count: calls.length,
      last: calls[calls.length - 1],
    });
    return;
  }

  res.meta = {
    handler: "envelope",
    route,
    requestPath: req.meta?.Path || "",
  };
  res.data = encodeJSON({
    message: `hello ${payload.name || payload.message || "world"}`,
    route,
    received: payload,
    meta: req.meta || {},
  });
}

handler.meta = () => ({
  name: "envelope",
  version: "v1",
  kind: "lambda-node-example",
  routes: ["/echo", "/plain", "/state", "/error", "/meta-error"],
});
handler.calls = calls;

function decodeJSON(data) {
  const text = Buffer.from(data || "", "base64").toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text };
  }
}

function encodeJSON(value) {
  return encodeText(JSON.stringify(value));
}

function encodeText(value) {
  return Buffer.from(String(value)).toString("base64");
}

module.exports = handler;
module.exports.meta = handler.meta;
module.exports.calls = calls;
