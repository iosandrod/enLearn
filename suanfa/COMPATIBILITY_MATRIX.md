# 核心算法兼容矩阵

更新日期：2026-08-18

本矩阵只记录已由自动化测试验证的能力。`通过` 表示 TypeScript 以
`E:\frepple-master\test` 中原始 XML 为输入，并与对应 `.expect` 的
相关算法输出一致。

| 模块 | 已验证能力 | 原始夹具 | 状态 |
| --- | --- | --- | --- |
| Kernel | UTC 日期、Duration、数值容差与稳定序号 | 单元测试 | 通过 |
| Model/Fixture | Calendar、cluster fixture 解析 | `calendar`、`cluster` | 通过 |
| Timeline | 同日期生产/消耗排序、set-onhand、增量缓存、随机序列全量重算一致性 | 单元测试与 fast-check | 通过 |
| Transaction | bookmark、嵌套 commit、rollback | 单元测试 | 通过 |
| Graph | flow level 与 cluster 传播 | 单元测试 | 通过 |
| Forecast | 覆盖分摊、离散取整、基础预测方法与 demand-to-forecast netting | `forecast_2`、`forecast_3`、`forecast_4`、`forecast_5` | 通过 |
| MRP Procurement | 初始库存、确认 PO、采购最小量/倍数、供应商优先级、物料组继承、软/硬安全提前期、延期与部分交付、同日采购合并 | `period_of_cover`、`supplier.2`、`supplier.3` | 通过 |
| APS Manufacturing | fixed-time、time-per、flow offset/effectivity、confirmed/approved/completed operation plan、部分资源容量与资源可用日历、约束/非约束模式 | `flow_fixed`、`flow_effective`、`flow_offset`、`constraints_material_1`、`constraints_resource_1.1/.3`、`constraints_resource_2`、`constraints_resource_3`、`constraints_resource_4`、`constraints_resource_5.2/.3` | 部分通过 |
| MRP Output | BUFFER、DEMAND、OPERATION、RESOURCE 输出及延期需求 `originalDue`、在库量和 period of cover | 制造与资源 golden 输出 | 通过 |

## 当前 MRP 输出契约

- `period_of_cover.1.expect`：逐条验证物料事件、在途确认收货、延期需求和 period of cover。
- `supplier.2.expect`：逐条验证受限模式的 BUFFER 事件和 OPERATION 采购输出。
- `supplier.3.expect`：逐条验证非受限模式的 BUFFER 事件和 OPERATION 采购输出。
- 采购订单比较使用名称、开始、结束、数量和 confirmed 状态；BUFFER 事件比较缓冲区、日期、数量和在库量。
- 同一输入连续执行 20 次，以上 MRP 回归结果一致。

## 下一阶段边界

以下能力尚未纳入“已通过”范围，不能视作已经完成转换：

- distribution、global purchase、split、dependency。
- setup、skills、复杂 resource buckets 和所有未覆盖的约束问题输出。
- MRP 的 forward/backward 修复、删除、pegging、完整试算与增量回滚。
- `forecast_1`、`forecast_6` 至 `forecast_10` 的自动化 golden 回归。
- Worker Threads 并行、性能与内存基准。

## 本轮新增验证与已知差异

- 新增确认采购供应商精确匹配：匹配规则时按提前期倒推，不匹配时保持零时长。
- 新增 routing 完整 fixture 的有界稳定性测试，修复顶层 routing 无直接子操作产出时的零产出批次数爆炸。
- 新增生产批量拆分：`size_minimum/size_maximum/size_multiple` 进入普通生产排程；`constraints_material_4.3` 已逐事件通过。
- `constraints_material_2/3`、`constraints_material_4.1/.2`、`constraints_resource_1.2`、`constraints_resource_5.1`、`constraints_leadtime_1/3/4`、alternate、location、effective、pre/post、WIP 和复杂 routing 仍有输出差异，不能标记为完成。
- `_fixture-sweep.test.ts` 是差异探测器，已知差异只记录日志；严格门禁使用各 golden 测试文件。

## 本次验证命令

```powershell
pnpm typecheck
pnpm lint
pnpm test
```

验证结果（本轮基线）：23 个测试文件、131 个测试执行通过；其中 fixture sweep 包含上述已知差异的观测用例。`pnpm typecheck` 和 `pnpm lint` 通过。
