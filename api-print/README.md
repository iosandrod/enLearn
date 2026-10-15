# api-print

独立的后端打印预览服务。服务不读取用户会话、不访问业务数据库，也不要求登录；它接收模板和数据，直接返回 `application/pdf` 或 `image/png` 二进制内容。

## 启动

需要 Node.js 22+。服务默认监听 `0.0.0.0:3302`，会自动寻找本机 Chrome 或 Edge。

```powershell
# 开发模式
pnpm print-api:dev

# 生产模式
pnpm print-api:build
pnpm print-api:start
```

浏览器不存在时，可设置 `PRINT_CHROMIUM_EXECUTABLE_PATH` 指向 Chrome/Chromium 可执行文件。生产部署时建议在防火墙或反向代理层限制访问来源；该服务本身刻意不提供用户权限校验。

## 接口

`GET /health` 返回工作线程和队列状态。渲染接口为 `POST /render`、`POST /preview`，以及兼容别名 `/api/print/render`、`/api/print/preview`。

请求必须是 `application/json`：

```json
{
  "html": "<section data-print-page=\"1\"><h1>{{title}}</h1></section>",
  "css": "section { width: 80mm; height: 50mm; padding: 4mm; }",
  "records": [{ "title": "预览单据" }],
  "format": "png",
  "recordIndex": 0,
  "pageIndex": 0,
  "page": {
    "widthMm": 80,
    "heightMm": 50,
    "marginMm": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
  },
  "dpi": 144,
  "scale": 1,
  "printBackground": true,
  "filename": "中文预览"
}
```

`html` 和 `css` 支持 `{{name}}`、`{{customer.name}}` 形式的数据占位符，值会进行 HTML 转义。`format` 默认为 `png`；`pdf` 会把所有 `records` 合并成分页 PDF，`png` 只渲染 `recordIndex` 指定的记录。模板中存在多个 `[data-print-page]` 元素时，`pageIndex` 选择要返回的图片页；没有标记时返回纸张大小的视口截图。响应主体就是文件，不是 base64，响应头包含 `content-disposition`、`x-render-ms`、`x-worker-id`，PNG 另有 `x-page-count`。

示例：

```powershell
$body = @{ html = '<h1>{{title}}</h1>'; records = @(@{ title = 'Hello' }); format = 'png'; page = @{ widthMm = 80; heightMm = 50 } } | ConvertTo-Json -Depth 8
Invoke-WebRequest http://127.0.0.1:3302/render -Method Post -ContentType 'application/json' -Body $body -OutFile preview.png
```

默认只允许 `data:` 资源。确实需要加载图片、字体或样式表时，将精确的 HTTP(S) 源以逗号分隔配置到 `PRINT_ASSET_ORIGINS`；导航、脚本、重定向和未列入白名单的资源都会被拦截。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PRINT_API_HOST` | `0.0.0.0` | 监听地址 |
| `PRINT_API_PORT` | `3302` | 监听端口 |
| `PRINT_WORKER_COUNT` | `min(4, CPU-1)` | 并行浏览器工作线程，范围 1-32 |
| `PRINT_MAX_QUEUE` | `32` | 等待中的最大任务数 |
| `PRINT_RENDER_TIMEOUT_MS` | `30000` | 单任务超时时间 |
| `PRINT_MAX_BODY_BYTES` | `5242880` | JSON 请求体上限 |
| `PRINT_API_ALLOW_ORIGIN` | `*` | CORS 允许源 |
| `PRINT_ASSET_ORIGINS` | 空 | 允许访问的精确资源源 |
| `PRINT_CHROMIUM_EXECUTABLE_PATH` | 自动探测 | Chromium/Chrome/Edge 路径 |

HTTP 错误使用 `400`（参数或模板）、`413`（请求或展开后的模板过大）、`415`（Content-Type）、`503`（队列满或服务不可用）、`504`（渲染超时）。

## 设计

HTTP 层将任务放入有界队列，`worker_threads` 中的每个工作线程复用一个独立 Chromium，并为每个任务创建隔离 BrowserContext。浏览器在服务开始监听前预热；线程或浏览器超时会被销毁并自动补齐，从而避免单个异常任务阻塞后续预览。

打印设计器的工具面板提供“远程预览”：解析当前页面的数据绑定、公式和分页，发送 SVG 页面快照、数据源记录及页面设置到本服务，并在弹框展示返回的 PNG。各页并发请求，最多同时处理 4 页；关闭弹框会取消请求并释放图片。

前端默认请求当前站点主机的 `3302` 端口。部署时可设置 `VITE_PRINT_API_BASE_URL`（例如 `https://example.com/print-api`）并通过反向代理连接本服务，HTTPS 页面需要对应的 HTTPS 服务地址。
