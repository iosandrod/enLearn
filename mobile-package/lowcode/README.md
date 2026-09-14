# @enlearn/mobile-lowcode

可独立发布的 EnLearn 移动低代码运行时与 Vue/Hippy 控件集合。包含 Schema 渲染、数据源请求、鉴权会话、导航、缓存、离线写队列、原生能力桥接及表单/列表/弹层/树等控件。

表格由独立包 `@enlearn/mobile-table` 提供，并通过 `MobileGrid` 集成。

发布（建议先发布表格包）：

```bash
pnpm --filter @enlearn/mobile-lowcode publish --access public
```

`pnpm publish` 会将 `workspace:*` 依赖转换为对应的 npm 版本号。
