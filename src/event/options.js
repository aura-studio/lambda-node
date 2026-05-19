'use strict';

const defaultOptions = {
  debugMode: false,
};

function newOptions(...opts) {
  const options = JSON.parse(JSON.stringify(defaultOptions));
  for (const opt of opts) {
    if (opt) opt(options);
  }
  return options;
}

function withDebugMode(debug) {
  return (o) => { o.debugMode = !!debug; };
}

module.exports = {
  defaultOptions,
  newOptions,
  withDebugMode,
};
