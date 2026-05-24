# lambda-node standalone example apps

This directory contains four independent app projects, one for each lambda-node mode:

| Project | Mode | LocalStack port | Local Lambda port | Cases |
| --- | --- | ---: | ---: | --- |
| `http/` | HTTP | 14566 | 19066 | `api+wapi x full+bundle` |
| `reqresp/` | ReqResp | 14567 | 19067 | `echo+sum x full+bundle` |
| `sqs/` | SQS | 14568 | 19068 | `echo+sum x full+bundle`, with an SQS reply queue |
| `event/` | Event | 14569 | 19069 | `echo+notify x full+bundle`, verified by marker files |

Each project owns its own `package.json`, `node_modules`, LocalStack container, bucket, queues, dynamic packages, Dockerfile, SAM template, and lambda YAML config.

The dynamically loaded packages intentionally do not hand-write the Tunnel interface:

- `/api` packages export `service.new(app)` from `@aura-studio/service-node`.
- `/wapi` packages export `wire.new(app)` from `@aura-studio/wire-node`.
- Dynamic package meta is not defined in the app package. The shared test
  harness builds each package through the sibling `dynamic-node-cli` Builder
  before uploading to LocalStack S3, so `Meta()` comes from the generated
  dynamic-node wrapper and uses the Go-aligned `dynamic/toolchain` schema.

## Layout

Each app uses the same structure:

```text
examples/apps/<app>/
  config/lambda.yaml      # Lambda/dynamic config shape for the container example
  Dockerfile              # AWS Lambda container image
  template.yaml           # SAM image template
  packages/               # dynamic-node packages uploaded to LocalStack S3
  src/config.js           # executable test config
  src/cases.js            # local in-process engine cases
  src/bootstrap.js        # Lambda container handler
  src/docker-cases.js     # invoke the Lambda runtime container
  test.js                 # orchestration: LocalStack, upload, local cases, optional Docker Lambda
```

The shared helper code lives in `examples/apps/_shared/` so the app examples stay small while still showing the moving parts clearly.

## Local engine flow

```bash
cd examples/apps/http
npm install
npm test
```

`npm test` starts that app's LocalStack container, builds the dynamic packages
with `dynamic-node-cli`, uploads the generated `libnode_*.zip` artifacts to S3,
invokes the local lambda-node engine, prints the HTTP or decoded response bodies
plus each package's build meta, and stops LocalStack.

Use `--keep-up` to leave LocalStack running:

```bash
npm test -- --keep-up
```

## Dockerfile Lambda flow

```bash
cd examples/apps/http
npm test -- --docker-lambda
```

The Docker flow adds these steps after the local engine cases:

1. Build the app's `Dockerfile` from the `lambda-node` repo root.
2. Start the AWS Lambda Runtime Interface Emulator container on the app's local Lambda port.
3. Invoke `src/bootstrap.handler` through `/2015-03-31/functions/function/invocations`.
4. Assert real response bodies. For SQS, the response is also verified through the LocalStack reply queue.

The Docker image talks back to LocalStack through `host.docker.internal:<LocalStack port>`.
The Docker build context is the `aura-studio` workspace root so the image can use the sibling local packages `dynamic-node`, `service-node`, `wire-node`, and `tunnel-node` instead of pulling them from GitHub.

## SAM files

Each app has a `template.yaml` equivalent to the Dockerfile flow:

```bash
cd examples/apps/http
sam build
sam local invoke HttpFunction --event events/api-full.json
```

The examples do not require SAM for automated testing; SAM is included so the same Docker image layout can be inspected or adapted to AWS deployment.
