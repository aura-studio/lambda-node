"use strict";

class UpperTunnel {
  async Init() {}

  async Invoke(route, request) {
    return JSON.stringify({
      meta: { handler: "upper", route },
      data: Buffer.from(JSON.stringify({ route, request })).toString("base64"),
    });
  }

  async Meta() {
    return JSON.stringify({
      name: "upper",
      version: "v1",
      kind: "uppercase-tunnel",
    });
  }

  async Close() {}
}

module.exports = new UpperTunnel();
