# EnLearn 静默打印桌面客户端

Windows Electron 客户端，默认仅在本机 `127.0.0.1:3302` 提供无登录打印接口。它兼容现有预览接口，并增加系统打印机管理、静默打印、设备参数、任务队列、失败重试、任务记录、开机启动、更新检查和异常日志。

## 开发与打包

```powershell
pnpm install
pnpm print-desktop:dev

# 类型检查、测试和 Windows 安装包/便携版
pnpm print-desktop:build
pnpm print-desktop:test
pnpm print-desktop:dist
```

打包输出在 `electron-print/release-desktop/`，分别提供 `*-setup.exe` 安装版和 `*-portable.exe` 便携版。打包脚本直接使用本地 Electron 二进制，不继承全局旧版镜像目录。首次安装依赖时如有旧版 Electron 镜像配置，应删除固定版本的 `electron_custom_dir` 后重新安装。

关闭管理窗口后程序留在系统托盘继续服务；从托盘退出时等待已有打印任务完成。开机启动默认关闭，可在客户端设置中启用，Windows 登录后后台运行；开发模式不修改开机启动项。便携版使用便携 EXE 的实际位置注册启动，移动文件后需要重新保存启动设置。

桌面版与独立 `api-print` 均使用 3302，同机运行时应二选一；端口占用会显示明确提示。网页调用桌面版时，应将前端 `VITE_PRINT_API_BASE_URL` 设置为 `http://127.0.0.1:3302`，并在客户端“允许调用的网页来源”中加入实际前端来源。HTTPS 网页访问本机服务还需浏览器允许本地网络访问。

## 接口

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务和队列状态 |
| GET | `/printers` | 获取系统打印机 |
| PUT | `/printers/default` | 设置 Windows 和客户端默认打印机 |
| POST | `/print` | 指定打印机静默打印 |
| POST | `/test-print` | 打印设备测试页 |
| GET | `/jobs` | 查询任务记录 |
| GET | `/jobs/{id}` | 查询单个任务的状态 |
| POST | `/jobs/{id}/retry` | 重试失败任务 |
| GET/PUT | `/config` | 客户端及打印机参数 |
| POST | `/preview`、`/render` | 返回 PDF 或 PNG，兼容 `api-print` |

### 静默打印示例

```json
{
  "html": "<section><h1>{{title}}</h1></section>",
  "records": [{ "title": "生产标签" }],
  "printerName": "ZDesigner ZD421-203dpi ZPL",
  "templateName": "成品标签",
  "jobName": "工单 WO-20261016-01",
  "copies": 2,
  "printBackground": true,
  "page": {
    "widthMm": 50,
    "heightMm": 30,
    "marginMm": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
  },
  "offset": { "xMm": 0, "yMm": 0 },
  "wait": true
}
```

`POST /print` 的成功反馈表示 Electron/Windows 已接受任务并将其提交到系统打印队列，不能证明打印机已经物理出纸。缺纸、卡纸、碳带等硬件状态需要下一阶段接入厂商 SDK、SNMP 或 Windows Spooler 监控才能确认。

`printerName` 使用 `/printers` 返回的精确 `name`。首次使用在界面设置默认打印机；请求中的尺寸、偏移、方向和背景覆盖该打印机的已保存配置。尺寸和偏移单位均为毫米；`landscape: true` 将宽高交换。`copies` 范围 1–999，`collate` 控制份间逐份打印。驱动必须支持目标标签纸尺寸，虚拟 PDF/XPS 打印机可能仍要求保存路径，不适合作为无人值守打印设备。

默认 `wait: true` 等待当前任务提交结果；批量调用建议 `wait: false`，接口立即返回 202 和任务 ID，再查询 `/jobs/{id}`。物理打印串行提交，等待队列最多 100 条。失败和上次异常退出的任务由操作员检查后手动重试，程序不会自动补打，避免重复标签。

预览由最多 4 个独立 Chromium 渲染进程并行执行，另允许 32 个排队请求。Electron 的窗口/打印 API 必须在主进程调用，因此采用渲染进程并行；无需另装 Chrome，也不需要访问业务后端。预览超时 30 秒，打印调用超时 60 秒；关闭前端预览会取消对应请求并回收窗口。

配置及任务记录保存在 Electron `userData` 目录，日志在其中 `logs/silent-print.log`，管理界面会显示完整路径。记录默认保留 1000 条，可设为 100–10000 条；为支持手动重试，本机任务记录包含原始模板和业务数据，应按现场数据保留要求设置上限。日志达到 5 MB 后轮换。

## 版本更新

安装版支持手动检查更新、后台下载和退出后安装；便携版下载新版替换。需自行提供 HTTPS 更新地址，将打包目录的 `latest.yml`、安装 EXE 及 `.blockmap` 上传到该地址，不需要业务用户登录。尚未配置更新地址时界面会明确提示；项目不会自动发布到更新服务器。当前构建未使用代码签名证书，正式部署时配置签名并启用 EXE 资源编辑。

## 验证

`pnpm --dir electron-print test` 覆盖参数校验、并发入队、串行提交、失败重试、重启恢复和 HTTP 契约。`pnpm --dir electron-print test:electron` 使用真实 Electron 检查打印机枚举、PDF 尺寸/分页、PNG 像素/DPI、并发预览和取消，并拦截最终驱动调用验证静默打印选项，避免消耗纸张。真实标签机出纸、驱动适配以及更新服务器下载/安装仍需现场验收。

## 安全边界

- 接口无用户登录，但固定绑定 `127.0.0.1`，不直接暴露到工厂局域网。
- 浏览器来源必须在配置白名单中（默认允许本机 3301）；本机命令行/桌面 IPC 不依赖用户会话。Host 校验防止来源域名重绑定。
- HTML 禁止脚本、iframe、事件处理器和活动内容。
- 打印文档使用严格 CSP，不加载外部网络资源；图片和字体应随请求以内联 `data:` 形式发送。
- 管理窗口启用 Electron 沙箱、上下文隔离并关闭 Node 集成。

## 现场部署建议

1. 在每台工位电脑安装客户端并选择默认标签机。
2. 分别保存 50×30、100×50 等打印机配置并做边界测试。
3. 固定标签机驱动版本，关闭 Windows 自动替换驱动。
4. 更新服务使用 HTTPS，并为安装包配置代码签名，避免 Windows SmartScreen 拦截。
