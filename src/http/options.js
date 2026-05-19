'use strict';

/**
 * LinkRule - a URL rewrite rule with optional method filter.
 * @typedef {{ dst: string, methods: string[] }} LinkRule
 */

/**
 * Default HTTP options.
 */
const defaultOptions = {
  address: ':8080',
  debugMode: false,
  corsMode: false,
  staticLinkMap: {},   // { srcPath: LinkRule }
  prefixLinkMap: {},   // { srcPrefix: LinkRule }
  pageNotFoundRules: [],
};

/**
 * Create a new HTTP Options from defaults + applied option functions.
 * @param {...Function} opts
 * @returns {object}
 */
function newOptions(...opts) {
  const options = JSON.parse(JSON.stringify(defaultOptions));
  for (const opt of opts) {
    if (opt) opt(options);
  }
  return options;
}

/**
 * Normalize a URL path.
 */
function normalizePath(p) {
  if (!p) return '/';
  p = p.replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  while (p.includes('//')) p = p.replace(/\/\//g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p;
}

/**
 * Check if a LinkRule matches a given HTTP method.
 * @param {LinkRule} rule
 * @param {string} method
 * @returns {boolean}
 */
function matchMethod(rule, method) {
  if (!rule.methods || rule.methods.length === 0) return true;
  const upper = method.toUpperCase();
  for (const m of rule.methods) {
    if (m.toUpperCase() === 'ALL' || m.toUpperCase() === upper) return true;
  }
  return false;
}

// -------------- HTTP Option functions ----------------

function withAddress(addr) {
  return (o) => { o.address = addr; };
}

function withDebugMode() {
  return (o) => { o.debugMode = true; };
}

function withCorsMode() {
  return (o) => { o.corsMode = true; };
}

function withStaticLink(srcPath, dstPath, ...methods) {
  return (o) => {
    o.staticLinkMap[normalizePath(srcPath)] = {
      dst: normalizePath(dstPath),
      methods,
    };
  };
}

function withPrefixLink(srcPrefix, dstPrefix, ...methods) {
  return (o) => {
    o.prefixLinkMap[normalizePath(srcPrefix)] = {
      dst: normalizePath(dstPrefix),
      methods,
    };
  };
}

function withPageNotFoundPath(path_, ...methods) {
  return (o) => {
    o.pageNotFoundRules.push({
      dst: normalizePath(path_),
      methods,
    });
  };
}

module.exports = {
  defaultOptions,
  newOptions,
  normalizePath,
  matchMethod,
  withAddress,
  withDebugMode,
  withCorsMode,
  withStaticLink,
  withPrefixLink,
  withPageNotFoundPath,
};
