'use strict';

const dynamicNode = require('@aura-studio/dynamic-node');
const { newOptions } = require('./options');
const { MetaGenerator } = require('./meta');

class Dynamic {
  constructor(...opts) {
    this.options = newOptions(...opts);
    this.metaGenerator = new MetaGenerator();
    this._cache = new Map();
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

  async getPackage(pkg, version) {
    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const mod = await dynamicNode.getPackage(pkg, ver);

    let handler;
    if (typeof mod === 'function') {
      handler = mod;
    } else if (mod && typeof mod.default === 'function') {
      handler = mod.default;
    } else if (mod && typeof mod.handler === 'function') {
      handler = mod.handler;
    } else {
      throw new Error(
        `package ${pkg}@${ver} does not export a handler function`
      );
    }

    let metaFn = null;
    if (typeof mod.meta === 'function') {
      metaFn = mod.meta;
    } else if (mod && typeof mod.meta === 'string') {
      metaFn = () => mod.meta;
    }

    const tunnel = {
      invoke(route, req) {
        let reqObj;
        try {
          reqObj = JSON.parse(req);
        } catch (_) {
          reqObj = { meta: {}, data: '' };
        }

        const resObj = { meta: {}, data: '' };

        try {
          handler(reqObj, resObj);
        } catch (err) {
          resObj.meta.Error = err.message || String(err);
        }

        return JSON.stringify(resObj);
      },

      meta() {
        if (metaFn) {
          try {
            const result = metaFn();
            return typeof result === 'string' ? result : JSON.stringify(result);
          } catch (_) {
            return '';
          }
        }
        return '';
      },
    };

    this._cache.set(key, tunnel);
    return tunnel;
  }
}

module.exports = {
  Dynamic,
};