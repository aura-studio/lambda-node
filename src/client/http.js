'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * HTTP Client - mirrors Go http/client/client.go.
 */
class HttpClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseURL
   * @param {object} [opts.headers={}]
   * @param {number} [opts.timeout=30000] - default timeout in ms
   */
  constructor(opts = {}) {
    this.baseURL = opts.baseURL || '';
    this.headers = opts.headers || {};
    this.timeout = opts.timeout || 30000;
  }

  /**
   * @param {string} path
   * @returns {Promise<{ statusCode: number, headers: object, body: Buffer }>}
   */
  async get(path) {
    return this.do('GET', path, null);
  }

  /**
   * @param {string} path
   * @param {Buffer|string} body
   * @returns {Promise<{ statusCode: number, headers: object, body: Buffer }>}
   */
  async post(path, body) {
    return this.do('POST', path, body);
  }

  async put(path, body) {
    return this.do('PUT', path, body);
  }

  async delete(path) {
    return this.do('DELETE', path, null);
  }

  /**
   * Send a generic HTTP request.
   * @param {string} method
   * @param {string} path
   * @param {Buffer|string|null} body
   * @param {object} [extraHeaders={}]
   * @returns {Promise<{ statusCode: number, headers: object, body: Buffer }>}
   */
  do(method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const reqHeaders = { ...this.headers, ...extraHeaders };
      if (body && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }

      const opts = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: reqHeaders,
        timeout: this.timeout,
      };

      const req = lib.request(opts, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('request timeout'));
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}

module.exports = { HttpClient };
