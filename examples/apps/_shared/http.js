'use strict';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function fetchText(url, opts) {
  const response = await fetch(url, opts);
  const text = await response.text();
  console.log(`HTTP ${response.status} ${url} -> ${text.slice(0, 160)}`);
  return { status: response.status, headers: response.headers, text };
}

module.exports = {
  listen,
  closeServer,
  fetchText,
};
