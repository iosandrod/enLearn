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

打包输出在 `electron-print/release/`。安装版本支持登录后自动运行；关闭管理窗口后程序留在系统托盘继续服务。

## 接口

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务和队列状态 |
| GET | `/printers` | 获取系统打印机 |
| PUT | `/printers/default` | 设置 Windows 和客户端默认打印机 |
| POST | `/print` | 指定打印机静默打印 |
| POST | `/test-print` | 打印设备测试页 |
| GET | `/jobs` | 查询任务记录 |
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

## 安全边界

- 接口无用户登录，但固定绑定 `127.0.0.1`，不直接暴露到工厂局域网。
- HTML 禁止脚本、iframe、事件处理器和活动内容。
- 打印文档使用严格 CSP，不加载外部网络资源；图片和字体应随请求以内联 `data:` 形式发送。
- 管理窗口启用 Electron 沙箱、上下文隔离并关闭 Node 集成。

## 现场部署建议

1. 在每台工位电脑安装客户端并选择默认标签机。
2. 分别保存 50×30、100×50 等打印机配置并做边界测试。
3. 固定标签机驱动版本，关闭 Windows 自动替换驱动。
4. 更新服务使用 HTTPS，并为安装包配置代码签名，避免 Windows SmartScreen 拦截。
