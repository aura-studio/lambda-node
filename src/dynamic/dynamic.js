'use strict';

const fs = require('fs');
const path = require('path');
const dynamicNode = loadDynamicNode();
const { newOptions } = require('./options');
const { MetaGenerator } = require('./meta');
const { tunnelFromModule } = require('./tunnel');

class Dynamic {
  constructor(...opts) {
    this.options = newOptions(...opts);
    this.metaGenerator = new MetaGenerator();
    this._cache = new Map();
    this._httpHandlerCache = new Map();
    this._ready = this._init();
  }

  async _init() {
    const o = this.options;

    if (o.os) dynamicNode.toolchain.setOS(o.os);
    if (o.arch) dynamicNode.toolchain.setArch(o.arch);
    if (o.compiler) dynamicNode.toolchain.setCompiler(o.compiler);
    if (o.variant) dynamicNode.toolchain.setVariant(o.variant);

    if (o.localWarehouse || o.remoteWarehouse) {
      dynamicNode.useWarehouse(o.localWarehouse, o.remoteWarehouse);
    }

    if (o.packageNamespace) {
      dynamicNode.useNamespace(o.packageNamespace);
    }

    if (o.packageDefaultVersion) {
      dynamicNode.useDefaultVersion(o.packageDefaultVersion);
    }

    for (const p of o.staticPackages) {
      await dynamicNode.registerPackage(
        p.package,
        p.version,
        tunnelFromModule(p.handler, p.package, p.version)
      );
    }

    for (const p of o.preloadPackages) {
      dynamicNode.getPackage(p.package, p.version).catch((err) => {
        console.error(
          `[lambda] preload package ${o.packageNamespace}_${p.package}_${p.version} failed: ${err.message}`
        );
      });
    }
  }

  async getPackageModule(pkg, version) {
    return this.getPackage(pkg, version);
  }

  async getPackage(pkg, version) {
    await this._ready;

    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const tunnel = await dynamicNode.getPackage(pkg, ver);
    this._cache.set(key, tunnel);
    return tunnel;
  }

  async invokePackage(pkg, version, route, request) {
    const tunnel = await this.getPackage(pkg, version);
    return callTunnelInvoke(tunnel, route, request);
  }

  async metaPackage(pkg, version) {
    const tunnel = await this.getPackage(pkg, version);
    return callTunnelMeta(tunnel);
  }

  async getHTTPHandler(pkg, version) {
    await this._ready;

    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._httpHandlerCache.has(key)) {
      return this._httpHandlerCache.get(key);
    }

    const tunnel = await this.getPackage(pkg, ver);
    const handler = async (req, res, next) => {
      const result = await callTunnelInvoke(tunnel, '/ignored', { req, res, next });
      if (
        typeof result === 'string' &&
        !res.headersSent &&
        !res.writableEnded
      ) {
        throw new Error(`package ${pkg}@${ver} does not support native HTTP`);
      }
      return result;
    };

    this._httpHandlerCache.set(key, handler);
    return handler;
  }
}

async function callTunnelInvoke(tunnel, route, request) {
  if (typeof dynamicNode.callTunnelInvoke === 'function') {
    return dynamicNode.callTunnelInvoke(tunnel, route, request);
  }
  if (tunnel && typeof tunnel.invoke === 'function') {
    return tunnel.invoke(route, request);
  }
  if (tunnel && typeof tunnel.Invoke === 'function') {
    return tunnel.Invoke(route, request);
  }
  throw new TypeError('dynamic: symbol is not a Tunnel');
}

async function callTunnelMeta(tunnel) {
  if (typeof dynamicNode.callTunnelMeta === 'function') {
    return dynamicNode.callTunnelMeta(tunnel);
  }
  if (tunnel && typeof tunnel.meta === 'function') {
    return stringifyMeta(await tunnel.meta());
  }
  if (tunnel && typeof tunnel.Meta === 'function') {
    return stringifyMeta(await tunnel.Meta());
  }
  throw new TypeError('dynamic: symbol is not a Tunnel');
}

function stringifyMeta(meta) {
  if (meta == null) return '';
  return typeof meta === 'string' ? meta : JSON.stringify(meta);
}

function loadDynamicNode() {
  const localPath = path.resolve(__dirname, '../../../dynamic-node/src');
  if (fs.existsSync(path.join(localPath, 'index.js'))) {
    return require(localPath);
  }
  return require('@aura-studio/dynamic-node');
}

module.exports = {
  Dynamic,
};
