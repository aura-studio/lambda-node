'use strict';

const dynamicNode = require('@aura-studio/dynamic-node');
const { newOptions } = require('./options');
const { MetaGenerator } = require('./meta');
const {
  EnvelopeTunnel,
  envelopeHandlerFromModule,
  metaFromModule,
  nativeHTTPHandlerFromModule,
} = require('./tunnel');

class Dynamic {
  constructor(...opts) {
    this.options = newOptions(...opts);
    this.metaGenerator = new MetaGenerator();
    this._cache = new Map();
    this._moduleCache = new Map();
    this._httpHandlerCache = new Map();
    this._init();
  }

  _init() {
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
      dynamicNode.registerPackage(p.package, p.version, p.handler);
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
    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._moduleCache.has(key)) {
      return this._moduleCache.get(key);
    }

    const mod = await dynamicNode.getPackage(pkg, ver);
    this._moduleCache.set(key, mod);
    return mod;
  }

  async getPackage(pkg, version) {
    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const mod = await this.getPackageModule(pkg, ver);
    const tunnel = new EnvelopeTunnel(
      envelopeHandlerFromModule(mod, pkg, ver),
      metaFromModule(mod)
    );

    this._cache.set(key, tunnel);
    return tunnel;
  }

  async getHTTPHandler(pkg, version) {
    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._httpHandlerCache.has(key)) {
      return this._httpHandlerCache.get(key);
    }

    const mod = await this.getPackageModule(pkg, ver);
    const handler = nativeHTTPHandlerFromModule(mod, pkg, ver);
    this._httpHandlerCache.set(key, handler);
    return handler;
  }
}

module.exports = {
  Dynamic,
};
