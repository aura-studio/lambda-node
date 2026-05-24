# lambda-node examples

These examples are split into independent Node.js scripts so each Lambda mode can be tested by hand on Windows, macOS, or Linux.

```bash
node examples/scripts/01-smoke.js
node examples/scripts/02-dynamic.js
node examples/scripts/03-http-api.js
node examples/scripts/04-http-wapi.js
node examples/scripts/05-reqresp.js
node examples/scripts/06-event.js
node examples/scripts/07-sqs.js
node examples/scripts/08-server.js
node examples/scripts/09-clients.js
node examples/scripts/99-run-all-local.js
node examples/scripts/test-ui.js
```

The Web UI prints the exact script output and is useful for stepping through one case at a time.

```bash
node examples/scripts/test-ui.js   # then open http://127.0.0.1:3461
```

## LocalStack end-to-end (item 3)

These steps exercise the **full pipeline** for every mode: a per-mode package is
built into a `libnode_<name>.zip`, uploaded to **LocalStack S3**, then downloaded
+ extracted + loaded by `dynamic-node` at runtime and invoked through the
matching `lambda-node` engine. The SQS step additionally round-trips a reply
through **LocalStack SQS**, and the Event step proves execution via a marker file.

Coverage includes both HTTP entrypoints (**`/api`** envelope and **`/wapi`**
native handler) and both dynamic-node load variants (**generic** = `index.js`
dir, and **bundle** = single `bundle.js`).

Each mode has its own test project under `examples/e2e/packages/`:

| Mode      | Package project                      | Variant | What it verifies |
|-----------|--------------------------------------|---------|------------------|
| HTTP api  | `examples/e2e/packages/http-app`     | generic | S3 download → `/api` invoke + `/meta` |
| HTTP wapi | `examples/e2e/packages/wapi-app`     | generic | S3 download → `/wapi` **native HTTP handler** |
| ReqResp   | `examples/e2e/packages/reqresp-app`  | generic | S3 download → Lambda RequestResponse invoke |
| SQS       | `examples/e2e/packages/sqs-app`      | generic | S3 download → invoke → **SQS reply queue** |
| Event     | `examples/e2e/packages/event-app`    | generic | S3 download → fire-and-forget (marker file) |
| Bundle    | `examples/e2e/packages/bundle-app`   | bundle  | S3 download → loads **`bundle.js`** → `/api` invoke |

**Prerequisites:** Docker running. The suite pins the LocalStack **community**
image `localstack/localstack:3` (the `:latest` tag is now a Pro build that needs
a license token). Override with `LOCALSTACK_IMAGE` if needed.

Run step-by-step (each step is independent and idempotently starts LocalStack):

```bash
node examples/scripts/10-localstack-up.js      # start LocalStack (S3+SQS) + upload 6 packages
node examples/scripts/11-e2e-http.js           # HTTP /api mode e2e
node examples/scripts/12-e2e-http-wapi.js      # HTTP /wapi native-handler e2e
node examples/scripts/13-e2e-reqresp.js        # ReqResp mode e2e
node examples/scripts/14-e2e-sqs.js            # SQS mode e2e (S3 + SQS reply)
node examples/scripts/15-e2e-event.js          # Event mode e2e
node examples/scripts/16-e2e-bundle.js         # bundle-variant load path e2e
node examples/scripts/17-localstack-down.js    # stop LocalStack + clean workspace
node examples/scripts/98-run-all-e2e.js        # full cycle: up → 6 modes → down
```

Or drive them from the Web UI (grouped under "LocalStack e2e (Docker)"):

```bash
node examples/scripts/test-ui.js
```
