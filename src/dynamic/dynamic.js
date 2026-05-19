'use strict';

const path = require('path');
const { newOptions } = require('./options');
const { MetaGenerator } = require('./meta');

/**
 * Dynamic - dynamic package loader for Node.js.
 *
 * In the Go version, packages are .so dynamic libraries loaded via
 * the `aura-studio/dynamic` tunnel system. In Node.js, packages are
 * local modules loaded via require(). Each package exports a handler
 * function: (req, res) => { ... }
 *
 * The basePath config sets the root directory for package resolution.
 * Package `example@v1` resolves to `{basePath}/{namespace}_{example}_{v1}/`
 * or `{basePath}/{example}/{v1}/` depending on layout.
 */
class Dynamic {
  /**
   * @param {...Function} opts - option functions
   */
  constructor(...opts) {
    this.options = newOptions(...opts);
    this.metaGenerator = new MetaGenerator();
    this._cache = new Map(); // cache loaded packages: "pkg:version" -> handler

    this._installPackages();
  }

  /**
   * Install packages based on configuration.
   * Registers static packages and preloads configured ones.
   */
  _installPackages() {
    // Register static packages (pre-bundled handlers)
    for (const p of this.options.staticPackages) {
      const key = `${p.package}:${p.version}`;
      this._cache.set(key, p.handler);
    }

    // Preload packages
    for (const p of this.options.preloadPackages) {
      try {
        this.getPackage(p.package, p.version);
      } catch (err) {
        console.error(
          `[lambda] preload package ${this.options.packageNamespace}_${p.package}_${p.version} failed: ${err.message}`
        );
      }
    }
  }

  /**
   * Resolve the filesystem path for a package.
   *
   * Search order:
   *   1. {basePath}/{package}/{version}/
   *   2. {basePath}/{namespace}_{package}_{version}/
   *   3. {basePath}/{package}/
   *
   * @param {string} pkg
   * @param {string} version
   * @returns {string} absolute path
   */
  _resolvePackagePath(pkg, version) {
    const base = this.options.basePath
      ? path.resolve(process.cwd(), this.options.basePath)
      : process.cwd();

    const ver = version || this.options.packageDefaultVersion || '';
    const ns = this.options.packageNamespace;

    // Candidate paths
    const candidates = [];

    if (ver) {
      // {basePath}/{package}/{version}
      candidates.push(path.join(base, pkg, ver));
    }
    if (ns && ver) {
      // {basePath}/{namespace}_{package}_{version}
      candidates.push(path.join(base, `${ns}_${pkg}_${ver}`));
    }
    // {basePath}/{package}
    candidates.push(path.join(base, pkg));

    for (const candidate of candidates) {
      try {
        // Try to resolve the module. require.resolve will throw if not found.
        require.resolve(candidate);
        return candidate;
      } catch (_) {
        // Continue to next candidate
      }
    }

    throw new Error(
      `package not found: ${pkg}@${ver} (searched in ${base})`
    );
  }

  /**
   * Get a package handler by name and version.
   * Returns the handler function exported by the package.
   *
   * The loaded module must export a function: (req, res) => { ... }
   * or { default: (req, res) => { ... } }
   *
   * @param {string} pkg - package name
   * @param {string} version - package version
   * @returns {{ invoke: Function, meta: Function }}
   */
  getPackage(pkg, version) {
    const ver = version || this.options.packageDefaultVersion || '';
    const key = `${pkg}:${ver}`;

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const modulePath = this._resolvePackagePath(pkg, ver);
    const mod = require(modulePath);

    // Extract handler: support default export or direct function export
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

    // Extract optional meta function
    let metaFn = null;
    if (typeof mod.meta === 'function') {
      metaFn = mod.meta;
    } else if (mod && typeof mod.meta === 'string') {
      metaFn = () => mod.meta;
    }

    // Create a tunnel-like object matching the Go Tunnel interface
    const tunnel = {
      /**
       * Invoke the package handler.
       * @param {string} route - the route path within the package
       * @param {string} req - JSON string (envelope format)
       * @returns {string} JSON string response
       */
      invoke(route, req) {
        // Build request/response envelope objects
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

      /**
       * Get package meta information.
       * @returns {string} JSON string
       */
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
