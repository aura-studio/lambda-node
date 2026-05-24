# lambda-node standalone example apps

This directory contains four independent app projects, one for each lambda-node mode:

| Project | Mode | LocalStack port | Local Lambda port | Cases |
| --- | --- | ---: | ---: | --- |
| `http/` | HTTP | 14566 | 19066 | `api+wapi x full+bundle` |
| `reqresp/` | ReqResp | 14567 | 19067 | `echo+sum x full+bundle` |
| `sqs/` | SQS | 14568 | 19068 | `echo+sum x full+bundle`, with an SQS reply queue |
| `event/` | Event | 14569 | 19069 | `echo+notify x full+bundle`, verified by marker files |

Each project is split like the production `scp-lambda` / `scp-api` shape:

- `lambda/` is the Lambda host project. It owns `package.json`, `node_modules`, Dockerfile, SAM template, runtime config, bootstrap code, and the executable tests.
- `api/` is the dynamic package project. It owns `dynamic-cli.yaml`, the module version, and the `packages/` tree that is built and uploaded to S3.

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
  api/
    dynamic-cli.yaml      # Go dynamic-cli-compatible build/push config
    package.json          # module/version source for dynamic-node-cli build meta
    packages/             # service-node / wire-node packages uploaded to LocalStack S3
  lambda/
    config/lambda.yaml    # Go server.yml-compatible Lambda/dynamic config
    Dockerfile            # AWS Lambda container image
    template.yaml         # SAM image template
    events/               # SAM/local invoke sample events
    src/config.js         # executable test config
    src/cases.js          # local in-process engine cases
    src/bootstrap.js      # Lambda container handler
    src/docker-cases.js   # invoke the Lambda runtime container
    test.js               # orchestration: LocalStack, upload, local cases, optional Docker Lambda
```

The shared helper code lives in `examples/apps/_shared/` so the app examples stay small while still showing the moving parts clearly.

`lambda/config/lambda.yaml` intentionally follows the Go `lambda/server.yml`
shape: top-level `lambda`, mode-specific `http` / `reqresp` / `sqs` / `event`,
and `dynamic.environment` plus `dynamic.package`. Example-only values such as
queue names, local ports, and test case routes stay in `lambda/src/config.js`
instead of being added to `lambda.yaml`.

`api/dynamic-cli.yaml` follows the Go `dynamic-cli.yaml` shape and uses
`procedures` to describe each full or bundle package. The Node CLI accepts this
file name directly, so manual build commands can be run from the `api/` project.

## Local engine flow

```bash
cd examples/apps/http/lambda
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
cd examples/apps/http/lambda
npm test -- --docker-lambda
```

The Docker flow adds these steps after the local engine cases:

1. Build the app's `Dockerfile` from the `lambda-node` repo root.
2. Start the AWS Lambda Runtime Interface Emulator container on the app's local Lambda port.
3. Invoke `src/bootstrap.handler` through `/2015-03-31/functions/function/invocations`.
4. Assert real response bodies. For SQS, the response is also verified through the LocalStack reply queue.

The Docker image talks back to LocalStack through `host.docker.internal:<LocalStack port>`.
The Docker build context is the `aura-studio` workspace root so the image can use the sibling local packages `dynamic-node`, `service-node`, `wire-node`, and `tunnel-node` instead of pulling them from GitHub.

## Dynamic Package Flow

```bash
cd examples/apps/http/api
dynamic-node build -c dynamic-cli.yaml
dynamic-node push -c dynamic-cli.yaml
```

The automated example tests invoke the same dynamic-node-cli Builder directly
so they can inject the local warehouse path and LocalStack S3 endpoint, but the
checked-in `dynamic-cli.yaml` is kept in sync and validated on every app test.

## SAM files

Each app has a `template.yaml` equivalent to the Dockerfile flow:

```bash
cd examples/apps/http/lambda
sam build
sam local invoke HttpFunction --event events/apifull.json
```

The examples do not require SAM for automated testing; SAM is included so the same Docker image layout can be inspected or adapted to AWS deployment.
