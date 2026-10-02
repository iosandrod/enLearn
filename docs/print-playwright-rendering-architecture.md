# 服务端 Playwright 打印预览与批量导出架构

> 状态：实现设计
> 适用范围：打印设计器、单据预览、图片/PDF 批量导出

## 当前实施状态

第一阶段后端和前端调用 SDK 已完成：print 服务总线接入、HTML/CSS 模板快照编译、Worker Thread 浏览器池、PNG/JPEG/PDF/ZIP、任务状态/取消、Supabase Storage artifact 和签名下载。

当前任务调度器采用进程内队列，任务仓储支持数据库和开发期内存模式。本阶段已接入 tldraw-vue 的浏览器端 SVG 快照、服务端 Playwright 多页渲染、设计器预览/导出动作和已保存模板版本读取。Redis 暂不引入；后续如需多实例部署，可在不改变外部接口的前提下替换队列适配器。

## 1. 设计结论

打印渲染不放在 API 请求线程中完成。API 负责鉴权、参数校验、创建任务和查询状态；专用 print-worker 进程中的 Node worker_threads 负责浏览器渲染。

~~~mermaid
flowchart LR
  UI[打印设计器/业务页面] -->|POST /api/service| G[API Gateway]
  G --> P[Print Service]
  P --> DB[(Supabase/Postgres print_jobs)]
  P --> Q[进程内打印队列]
  Q --> W1[Worker Thread 1 / Browser 1]
  Q --> W2[Worker Thread 2 / Browser 2]
  W1 --> R[统一模板渲染器]
  W2 --> R
  R --> S[(Supabase Private Storage)]
  S -->|短期 signed URL| UI
~~~

关键决策：

1. 预览和正式导出共用同一个 RenderEngine，保证布局一致。
2. Playwright Browser 只能在 Worker 内创建；每个 Worker 自己持有浏览器实例和上下文池。
3. 任务保存模板版本、数据快照哈希和渲染参数，任务可重试、可审计、可复现。
4. 输出写入现有 files-service 使用的私有 Storage，API 只返回 5～15 分钟有效的签名下载地址。
5. 前端优先提交已查询好的记录快照；服务端取数时只允许调用已注册的数据源方法。

## 2. 与现有后端接入

项目通过 POST /api/service 统一分发请求，因此新增公开服务名 print：

~~~ts
export const DOMAIN_SERVICE_NAMES = [
  // existing names
  'print'
] as const;
~~~

建议新增 api/src/print-service/：

~~~text
print.module.ts
print.service.ts             # 鉴权、任务编排、状态查询
print.types.ts               # DTO 和内部协议
print-template.compiler.ts   # 模板快照 -> 安全 HTML/CSS
print-render.engine.ts       # Playwright 渲染
print-job.repository.ts      # print_jobs/artifacts 持久化
  print-queue.adapter.ts       # 当前为进程内队列，保留后续替换边界
worker/print-worker.entry.ts
worker/print-worker.pool.ts
~~~

所有 print 方法经过现有 active account 校验。Worker 不接收浏览器请求中的 JWT，只接收已校验的 tenantId/accountId/userId 和不可变输入快照。

## 3. 渲染输入模型

### 3.1 模板

生产导出只接受已发布模板：

~~~ts
type PrintTemplateRef = {
  templateId: string;
  version: number;              // immutable published version
};
~~~

设计器未保存时允许传 templateSnapshot，但只用于预览。快照最大 2 MB，组件类型必须来自白名单，禁止 script、事件处理器、外部 CSS 和未知 HTML 属性。正式导出必须先保存并发布版本。

### 3.2 数据源

~~~ts
type PrintDataInput =
  | {
      kind: 'records';
      records: Array<Record<string, unknown>>;
      primaryKey?: string;
    }
  | {
      kind: 'dataRef';
      fileId: string;             // files-service private object
      sha256: string;
      recordCount: number;
    }
  | {
      kind: 'registeredQuery';
      sourceCode: string;         // server-side registered source only
      params: Record<string, unknown>;
      pageSize?: number;
    };
~~~

records 请求体最大 5 MB；更大数据先上传 files-service，再传 dataRef。registeredQuery 由 Print Service 在当前 account/user 上下文中解析为快照，Worker 不直接访问业务数据库。

### 3.3 输出

~~~ts
type PrintOutput = {
  format: 'pdf' | 'png' | 'jpeg' | 'zip';
  page: {
    widthMm: number;
    heightMm: number;
    orientation?: 'portrait' | 'landscape';
    marginMm?: { top: number; right: number; bottom: number; left: number };
  };
  dpi?: 96 | 144 | 192;
  scale?: number;                // 0.5 ~ 2
  printBackground?: boolean;
  filename?: string;
};
~~~

pdf 将记录渲染为一个文档并插入 page-break；png/jpeg 每条记录一张图片，批量时自动打包 ZIP；zip 还生成 manifest.json，记录主键、文件名和失败原因。

## 4. 服务接口

所有接口使用项目现有统一入口，HTTP 响应继续由网关包装为 success/serviceName/serviceMethod/data。

### 4.1 创建即时预览

预览限制为 1～3 条记录、最长 15 秒。超时或超限自动返回异步任务。

~~~http
POST /api/service
Authorization: Bearer <access-token>
x-account-id: <account-id>
x-request-id: <request-id>
~~~

~~~json
{
  "serviceName": "print",
  "serviceMethod": "createPreview",
  "postData": {
    "template": { "templateId": "tpl-order", "version": 12 },
    "templateSnapshot": null,
    "data": {
      "kind": "records",
      "records": [{ "id": "SO-1001", "customer": "上海示例客户", "amount": 1280.5 }],
      "primaryKey": "id"
    },
    "output": {
      "format": "png",
      "page": {
        "widthMm": 210, "heightMm": 297,
        "marginMm": { "top": 8, "right": 8, "bottom": 8, "left": 8 }
      },
      "dpi": 144,
      "printBackground": true
    }
  }
}
~~~

同步完成：

~~~json
{
  "mode": "inline",
  "previewId": "pv_01J...",
  "status": "succeeded",
  "artifact": {
    "artifactId": "art_01J...",
    "format": "png",
    "mimeType": "image/png",
    "sizeBytes": 183204,
    "downloadUrl": "https://...signed-url",
    "expiresAt": "2026-10-02T10:15:00Z"
  },
  "metrics": { "queueMs": 0, "renderMs": 642 }
}
~~~

异步返回：

~~~json
{
  "mode": "async",
  "previewId": "pv_01J...",
  "jobId": "pj_01J...",
  "status": "queued",
  "pollAfterMs": 500
}
~~~

### 4.2 创建批量导出任务

~~~json
{
  "serviceName": "print",
  "serviceMethod": "createExportJob",
  "postData": {
    "template": { "templateId": "tpl-order", "version": 12 },
    "data": {
      "kind": "records",
      "records": [
        { "id": "SO-1001", "customer": "客户 A" },
        { "id": "SO-1002", "customer": "客户 B" }
      ],
      "primaryKey": "id"
    },
    "output": {
      "format": "pdf",
      "page": { "widthMm": 210, "heightMm": 297, "orientation": "portrait" },
      "printBackground": true,
      "filename": "销售订单"
    },
    "options": {
      "priority": "normal",
      "locale": "zh-CN",
      "timezone": "Asia/Shanghai",
      "notifyOnComplete": false
    }
  }
}
~~~

返回：

~~~json
{
  "jobId": "pj_01J...",
  "status": "queued",
  "acceptedCount": 2,
  "pollAfterMs": 1000,
  "statusMethod": "getJob"
}
~~~

### 4.3 查询状态

~~~json
{
  "serviceName": "print",
  "serviceMethod": "getJob",
  "postData": { "jobId": "pj_01J..." }
}
~~~

~~~json
{
  "jobId": "pj_01J...",
  "status": "running",
  "progress": { "total": 200, "completed": 86, "failed": 1, "percent": 43 },
  "artifacts": [],
  "error": null,
  "createdAt": "2026-10-02T10:00:00Z",
  "startedAt": "2026-10-02T10:00:01Z",
  "finishedAt": null,
  "expiresAt": "2026-10-03T10:00:00Z"
}
~~~

状态值：queued、running、succeeded、partial、failed、canceled、expired。完成时 artifacts 返回签名地址；前端下载前可再次调用 getArtifactDownload 获取新地址。

### 4.4 取消和下载

~~~json
{
  "serviceName": "print",
  "serviceMethod": "cancelJob",
  "postData": { "jobId": "pj_01J..." }
}
~~~

~~~json
{
  "serviceName": "print",
  "serviceMethod": "getArtifactDownload",
  "postData": { "jobId": "pj_01J...", "artifactId": "art_01J..." }
}
~~~

下载响应包含 artifactId、downloadUrl、expiresAt 和 RFC 5987 编码的 contentDisposition。只能访问当前用户/账套的任务。

## 5. 任务持久化

建议新增三张表：

~~~sql
create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  owner_id uuid not null,
  kind text not null check (kind in ('preview','export')),
  status text not null check (status in ('queued','running','succeeded','partial','failed','canceled','expired')),
  template_id text not null,
  template_version integer not null,
  input_json jsonb not null,
  input_sha256 text not null,
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index print_jobs_account_status_idx
  on public.print_jobs(account_id, status, created_at desc);

create table public.print_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.print_jobs(id) on delete cascade,
  account_id uuid not null,
  object_key text not null,
  format text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  record_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique(job_id, object_key)
);

create table public.print_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.print_jobs(id) on delete cascade,
  item_index integer not null,
  record_key text,
  status text not null check (status in ('queued','running','succeeded','failed','canceled')),
  artifact_id uuid references public.print_artifacts(id),
  error_code text,
  error_message text,
  attempts integer not null default 0,
  unique(job_id, item_index)
);
~~~

RLS 按 account_id 隔离。Worker 使用受控 service-role，通过仓储层读写，绝不把 service-role key 放入队列 payload。

## 6. Worker 线程和浏览器生命周期

### 6.1 Worker 协议

~~~ts
type WorkerTask = {
  jobId: string;
  itemIndexes: number[];
  templateHtml: string;
  records: Array<Record<string, unknown>>;
  output: PrintOutput;
  abortKey: string;
};

type WorkerEvent =
  | { type: 'progress'; jobId: string; completed: number; failed: number }
  | { type: 'artifact'; jobId: string; tempPath: string; sha256: string; sizeBytes: number }
  | { type: 'error'; jobId: string; retryable: boolean; code: string; message: string };
~~~

每个 Worker 启动时 chromium.launch() 一次；每个任务创建隔离 browser.newContext()，每条记录使用独立 Page，任务结束关闭 context。累计 100 个任务或 RSS 超阈值时优雅重启浏览器；浏览器崩溃由池管理器拉起新 Worker。

### 6.2 并发和队列

- worker 数默认 min(4, max(1, CPU 核数 - 1))，单 Worker 同时只处理一个批次。
- 一个批次默认 50 条，最大 100 条；总量最大 5,000 条，可按租户配置。
- 同一 account 默认最多 2 个并发任务。
- 优先级为 preview > normal export > retry。
- Redis 消息只放 jobId 和批次索引，实际输入从数据库/对象存储读取，避免大 key。

### 6.3 重试

浏览器崩溃、Storage 临时网络错误、租约超时可重试 2 次；模板校验、数据字段和大小错误不可重试。使用租约和幂等状态更新，Worker 重启不会重复生成 artifact。

## 7. HTML 渲染安全与一致性

RenderTemplateCompiler 输出固定 HTML：

~~~html
<!doctype html>
<html>
  <head><meta charset="utf-8"><style>/* sanitized css */</style></head>
  <body><main data-print-root="true">...</main></body>
</html>
~~~

渲染约束：

- page.setContent(html, { waitUntil: 'load' })，不访问前端登录页。
- 禁止模板执行脚本；二维码/条码由白名单组件在编译阶段生成 SVG/PNG。
- 图片只允许私有 Storage 签名 URL 或已配置域名；拦截 file://、localhost、内网 IP 和未知域名，防止 SSRF。
- 等待 document.fonts.ready、图片加载和 data-print-ready，最长 5 秒。
- PDF 使用 page.pdf({ preferCSSPageSize: true, printBackground })；图片使用 page.screenshot({ fullPage: true })。
- 动态值全部 HTML 转义；富文本只允许 sanitizer 白名单标签。

## 8. 前端调用和错误协议

前端对预览请求 300～500 ms 防抖，用 previewId 丢弃旧响应；导出后按 pollAfterMs 轮询，退避上限 3 秒，刷新页面后用 getJob 恢复状态。批量图片优先 ZIP。

建议错误码：

~~~text
PRINT_TEMPLATE_NOT_FOUND
PRINT_TEMPLATE_NOT_PUBLISHED
PRINT_TEMPLATE_INVALID
PRINT_INPUT_TOO_LARGE
PRINT_RECORD_LIMIT_EXCEEDED
PRINT_ASSET_NOT_ALLOWED
PRINT_RENDER_TIMEOUT
PRINT_BROWSER_UNAVAILABLE
PRINT_JOB_NOT_FOUND
PRINT_JOB_FORBIDDEN
PRINT_JOB_CANCELED
PRINT_ARTIFACT_EXPIRED
~~~

## 9. 监控、限流和清理

记录队列等待、模板编译、浏览器渲染、Storage 上传耗时、Worker RSS、成功/失败/重试数，并带 requestId/jobId/accountId/templateId；日志不记录完整业务数据。

建议限制：单请求 20 MB、单条记录 1 MB、单任务 5,000 条、PDF 200 MB、图片 ZIP 500 MB。预览保留 30 分钟，导出任务和 artifact 保留 24 小时；清理程序先删对象再删元数据，失败可重试。

## 10. 分阶段落地

### Phase 1：单条预览

接入 print 服务名和 createPreview；实现模板快照编译、一个 Worker、PNG/PDF、私有 Storage 和签名下载。

### Phase 2：异步批量

引入 Redis 队列、Worker 池和三张任务表，实现 createExportJob/getJob/cancelJob/getArtifactDownload、重试、进度和 dataRef。

### Phase 3：生产加固

加入模板发布版本、RLS、SSRF 拦截、租户并发配额、指标告警、字体/条码/二维码回归测试，并将 print-worker 独立部署。

