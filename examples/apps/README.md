# lambda-node standalone example apps

Four **independent** example projects — one per Lambda type. Each project:

- is fully self-contained: its own `package.json`, its own `node_modules`
  (`npm install` separately), its own `test.js`. No code is shared between
  projects and they do not import each other.
- owns its LocalStack lifecycle (distinct container name, port and bucket), so
  the projects never collide and can even run in parallel.
- builds its packages in **both** dynamic-node variants (**full** = `index.js`
  dir, **bundle** = single `bundle.js`), uploads them to **LocalStack S3**, then
  has `dynamic-node` download + load them at runtime and invokes through the
  matching `lambda-node` engine.

| Project | Type | LocalStack port | 4 cases |
|---------|------|-----------------|---------|
| `http/`    | HTTP    | 14566 | `api+full`, `wapi+full`, `api+bundle`, `wapi+bundle` |
| `reqresp/` | ReqResp | 14567 | `echo+full`, `sum+full`, `echo+bundle`, `sum+bundle` |
| `sqs/`     | SQS     | 14568 | `echo+full`, `sum+full`, `echo+bundle`, `sum+bundle` (each via SQS reply queue) |
| `event/`   | Event   | 14569 | `echo+full`, `notify+full`, `echo+bundle`, `notify+bundle` (verified via marker file) |

Only the **HTTP** type has a real `wapi` route, so it covers `api` + `wapi`.
The other three engines are envelope-only (no `/wapi`), so their 4 cases cover
two `api` routes × the two variants.

## Prerequisites

- Docker running.
- LocalStack **community** image `localstack/localstack:3` (the `:latest` tag is
  now a Pro build that needs a license token). Override via `LOCALSTACK_IMAGE`.

## Run a project

Each project is independent — install and test it on its own:

```bash
cd examples/apps/http      # or reqresp / sqs / event
npm install
npm test                   # starts its own LocalStack, runs its 4 cases, tears down
npm test -- --keep-up      # leave LocalStack running for inspection
```

`@aura-studio/lambda-node` is referenced as a local `file:` dependency, so
`npm install` links the framework from this repo (no publish needed).
