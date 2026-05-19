# lambda-node 需求文档

## 1. 项目概述

参考 [github.com/aura-studio/lambda](https://github.com/aura-studio/lambda)（Go 语言实现），编写 Node.js/TypeScript 版本的多模式 Lambda 框架，支持 HTTP、SQS、Event、ReqResp 四种运行模式，并通过 `dynamic-node` 实现包（package）的动态加载与调用。

## 2. 项目结构

```
lambda-node/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # 入口：导出 server.Serve()
│   ├── server/
│   │   ├── server.ts            # Serve() 统一调度入口
│   │   ├── config.ts            # 统一配置文件解析（lambda.yml）
│   │   └── options.ts           # 顶层 Options + Option 函数
│   ├── dynamic/
│   │   ├── dynamic.ts           # Dynamic 类：InstallPackages, GetPackage
│   │   ├── config.ts            # dynamic.yml 配置解析
│   │   ├── options.ts           # Dynamic Options + Option 函数
│   │   ├── default_config.ts    # 自动发现 dynamic.yml
│   │   └── meta.ts              # MetaGenerator 服务元数据
│   ├── http/
│   │   ├── engine.ts            # Engine 类（Options + Express + Dynamic）
│   │   ├── config.ts            # http.yml 配置解析
│   │   ├── options.ts           # HTTPOptions + Option 函数 + LinkRule
│   │   ├── default_config.ts    # 自动发现 http.yml
│   │   ├── handlers.ts          # 路由处理器（API, WAPI, Meta, debug）
│   │   └── cors.ts              # CORS 中间件
│   ├── reqresp/
│   │   ├── engine.ts            # Engine 类（Options + Router + Dynamic）
│   │   ├── config.ts            # reqresp.yml 配置解析
│   │   ├── options.ts           # Options + Option 函数
│   │   ├── default_config.ts    # 自动发现 reqresp.yml
│   │   ├── handlers.ts          # 路由处理器
│   │   └── router.ts            # 自定义 Router + Context
│   ├── sqs/
│   │   ├── engine.ts            # Engine 类（Options + Router + Dynamic）
│   │   ├── config.ts            # sqs.yml 配置解析
│   │   ├── options.ts           # Options + Option 函数 + RunMode 枚举
│   │   ├── default_config.ts    # 自动发现 sqs.yml
│   │   ├── handlers.ts          # 路由处理器
│   │   └── router.ts            # 自定义 Router + Context
│   ├── event/
│   │   ├── engine.ts            # Engine 类（Options + Router + Dynamic）
│   │   ├── config.ts            # event.yml 配置解析
│   │   ├── options.ts           # Options + Option 函数
│   │   ├── default_config.ts    # 自动发现 event.yml
│   │   ├── handlers.ts          # 路由处理器
│   │   └── router.ts            # 自定义 Router + Context
│   ├── client/
│   │   ├── index.ts             # 客户端统一导出
│   │   ├── http.ts              # HTTP 客户端
│   │   ├── reqresp.ts           # Lambda Invoke 客户端
│   │   ├── sqs.ts               # SQS 客户端
│   │   └── event.ts             # Event 客户端
│   └── types/
│       ├── context.ts           # Context 接口定义
│       ├── router.ts            # Router 接口定义
│       └── envelope.ts          # 请求/响应信封接口
└── test/
    ├── http/
    ├── reqresp/
    ├── sqs/
    └── event/
```

## 3. 核心功能需求

### 3.1 Dynamic Package 加载

**目标**：通过 `dynamic-node` 读取 package，每个 package 导出一个签名为 `(req: ReqEnvelope, res: ResEnvelope) => void` 的函数。

**配置项** (`dynamic.yml`):
```yaml
environment:
  toolchain:
    os: ubuntu24.04
    arch: amd64v1
    compiler: go1.25.5
    variant: generic
  warehouse:
    local: ""       # 本地仓库路径
    remote: ""      # 远程仓库 URL（如 s3://）
package:
  namespace: aura
  defaultVersion: v1
  basePath: ./packages       # package 路径的相对基础路径（新增）
  preload:
    - package: example
      version: v1
```

**新增字段** `basePath`：设置 package 加载的相对基础路径。所有 package 内部的文件读取路径都相对于此路径解析。

**核心逻辑**：
1. `InstallPackages()`：根据配置设置 toolchain、warehouse、namespace、defaultVersion、basePath
2. `GetPackage(pkg, version)`：从本地/远程仓库获取 package，返回一个可调用的 handler 函数 `(req, res) => void`
3. Package 内部通过 `require` 或 `import` 加载文件时，路径会基于 `basePath` 解析

**GetPackage 流程**：
```
URL: /{package}/{version}/{route...}
  → 解析 package、version、route
  → GetPackage(package, version) 获取/下载 package
  → 返回 handler 函数 (req, res) => void
  → 调用 handler(reqEnvelope, resEnvelope)
```

**与 Go 版本的关键区别**：
- Go 版本：package 是编译好的 `.so` 动态链接库，通过 tunnel 协议调用
- Node.js 版本：package 是 npm 包或本地模块，通过 `require()` 或 `import()` 加载，导出 `(req, res) => void` 函数
- 需要通过 `basePath` 处理 package 内部文件读取的相对路径

### 3.2 请求/响应信封

统一信封格式（与 Go 版本一致）：
```typescript
// 请求信封
interface ReqEnvelope {
  meta: Record<string, any>;      // 元数据（可包含 IP、User-Agent 等）
  data: string;                    // base64 编码的原始请求体
}

// 响应信封
interface ResEnvelope {
  meta: Record<string, any>;      // 元数据（错误信息放在 meta.Error 中）
  data: string;                    // base64 编码的原始响应体
}
```

### 3.3 HTTP 模式

基于 Express.js 实现，对标 Go 版本的 Gin 实现。

**配置** (`http.yml`):
```yaml
address: ":8080"
mode:
  debug: true
  cors: true
staticLink:
  - srcPath: "/v2"
    dstPath: "/api/flipper/v2/access"
    methods: ["POST"]
prefixLink:
  - srcPrefix: "/api"
    dstPrefix: "/v1"
    methods: ["GET", "POST"]
pageNotFound:
  - path: "/health-check"
    methods: ["POST"]
```

**Engine 结构**：
```typescript
class Engine {
  options: HTTPOptions;
  app: Express;                   // Express 实例（等价于 gin.Engine）
  dynamic: Dynamic;               // 动态包加载器
}
```

**路由格式**：所有请求路径格式为 `/{package}/{version}/{route...}`

### 3.4 ReqResp 模式

对标 Go 版本的 reqresp 模式，基于 AWS Lambda `RequestResponse` 调用类型。

**配置** (`reqresp.yml`):
```yaml
mode:
  debug: false
```

**Engine 结构**：
```typescript
class Engine {
  options: ReqRespOptions;
  router: Router;                 // 自定义 Router
  dynamic: Dynamic;
}
```

### 3.5 SQS 模式

对标 Go 版本的 SQS 模式，基于 AWS Lambda + SQS 触发。

**配置** (`sqs.yml`):
```yaml
mode:
  debug: true
  run: batch             # "strict" | "partial" | "batch" | "reentrant"
  reply: false
```

**四种运行模式**（与 Go 版本一致）：

| 模式 | 行为 |
|------|------|
| `strict` | 任一条消息失败，当前及后续消息均标记为失败 |
| `partial` | 仅失败的消息标记为失败，其余继续处理 |
| `batch` | 任一条失败立即返回错误（整批重试） |
| `reentrant` | 记录最后错误，继续处理，最终返回该错误 |

### 3.6 Event 模式

对标 Go 版本的 event 模式，基于 AWS Lambda `Event` 调用类型（fire-and-forget）。

**配置** (`event.yml`):
```yaml
mode:
  debug: false
```

## 4. 配置系统

### 4.1 统一配置文件 (`lambda.yml`)

与 Go 版本保持一致，支持以下文件名自动发现：
`lambda.yaml`, `lambda.yml`, `server.yaml`, `server.yml`, `bootstrap.yaml`, `bootstrap.yml`, `app.yaml`, `app.yml`, `config.yaml`, `config.yml`

```yaml
lambda: http          # "http" | "sqs" | "reqresp" | "event"

http:
  address: ":8080"
  mode:
    debug: true
    cors: true
  staticLink: [...]
  prefixLink: [...]
  pageNotFound: [...]

sqs:
  mode:
    debug: false
    run: batch
    reply: false

reqresp:
  mode:
    debug: false

event:
  mode:
    debug: false

dynamic:
  environment:
    toolchain:
      os: ubuntu24.04
      arch: amd64v1
      compiler: go1.25.5
      variant: generic
    warehouse:
      local: ""
      remote: ""
  package:
    namespace: aura
    defaultVersion: v1
    basePath: ./packages
    preload:
      - package: example
        version: v1
```

### 4.2 配置加载流程

1. **自动发现**：从当前工作目录和可执行文件目录搜索已知文件名
2. **统一解析**：解析顶层 `lambda.yml`，提取 `lambda` 字段确定模式
3. **分发**：将各子配置块分发给对应的模块（http/sqs/reqresp/event/dynamic）
4. **合并**：各模块独立 YAML 文件与统一配置合并（统一配置优先级更高）

### 4.3 Options 模式

使用函数式 Options 模式（与 Go 版本一致）：

```typescript
type Option = (options: Options) => void;

function WithAddress(address: string): Option {
  return (options) => { options.address = address; };
}

function WithDebugMode(): Option {
  return (options) => { options.debugMode = true; };
}
```

## 5. 包管理系统

### 5.1 Package 规范

每个 package 必须：
- 为一个 npm 包或本地模块
- 默认导出一个函数：`export default function handler(req: ReqEnvelope, res: ResEnvelope): void`
- 可选导出一个 `meta()` 方法用于服务元数据

### 5.2 相对路径处理

**basePath 的作用**：
- 配置 `dynamic.package.basePath` 指定 package 目录的基础路径
- Package 内部通过 `require` 或文件读取操作时，相对路径基于 `basePath` 解析
- 例如：`basePath: ./packages`，package `example@v1` 位于 `./packages/example/v1/`
- Package 内部 `require('./utils')` 实际解析为 `./packages/example/v1/utils`

### 5.3 远程仓库

支持从远程仓库（如 S3）下载 package：
- 首次调用时从远程仓库下载并缓存在本地
- 支持版本管理（version tag）

## 6. 自定义 Router 和 Context

非 HTTP 模式（reqresp、sqs、event）使用自定义 Router：

```typescript
interface Context {
  get(key: string): any;
  set(key: string, value: any): void;
  Path: string;
  Request: string;
  Response: string;
  RequestMeta: Record<string, any>;
  ResponseMeta: Record<string, any>;
  Error: Error | null;
  Panic: any;
  Debug: boolean;
  Stdout: string;
  Stderr: string;
  Processor: string;
}

class Router {
  use(middleware: (ctx: Context, next: () => void) => void): void;
  handle(method: string, pattern: string, handler: (ctx: Context) => void): void;
  noRoute(handler: (ctx: Context) => void): void;
  dispatch(method: string, path: string): (ctx: Context) => void;
}
```

## 7. 安全处理模式

### 7.1 Safe 处理器
- 包裹所有请求处理逻辑
- 使用 `try/catch` 捕获异常
- 异常信息写入 `response.Meta["Error"]`

### 7.2 Debug 处理器
- 捕获 stdout/stderr 输出
- 异常信息详细记录
- 启用时通过 `Debug` context key 控制

## 8. Meta 生成

生成服务元数据 JSON，合并以下信息：
- **Service 信息**：从 `AWS_LAMBDA_FUNCTION_NAME` 环境变量解析（格式：`business-framework-component-runtime-resource-instance`）
- **Lambda 信息**：模块名、版本号、构建时间（从 `package.json` 读取）
- **Package 元数据**：从加载的 package 的 `meta()` 方法获取

## 9. 客户端

### 9.1 HTTP 客户端
- 支持 BaseURL、自定义 Headers、超时
- 与远程 HTTP Lambda 实例通信

### 9.2 ReqResp 客户端
- 通过 AWS SDK Lambda Invoke 调用
- 调用类型：`RequestResponse`
- 方法：`Call()`, `CallAsync()`

### 9.3 SQS 客户端
- 通过 AWS SDK SQS SendMessage 发送消息
- 后台监听响应队列，通过 `CorrelationId` 匹配响应
- 方法：`Call()`, `Send()`, `CallAsync()`

### 9.4 Event 客户端
- 通过 AWS SDK Lambda Invoke 调用
- 调用类型：`Event`（fire-and-forget）
- 方法：`Send()`, `SendAsync()`

## 10. 使用方式

```typescript
import { serve } from '@aura-studio/lambda-node';

// 方式 A：自动发现配置文件
serve({
  useDefaultConfig: true,
});

// 方式 B：显式配置
serve({
  lambdaType: 'http',
  http: {
    address: ':8080',
    debugMode: true,
    corsMode: true,
  },
  dynamic: {
    packageNamespace: 'aura',
    packageDefaultVersion: 'v1',
    basePath: './packages',
  },
});
```

## 11. 技术栈

- **运行时**：Node.js 18+
- **语言**：TypeScript
- **HTTP 框架**：Express.js（对标 Gin）
- **AWS SDK**：@aws-sdk/client-lambda、@aws-sdk/client-sqs
- **配置解析**：js-yaml（对标 gopkg.in/yaml.v2）
- **测试框架**：Jest / Vitest
- **构建工具**：tsup 或 tsc
- **包管理**：pnpm / npm

## 12. 与 Go 版本的对应关系

| Go 版本 | Node.js 版本 |
|---------|-------------|
| `github.com/aura-studio/dynamic` | `dynamic-node`（npm 包） |
| `gin-gonic/gin` | Express.js |
| `aws-lambda-go` | AWS SDK for JavaScript |
| `gopkg.in/yaml.v2` | js-yaml |
| `google/uuid` | uuid |
| `mohae/deepcopy` | structuredClone 或 lodash.cloneDeep |
| Go `func()` Options | TypeScript `(options: T) => void` |
| Tunnel 协议 | 直接函数调用 `handler(req, res)` |

## 13. 待确认事项

1. `dynamic-node` 的具体 API 设计（package 下载、缓存、版本管理机制）
2. `basePath` 相对路径解析的完整策略（是否影响 `require` 行为、如何处理符号链接）
3. 是否需要支持 CommonJS 和 ESM 双模块格式
4. 单元测试和集成测试的范围和覆盖率目标
5. 是否需要 CLI 工具（如 `lambda-node init`）