# frePPLe 核心算法 TypeScript 转换项目范围

## 1. 项目目标

在 `E:\enLearn\suanfa` 中分阶段开发一个运行于 Node.js 服务端的 TypeScript 核心算法项目，转换 frePPLe 的核心规划和预测算法及其最小运行模型，并使用原项目现有测试数据持续执行输入输出差分验证，直到达到本文定义的算法兼容和性能验收目标。

本项目不是浏览器端项目，也不以机械翻译 C++ 源文件为目标。实现应在保持算法行为的前提下采用适合 TypeScript、Node.js 和 Worker Threads 的结构。

## 2. 源项目与目标目录

- 源项目：`E:\frepple-master`
- TypeScript 项目：`E:\enLearn\suanfa`
- 源测试数据：`E:\frepple-master\test`
- 目标运行环境：Node.js 服务端

## 3. 转换范围

### 3.1 MRP/APS 求解算法

- Demand 求解和需求排序
- Operation 求解
- Buffer 和 Flow 物料约束
- Resource 和 Load 产能约束
- constrained 和 unconstrained 规划模式
- heuristic 和 heuristic2
- alternate、routing、split 和 dependency
- 前向修复、后向修复和多余供应删除
- 增量求解所需的试算、提交和回滚

### 3.2 最小算法运行模型

虽然只转换核心算法，但以下结构是算法正确运行的必要组成部分，必须纳入：

- Demand、Operation、Buffer、Resource、Flow 和 Load
- OperationPlan、FlowPlan 和 LoadPlan
- Calendar、Date、Duration 和 DateRange 的算法语义
- Buffer 和 Resource Timeline
- level 和 cluster 计算
- bookmark、commit、rollback 和事务命令日志
- 约束、问题和算法结果记录
- 稳定、可复现的事件和实体排序

该模型只实现算法所需字段和行为，不复制原项目完整元数据、反射、Python 对象和 Web 模型体系。

### 3.3 预测算法

- Moving Average
- Single Exponential
- Double Exponential
- Seasonal
- Croston
- Manual
- SMAPE
- 标准差和异常值检测
- 参数迭代和周期检测
- 预测方法选择

### 3.4 兼容和测试工具

- 现有 XML 测试数据到 TypeScript 输入模型的转换
- C++ 输出和 TypeScript 输出的标准化
- golden 测试
- C++/TypeScript 差分测试
- 属性测试
- 性能和内存基准测试

## 4. 不在转换范围内

以下内容不属于本项目目标：

- Django 应用、管理命令和 Web 页面
- 前端 JavaScript/Vue 代码
- PostgreSQL 生产装载和结果导出流程
- Python C API 和完整 `frepple` Python 对象 API
- Python user exits 的原样兼容
- Xerces XML 框架
- HTTP API、鉴权和生产任务调度系统
- 原项目完整反射、元数据和动态类型注册系统
- 浏览器端执行

如测试需要，可实现轻量 XML fixture 适配器；该适配器不属于算法内核。

## 5. 技术约束

### 5.1 基础技术

- Node.js 22 或更高 LTS 版本
- TypeScript 5.x
- ESM 和 `NodeNext`
- `strict: true`
- pnpm workspace
- `tsc --build`
- Vitest

### 5.2 可使用的外部库

- Worker 池：Piscina
- 图结构：graphology、graphology-components
- 数值计算：ml-matrix、ml-levenberg-marquardt
- 基础统计：simple-statistics
- 时间边界解析：`@js-temporal/polyfill`
- 有序索引：sorted-btree
- 序列化：msgpackr
- Schema 校验：Ajv
- 属性测试：fast-check
- 性能测试：tinybench 和 Node.js `perf_hooks`
- XML fixture：fast-xml-parser
- 日志：pino

库的使用不能改变算法语义。若库的默认排序、浮点、迭代或边界行为与 C++ 实现不同，应通过兼容层固定行为，必要时自行实现相关逻辑。

### 5.3 算法内部约束

- 日期在热路径中统一保存为 UTC epoch seconds。
- 数值默认使用 JavaScript `number`，对应 C++ `double`。
- 不使用 JSON 深拷贝实现事务回滚。
- 不使用 ORM、HTTP 或数据库调用进入求解热路径。
- 不使用 `eval` 或 `new Function` 执行业务表达式。
- 第一版求解器以单线程行为正确性为目标；完成差分验证后再接入 Worker 并行。
- 相同输入必须生成确定、可复现的结果。

## 6. 关键兼容规则

### 6.1 Timeline

专用 Timeline 至少支持：

- 插入、删除、移动和数量更新
- 日期定位和前后遍历
- onhand 和 cumulative production 增量维护
- minimum、maximum 和 set-onhand 事件
- 结构及累计值一致性检查

不能仅用普通数组排序替代 Timeline 的增量行为。

### 6.2 事件排序

C++ 实现中的指针地址不能作为 TypeScript 排序条件。TypeScript 必须使用明确、稳定的排序键，例如：

1. date
2. eventType
3. quantity
4. operationPlanOrder
5. stableSequence

实际字段方向和优先级以 C++ 差分测试结果为准，并在代码中固化。

### 6.3 事务

采用命令日志实现嵌套事务，至少包含：

- CreateOperationPlanCommand
- DeleteOperationPlanCommand
- MoveOperationPlanCommand
- UpdateQuantityCommand
- SetFieldCommand
- Bookmark
- commit
- rollback

提交和回滚需要具备可验证的幂等语义。

### 6.4 并行

- 以 cluster 作为主要并行边界。
- 只读基础模型可以共享或高效复制。
- 每个 Worker 持有私有动态计划和事务日志。
- Worker 数量变化不得改变业务结果。

## 7. 阶段性开发计划

### 阶段 0：基线和工程初始化

- 建立 TypeScript workspace、构建、测试和 lint 基础。
- 固定输入输出 Schema、日期、浮点和排序规范。
- 盘点现有测试目录和 golden 文件。
- 建立阶段状态和测试覆盖矩阵。

完成门禁：工程可构建、可测试，并能读取至少一个原项目 fixture。

### 阶段 1：Kernel

- Date、Duration、DateRange
- 数值容差和比较
- 稳定 ID 和序列号
- 确定性排序
- 基础错误类型

完成门禁：日期、边界、排序和数值单元测试全部通过。

### 阶段 2：最小领域模型

- Demand、Operation、Buffer、Resource
- Flow、Load
- Calendar
- OperationPlan、FlowPlan、LoadPlan
- 实体索引和关联关系

完成门禁：模型可以由 fixture 构建并通过关系一致性检查。

### 阶段 3：Timeline 和事务

- Flow 和 Load Timeline
- 增量累计状态
- 命令日志
- 嵌套 bookmark、commit 和 rollback

完成门禁：随机操作序列与全量重算一致，事务属性测试通过。

### 阶段 4：图算法

- level
- cluster
- dependency 和层级传播

完成门禁：现有 cluster 测试及合成图测试通过。

### 阶段 5：Forecast

- 六类预测方法
- 异常值、SMAPE、标准差
- 参数优化和方法选择

完成门禁：原项目 `forecast_1` 至 `forecast_10` 的适用输出达到约定差分标准。

### 阶段 6：基础 MRP

- 无约束需求规划
- Demand 到 Operation 和 Buffer 的递归求解
- 基础 OperationPlan、FlowPlan 和 LoadPlan 创建

完成门禁：基础物料和工序测试达到差分标准。

### 阶段 7：完整约束

- Resource、Load 和 Calendar
- setup、skills 和 resource buckets
- alternate、routing、split 和 dependency
- material、resource 和 lead-time constraints

完成门禁：对应原项目测试集达到差分标准。

### 阶段 8：修复、清理和增量求解

- Forward
- Backward
- Delete
- heuristic2
- 增量求解和回滚

完成门禁：deletion、heuristic2、WIP、pegging 等测试达到差分标准。

### 阶段 9：并行和性能

- Piscina Worker 池
- cluster 调度
- 紧凑模型和序列化优化
- 内存和 GC 优化

完成门禁：多 Worker 结果确定，性能和内存达到本文门槛。

### 阶段 10：最终兼容验收

- 全量适用测试运行
- 真实模型双跑
- 缺失能力和差异说明
- 性能基准报告

完成门禁：满足第 9 节定义的完成标准。

## 8. 测试验证策略

### 8.1 单元测试

- 核心包语句覆盖率目标不低于 90%。
- 核心包分支覆盖率目标不低于 85%。
- 对日期、日历、排序、Timeline、事务、图传播和预测公式分别测试。

### 8.2 属性测试

使用 fast-check 验证：

- Timeline 增量结果等于从头重算结果。
- 任意合法操作序列后 Timeline 结构有效。
- `rollback(execute(x))` 恢复初始状态。
- 重复 rollback 不产生额外变化。
- commit 后修改不会被后续 rollback 撤销。
- 相同输入的结果和排序稳定。

### 8.3 Golden 测试

复用 `E:\frepple-master\test` 下现有测试数据和 `.expect` 文件。输出先标准化成结构化表示，再按业务主键排序比较，避免 XML 属性和非业务顺序造成误报。

### 8.4 差分测试

同一输入分别运行 C++ 和 TypeScript，并比较：

- OperationPlan 数量、开始、结束、状态和关联
- FlowPlan 和 LoadPlan
- constraints 和 shortages
- pegging
- Forecast 值、方法、SMAPE 和 deviation
- cluster 和 level

ID、日期、状态和关系原则上严格一致。浮点字段使用按字段定义的绝对和相对误差，禁止用单一宽松容差掩盖算法差异。

### 8.5 性能测试

建立小型、中型和生产规模三个固定数据集，记录：

- 总规划时间
- 每个 cluster 时间
- 峰值 RSS 和 V8 heap
- GC 暂停
- OperationPlan 每秒
- Timeline 插入、移动和回滚吞吐
- Worker 数据准备和传输时间
- 单线程与多线程加速比

## 9. 最终完成标准

项目只有在以下条件全部满足时才视为达到预期：

1. 所有纳入范围的核心算法已经实现，不以调用原 C++ 求解器作为最终实现。
2. 原项目测试中与核心算法相关且适用于限定范围的测试全部纳入自动化验证。
3. 严格字段与 C++ 输出一致，浮点字段达到逐字段约定的误差标准。
4. Timeline 和事务的单元、属性及压力测试全部通过。
5. 相同输入连续运行至少 20 次结果一致。
6. Worker 数量变化不改变业务结果。
7. 单线程 TypeScript 规划时间原则上不超过 C++ 的 3 倍。
8. Worker 并行后规划时间目标不超过 C++ 的 1.5 至 2 倍。
9. 峰值内存目标不超过 C++ 的 2.5 倍。
10. 形成完整的兼容矩阵、测试报告、性能报告和已知差异说明。

性能门槛是初始目标，可在 Timeline 和单 cluster MRP 原型完成后基于真实数据重新校准，但任何调整必须记录原因和基准数据。

## 10. 执行原则

- 按阶段持续开发，不在只完成脚手架或设计后停止。
- 每个阶段必须同时交付实现、测试和差分结果。
- 优先保证行为正确和确定性，再进行并行及内存优化。
- 每次发现 C++ 隐式行为，都应补充为显式规范和回归测试。
- 不为了快速通过测试而硬编码 fixture 名称或 expected 输出。
- 不修改或破坏源项目测试数据。
- 进度以自动化测试通过情况衡量，而不是以转换文件数量衡量。

## 11. 第一轮实施目标

第一轮开发从阶段 0 至阶段 3 开始，目标是交付：

- 可构建、可测试的 TypeScript workspace
- fixture 清单和兼容矩阵
- Kernel 日期与数值语义
- 最小模型骨架
- 可验证的 Timeline
- 可嵌套回滚的事务日志
- 基于原测试数据的首个解析和差分闭环

第一轮完成后，根据测试和基准结果校准后续 MRP 转换顺序及性能目标。
