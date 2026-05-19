'use strict';

/**
 * Top-level server options, holding sub-option arrays for each module.
 * Mirrors Go server.Options struct.
 */
const defaultOptions = {
  lambda: '',        // "http" | "sqs" | "reqresp" | "event"
  http: [],          // http option functions
  sqs: [],           // sqs option functions
  reqresp: [],       // reqresp option functions
  event: [],         // event option functions
  dynamic: [],       // dynamic option functions
};

function newOptions(...opts) {
  const options = {
    lambda: '',
    http: [],
    sqs: [],
    reqresp: [],
    event: [],
    dynamic: [],
  };
  for (const opt of opts) {
    if (opt) opt(options);
  }
  return options;
}

// -------------- Server Option functions ----------------

function withLambdaType(lambdaType) {
  return (o) => { o.lambda = lambdaType; };
}

function withHttpOptions(...opts) {
  return (o) => { o.http.push(...opts); };
}

function withSqsOptions(...opts) {
  return (o) => { o.sqs.push(...opts); };
}

function withReqRespOptions(...opts) {
  return (o) => { o.reqresp.push(...opts); };
}

function withEventOptions(...opts) {
  return (o) => { o.event.push(...opts); };
}

function withDynamicOptions(...opts) {
  return (o) => { o.dynamic.push(...opts); };
}

module.exports = {
  defaultOptions,
  newOptions,
  withLambdaType,
  withHttpOptions,
  withSqsOptions,
  withReqRespOptions,
  withEventOptions,
  withDynamicOptions,
};
