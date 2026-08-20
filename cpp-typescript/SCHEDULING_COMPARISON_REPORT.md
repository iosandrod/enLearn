# frePPLe C++ 与 TypeScript 普通排产能力 95% 验收结论

## 1. 验证结论

本轮以 frePPLe 原生 C++ 排产引擎为基准，完成六阶段共 25 个专项功能场景，并与既有 6 个行业场景、5 个极值/边界场景和 4 个普通排产强化场景合并进行端到端自动差分验证。40 个场景共覆盖 626 条需求、121 种物料、124 个缓冲、196 道操作、64 个资源、128 个负载关系、258 个物流关系、6 种技能和 10 个换型矩阵。

两套算法最终均生成 1,649 条 operation plan 和 602 条需求交付记录。差分除原有计划结构和需求交付外，还覆盖 batch、order type、具体计划依赖、操作/资源/setup/总成本、问题列表、库存曲线和资源利用率。40 个场景连续执行两轮全量差分均全部一致，差异总数为 0。

在本报告定义的普通 MRP、采购、配送和生产排产范围内，当前 TypeScript 算法能力评估达到约 95%，可以用于普通排产；40 个验收模型的输出与本次使用的 frePPLe 原生 C++ 算法完全一致。这里的 95% 是明确限定范围后的工程能力评估，不代表完整 frePPLe Python 扩展、Web UI、预测、优化器和插件生态达到 95%。

## 2. 验证环境与方法

- 验证日期：2026-08-20
- 工作目录：`E:\frepple-master`
- TypeScript 工程：`E:\frepple-master\cpp-typescript`
- PostgreSQL：`postgresql://postgres:***@127.0.0.1:5432/frepple`
- 数据库 schema：`codex_schedule_diff`
- 原生基准：frePPLe C++ 9.18 开发运行镜像，通过同一模型生成的 XML 调用原生求解器
- TypeScript 算法：编译后的 `dist` 模型和 `SolverCreate` 求解器
- 时间环境：两套执行路径统一使用 `TZ=EST`，避免时区序列化差异

每个场景均串行执行以下过程，避免共享数据库 schema 的 truncate 和写入相互干扰：

1. 从同一份场景模型生成原生 frePPLe XML 和 TypeScript 对象模型。
2. 使用相同的当前日期、需求、工艺、物料、资源、技能、换型规则及求解参数运行两套算法。
3. 对输出进行确定性排序，并规范化为相同的 JSON 结构。
4. 对 operation plan 和 demand delivery 结果进行递归逐字段比较，最多保留前 100 项差异用于诊断。
5. 将场景输入、两套完整结果和差分结果写入 PostgreSQL。

最终结论来自两次设置 `FREPPLE_SCENARIO=all` 的 40 场景连续全量运行，而不是各单场景运行结果的人工拼接。两轮均得到 40 个一致场景、1,649 条 operation plan、602 条交付和 0 项差异。

## 3. 场景与输入规模

| 场景 | 行业/边界类型 | 需求 | 物料/缓冲 | 操作 | 资源 | 负载 | 物流 | 技能 | 换型矩阵 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `automotive_mixed_model` | 汽车整车制造 | 48 | 7 | 20 | 7 | 16 | 20 | 1 | 2 |
| `electronics_high_mix` | 电子装配 | 60 | 8 | 16 | 8 | 20 | 28 | 1 | 1 |
| `pharma_batch_release` | 制药批生产 | 36 | 8 | 15 | 7 | 12 | 15 | 1 | 2 |
| `food_fresh_batches` | 食品饮料 | 72 | 12 | 8 | 3 | 12 | 28 | 0 | 1 |
| `aerospace_mro` | 航空维修 MRO | 30 | 7 | 15 | 10 | 12 | 12 | 3 | 1 |
| `packaging_campaigns` | 快消包装 | 80 | 10 | 8 | 3 | 12 | 20 | 0 | 1 |
| `boundary_peak_load` | 高峰负载边界 | 180 | 8 | 12 | 2 | 12 | 24 | 0 | 1 |
| `boundary_lot_split` | 批量与拆单边界 | 10 | 1 | 2 | 0 | 0 | 1 | 0 | 0 |
| `boundary_time_capacity` | 时间与产能边界 | 12 | 4 | 8 | 1 | 4 | 8 | 0 | 0 |
| `boundary_unconstrained` | 无约束极值边界 | 5 | 4 | 6 | 1 | 3 | 9 | 0 | 0 |
| `boundary_solver_modes` | 求解参数模式边界 | 12 | 2 | 2 | 1 | 1 | 3 | 0 | 0 |
| **原有场景小计** | **11 个场景** | **545** | **71** | **112** | **43** | **104** | **168** | **6** | **9** |

六阶段新增 25 个专项场景另包含 65 条需求、42 种物料、45 个缓冲、71 道操作、16 个资源、18 个负载关系、75 个物流关系和 1 个换型矩阵。4 个普通排产强化场景另包含 16 条需求、8 种物料、8 个缓冲、13 道操作、5 个资源、6 个负载关系和 15 个物流关系。全量合计为 40 个场景、626 条需求、121 种物料、124 个缓冲、196 道操作、64 个资源、128 个负载关系、258 个物流关系、6 种技能和 10 个换型矩阵。

## 4. 六阶段功能补充

| 阶段 | 场景 | C++ plans | TS plans | C++/TS 交付 | 差异 |
|---|---|---:|---:|---:|---:|
| 第一阶段 | `operation_split_ratio` | 4 | 4 | 1 / 1 | 0 |
| 第一阶段 | `dependency_hard_soft_leadtime` | 3 | 3 | 1 / 1 | 0 |
| 第一阶段 | `demand_group_alltogether` | 4 | 4 | 2 / 2 | 0 |
| 第一阶段 | `demand_group_inratio` | 6 | 6 | 3 / 3 | 0 |
| 第二阶段 | `purchase_supplier_effectivity` | 6 | 6 | 2 / 2 | 0 |
| 第二阶段 | `purchase_resource_capacity` | 10 | 10 | 5 / 5 | 0 |
| 第二阶段 | `distribution_multilocation` | 11 | 11 | 3 / 3 | 0 |
| 第三阶段 | `calendar_shift_shutdown` | 6 | 6 | 3 / 3 | 0 |
| 第三阶段 | `calendar_dst_overlap` | 4 | 4 | 2 / 2 | 0 |
| 第三阶段 | `bucketized_capacity` | 9 | 9 | 4 / 4 | 0 |
| 第三阶段 | `bucketized_percentage_load` | 8 | 8 | 3 / 3 | 0 |
| 第四阶段 | `transfer_batch_routing` | 16 | 16 | 3 / 3 | 0 |
| 第四阶段 | `mto_batch_isolation` | 9 | 9 | 4 / 4 | 0 |
| 第四阶段 | `alternate_mincost_penalty` | 12 | 12 | 3 / 3 | 0 |
| 第四阶段 | `timeper_lot_size` | 11 | 11 | 4 / 4 | 0 |
| 第五阶段 | `confirmed_approved_orders` | 8 | 8 | 3 / 3 | 0 |
| 第五阶段 | `partial_completed_order` | 8 | 8 | 3 / 3 | 0 |
| 第五阶段 | `locked_setup` | 8 | 8 | 3 / 3 | 0 |
| 第五阶段 | `operationplan_dependency` | 7 | 7 | 2 / 2 | 0 |
| 第六阶段 | `operationplan_creation_merge` | 5 | 5 | 3 / 3 | 0 |
| 第六阶段 | `operationplan_merge_guards` | 8 | 8 | 4 / 4 | 0 |
| 第六阶段 | `buffer_minimum_excess` | 3 | 3 | 1 / 1 | 0 |
| 第六阶段 | `buffer_maximum_excess` | 3 | 3 | 1 / 1 | 0 |
| 第六阶段 | `calendar_minmax_excess` | 7 | 7 | 2 / 2 | 0 |
| 第六阶段 | `command_scoped_excess` | 3 | 3 | 1 / 1 | 0 |
| **专项合计** | **25 个场景** | **179** | **179** | **66 / 66** | **0** |

第一阶段对齐 split 子操作比例与 effectivity、软/硬安全提前期、需求组 alltogether 的事务回滚和同步重排、inratio 单轮比例交付。第二阶段对齐供应商生效期、采购批量和收货资源容量、多地点多级配送，并补齐自动生成 `OperationItemSupplier` 的产出 flow、资源 load、硬安全提前期和采购订单类型。

第三阶段对齐工序/地点/资源日历交集、停产窗口、DST 春季跳时与秋季重叠，以及 bucketized 资源容量和 percentage load。第四阶段对齐 transfer batch routing、MTO batch 隔离、`MINCOSTPENALTY` 选择及回滚重排、`OperationTimePer` 固定加单位工时与批量边界。第五阶段对齐 confirmed/approved 锁定供给、部分完工数量、setup override 和相邻换型、静态操作依赖到具体 operation plan 依赖的分配。

第六阶段对齐 fixed-time 计划在创建阶段的合并条件、严格 `sizeMaximum` 边界，以及 fixed quantity flow 和 default resource 对计划合并的保护。库存清理部分覆盖固定 minimum、固定 maximum、动态 minimum/maximum calendar 和 command manager 事务范围，验证 maximum 不会被错误当成补货需求、冗余 proposed 供给会被清理、approved/confirmed 计划会保留。删除 routing 子操作计划时按 C++ 语义删除 top owner tree；Native 和 TypeScript 两端还统一使用 `erasePreviousFirst`，避免差分入口参数不对称。

## 5. 行业覆盖

### 5.1 汽车整车制造

覆盖多车型混线、焊装-涂装-总装三段 routing、备用焊装线、车型和颜色换型、装配技能资源池、有限钢材/动力总成/电子套件，以及最小和最大批量约束。

### 5.2 电子装配

覆盖高混低量订单、快速和标准备用工艺、备用 SMT 线、稀缺高端芯片、ICT 检测技能、回流焊温区换型和整数批量。优先工艺不可行时需要正确回滚并选择后备工艺。

### 5.3 制药批生产

覆盖最小批量、批量倍增、最大批量、混合-成型-检验三段 routing、清场和模具换型、有限 API 和包装材料、QA 放行资质、备用成型线及行政提前期。

### 5.4 食品饮料

覆盖短交期高频需求、共享加工罐和灌装资源、配方清洗换型、有限原料、替代配方、备用罐体，以及 `plantype=2` 的求解路径。

### 5.5 航空维修 MRO

覆盖单件批量、诊断-维修-放行 routing、发动机/结构/航电多资质人员池、备用维修工位、工位工具换型、专用与通用维修备件替代，以及低产能长周期作业。

### 5.6 快消包装

覆盖 80 条高需求量订单、包装规格换型、备用转换设备、替代膜材/纸板、共享印刷人员、偶数批量，以及 `constraints=11` 的约束组合。

## 6. 新增边界覆盖

### 6.1 高峰负载边界

`boundary_peak_load` 将 180 条需求集中到 6 个交期窗口，覆盖同窗需求高峰、精确产能饱和、备用设备、替代物料、换型传播、高优先级跨度和较高迭代上限。该场景是本轮规模最大的单场景，产生 351 条 operation plan 和 174 条交付。

### 6.2 批量与拆单边界

`boundary_lot_split` 覆盖零需求、舍入误差上下界、最小批量、最大批量、多次拆单、小数数量，以及最小发运量等于或大于单批上限。其中包含“需求 20、最小发运 7、单批上限 7”的临界组合，原生与 TypeScript 均接受两个数量为 7 的交付，并按原算法规则不接受余下的 6。

### 6.3 时间与产能边界

`boundary_time_capacity` 覆盖零秒工时、一秒工时、当前时刻、产能精确等于上限、零最大延期、2030 年日期上限和超长工艺；同时以 `lazyDelay=1`、`minimumDelay=0` 验证最小时间推进。

### 6.4 无约束极值边界

`boundary_unconstrained` 使用 `constraints=0`，覆盖零库存、零产能、大数量需求、`closed`/`canceled` 需求过滤、quote 排序和无约束单次扫描。该场景验证无约束模式不会错误沿用有限物料或有限产能的拒绝语义。

### 6.5 求解参数模式边界

`boundary_solver_modes` 同时使用 `algorithm=heuristic_2`、`plantype=3`、紧迭代上限、资源迭代上限、迭代精度边界、精确物料和精确产能，验证非默认求解模式及参数组合。

## 7. 求解参数覆盖

所有时间参数单位均为秒，表中 `-` 表示使用场景未显式覆盖的默认值。

| 场景 | plantype | algorithm | constraints | lazyDelay | minimumDelay | iterationMax | resourceIterationMax | rotateResources |
|---|---:|---|---:|---:|---:|---:|---:|---|
| 汽车整车制造 | 1 | 默认 | 15 | 43,200 | 3,600 | - | - | `true` |
| 电子装配 | 1 | 默认 | 15 | 21,600 | 1,800 | - | - | `false` |
| 制药批生产 | 1 | 默认 | 15 | 172,800 | 14,400 | - | - | 默认值 |
| 食品饮料 | 2 | 默认 | 15 | 10,800 | 900 | - | - | `true` |
| 航空维修 MRO | 1 | 默认 | 13 | 86,400 | 7,200 | - | - | `false` |
| 快消包装 | 1 | 默认 | 11 | 14,400 | 1,800 | - | - | `true` |
| 高峰负载 | 1 | 默认 | 15 | 1,800 | 60 | 400 | 800 | `true` |
| 批量与拆单 | 1 | 默认 | 15 | 3,600 | 1 | 64 | 64 | `false` |
| 时间与产能 | 1 | 默认 | 15 | 1 | 0 | 32 | 256 | `false` |
| 无约束极值 | 1 | 默认 | 0 | 1 | 0 | 8 | 1 | `true` |
| 求解参数模式 | 3 | `heuristic_2` | 15 | 60 | 0 | 16 | 16 | `true` |

此外，制药场景使用 86,400 秒行政提前期；求解参数模式场景显式设置 `iterationAccuracy=100` 和 `iterationThreshold=0`。测试组合覆盖约束开启/关闭、不同 plan type、不同约束位组合、惰性延期 1 秒至 2 天、最小延期 0 秒至 4 小时、资源轮转开关及紧/宽迭代上限。

## 8. 排产结果

| 场景 | C++ operation plans | TS operation plans | C++ 交付 | TS 交付 | 差异数 | 结论 |
|---|---:|---:|---:|---:|---:|---|
| 汽车整车制造 | 168 | 168 | 33 | 33 | 0 | 完全一致 |
| 电子装配 | 186 | 186 | 60 | 60 | 0 | 完全一致 |
| 制药批生产 | 185 | 185 | 36 | 36 | 0 | 完全一致 |
| 食品饮料 | 152 | 152 | 72 | 72 | 0 | 完全一致 |
| 航空维修 MRO | 154 | 154 | 30 | 30 | 0 | 完全一致 |
| 快消包装 | 167 | 167 | 80 | 80 | 0 | 完全一致 |
| 高峰负载边界 | 351 | 351 | 174 | 174 | 0 | 完全一致 |
| 批量与拆单边界 | 11 | 11 | 10 | 10 | 0 | 完全一致 |
| 时间与产能边界 | 20 | 20 | 10 | 10 | 0 | 完全一致 |
| 无约束极值边界 | 6 | 6 | 3 | 3 | 0 | 完全一致 |
| 求解参数模式边界 | 25 | 25 | 12 | 12 | 0 | 完全一致 |
| **原有场景小计** | **1,425** | **1,425** | **520** | **520** | **0** | **完全一致** |

叠加六阶段 25 个专项场景和 4 个普通排产强化场景后，全量合计为 C++ / TypeScript 各 1,649 条 operation plan、各 602 条交付，差异数仍为 0。强化场景分别覆盖 hard routing posttime、`heuristic_2` 前推修复、autofence 临时短缺和 `erasePreviousFirst=false` 增量锁定重排。

交付记录少于需求总数是场景约束和需求状态共同作用的结果，例如有限零部件、最大延期、零需求以及 `closed`/`canceled` 过滤。原生与 TypeScript 在每个场景中的已排和未排结果均一致，不是 TypeScript 漏排。

## 9. 扩展差分字段

每条 operation plan 比较以下字段：

- `operation`：操作名称
- `demand`：关联需求
- `quantity`：计划数量
- `start`、`end`：开始和结束时间
- `ownerOperation`：父计划操作
- `status`：计划状态
- `feasible`：可行性标志
- `setupSeconds`、`setupEnd`：换型时长和换型结束时间
- `resources`：分配资源集合
- `materials`：物料缓冲、发生日期和数量
- `batch`：MTO、在制订单和转运计划批次
- `orderType`：MO、PO、DO、DLVR 等订单类型
- `operationCost`、`resourceCost`、`setupCost`、`totalCost`、`setupPenalty`：计划级成本

需求交付比较 `demand`、`quantity`、`end`、`batch`、`orderType` 和计划键。此外比较以下独立结果集：

- `dependencies`：前置/后置具体计划、依赖数量、操作名称和 blocked-by 名称
- `problems`：问题类型、描述、起止时间、实体、owner 和 feasible
- `inventoryProfiles`：buffer、buffer batch、日期、变动数量、onhand、计划键和订单类型
- `resourcePlans`：资源时间桶的 available、load、unavailable、setup、free、confirmed load 和 utilization
- `costSummary`：全局操作成本、资源成本、setup 成本、总成本和 setup penalty

40 个场景在以上完整 JSON 结构上的递归差异数均为 0。两端汇总还同时得到 4 条具体计划依赖、64 条问题、2,326 个库存曲线点、6,793 个资源利用率桶和总成本 185,704.248，所有数值完全一致；其中操作成本 184,696.248、资源成本 1,008、setup 成本 8,037。

## 10. PostgreSQL 持久化核验

最终数据库统计如下：

| 表 | 记录数 | 含义 |
|---|---:|---|
| `codex_schedule_diff.scenario` | 40 | 25 个六阶段专项、6 个行业、5 个边界和 4 个普通排产强化场景的完整 JSON 模型 |
| `codex_schedule_diff.run_result` | 80 | 每个场景各一份 native 和 TypeScript 完整结果 |
| `codex_schedule_diff.comparison` | 40 | 每个场景一条自动差分结论 |

数据库汇总结果为：

```text
native:     operation_plans = 1649, deliveries = 602
typescript: operation_plans = 1649, deliveries = 602
comparisons with identical=false or nonempty difference = 0
```

40 条 comparison 记录均满足：

```text
identical = true
jsonb_array_length(difference) = 0
```

## 11. 对齐过程中修复的语义差异

本轮依据 C++ 原算法行为修复 TypeScript 执行语义，而非修改比较器、提高失败场景迭代上限或缩小测试数据：

1. 对齐资源容量、备用资源和 setup 时间线，保证负载分配及换型传播顺序一致。
2. 对齐物料不足、替代物料和递归补货后的 feasible 判定。
3. 在 autocommit 模式下按需求及时提交已接受计划，使 feasible 状态的捕获时机与原生算法一致。
4. 将最大延期循环边界修正为严格小于最后允许日期，避免边界日期额外创建未来交付。
5. 为 TypeScript 通用 `Operation` 适配器补充保留未修改日期端点的行为，避免单端日期更新重置另一端。
6. 对齐 finite buffer 在无约束或库存充足时返回 `infiniteFuture` 的“无下一受限日期”语义。
7. 对齐 flow effective-end 的截断规则，避免 TypeScript 在 C++ 不截断的路径提前结束搜索。
8. 将 `hasOperationPlans` 修正为只检查当前 command manager 中待提交、无需求关联且非分销单的 operation plan，不再扫描全局计划集合。
9. 对齐 `SolverCreate::checkOperation` 的最终回复日期：材料不完整时返回材料下一可用日期，完整回复时返回 `infiniteFuture`，而不是 operation plan 的结束时间。
10. 移植 demand 的 best-answer 逻辑：当接受当前批次会使余量低于最小发运量时，先事务回滚并保留最佳回复；超过延期边界后再按 C++ 逻辑重建可接受批次。
11. 补齐采购操作自动构造：按 `ItemSupplier` 的 lead time、批量、成本、effectivity、hard safety lead time 和 receiving resource 自动生成采购 operation、产出 flow 与资源 load。
12. 补齐 split、需求组、日历交集与 DST、bucketized、transfer batch、MTO batch、time-per、锁定/部分完成订单和 operation plan dependency 的 C++ 分支语义。
13. 对齐 `Demand::getDelivery()` 的次级排序、alltogether 重试日期、operation alternate 的 `ALT` order type、容量问题类型字符串和 C++ 码点排序/六位有效数字格式。
14. 修复 setup 时长比较中的 C++ `Duration(double)` 整秒取整语义。高混电子场景中 `3272.727...` 秒在 C++ 赋值给 `Duration` 后为 `3273` 秒；TypeScript 现在同样先构造 `Duration` 再比较，避免误判 setup 未完成并错误清零计划数量。
15. 对齐 `OperationFixedTime` 的创建阶段计划合并语义：仅在 C++ 允许的日期、批次、需求、状态和严格批量上限条件下合并，并为 fixed quantity flow 与 default resource 保留禁止合并条件。
16. 对齐 excess 判定和清理：固定及日历 minimum/maximum 使用相同时间线语义；maximum 回落后的供给可成为 excess，但 maximum 高值区间本身不创建需求。
17. 对齐计划删除状态和 owner tree：默认仅删除 proposed，approved/confirmed 保留；从 routing child operation 发起删除时删除整个 top owner tree。
18. 统一 Native 与 TypeScript 的 `erasePreviousFirst` 默认值及场景覆盖值，并使 command-scoped 清理先处理活动命令、再执行 cluster-wide proposed 供给清理。
19. 修复差分 worker 的 ESM 循环初始化竞态：先加载稳定的 buffer 根模块，再按固定顺序加载模型模块，消除 `OperationItemDistribution extends OperationFixedTime` 在并发动态导入下的偶发提前求值。20 次独立 worker 进程冒烟和当时两轮 36 场景全量差分均未复现；本轮扩展后的两轮 40 场景全量差分同样未复现。
20. 对齐 `heuristic_2` backward sweep：`SolverData::propagate=false` 只跳过上游物料传播，不能跳过 operation capacity 检查；修复后重复前推/后推扫掠与 C++ 均产生 15 条计划且无重叠差异。
21. 修复原生差分入口的字段名为 metadata 认可的 `erasePreviousFirst`。此前全小写字段会被原生 Python 层当作自定义 property，导致原生仍采用默认值并错误删除已有 proposed 计划。
22. 通用 `Operation` TypeScript 适配器在只移动开始或结束端点时保留当前工期，使 OperatorForward 的依赖传播、回滚夹具与 C++ 的单端点移动语义一致。

第 9、10 项直接覆盖了“需求 20、最小发运 7、单批上限 7”的拆单临界情况。修复前 TypeScript 将成功回复日期错误设置为当前计划结束时间，导致每小时无效重试并触发场景原有的 `iterationMax=64`；修复后算法直接使用 C++ 的下一日期语义，进入 best-answer 重建并得到两个数量为 7 的交付。测试参数和迭代上限均未为绕过问题而放宽。

## 12. TypeScript 转换工程验收

转换工程继续满足一对一外形约束：

- 原始 `.cpp` 文件：57 个
- TypeScript `.ts` 文件：57 个
- 文件名映射：通过
- 文件数量：通过
- TypeScript 行数不少于对应 C++ 文件：通过
- 类模型：通过
- 公共接口：通过
- 语义差分夹具：通过

最终执行并通过：

```powershell
npm run build
node scripts/test.mjs
node scripts/verify.mjs all
node scripts/compare-scheduling.mjs
```

验收结果：

```text
Semantic differential fixtures passed.
Verification 'all' passed for 57 source and 57 target files.
40/40 scheduling scenarios identical in two consecutive full runs.
Native/TypeScript totals: 1649 operation plans, 602 deliveries.
PostgreSQL comparison differences: 0.
```

本次最终复验中 `npm test` 还修正了两个夹具前提：给裸 `ItemSupplier` 补上 C++ 要求的 mandatory supplier；对于最大容量为 0 且 horizon 内没有可用容量的资源，期望重试日期按原生逻辑为 `Date::infiniteFuture`。两项均是测试夹具对现有 C++ 语义的校正，不是放宽生产差分。

## 13. 适用边界与后续回归

本次结果证明当前 TypeScript 移植在用户指定六阶段、6 个行业场景、5 个高强度边界场景、4 个普通排产强化场景及所列参数组合下与 frePPLe C++ 基准逐字段一致，但不构成对 frePPLe 所有实体、所有输入或所有插件扩展的数学等价证明。新增模型类型、更深层 BOM/routing、组合日历、冻结区策略或新的求解参数时，仍应补充对应的原生/TypeScript 自动差分场景。

`scripts/compare-scheduling.mjs` 应继续作为发布前回归入口，并保留 PostgreSQL 运行结果作为可审计基线。任何求解器变更至少应执行语义夹具、57 文件外形验收和 40 场景串行全量差分；边界场景不应通过按场景特殊处理、提高迭代上限、降低比较字段或放宽差分规则来获得通过。

## 14. 最终结论

当前 TypeScript 排产算法已经完成本轮指定六阶段及普通排产强化补充，并可处理本轮覆盖的多行业复杂数据和扩大后的排产边界。40 个设计场景的计划结构、数量、时间、batch、order type、依赖、资源、物料、换型、成本、问题、库存曲线、利用率和需求交付均与 frePPLe 原生 C++ 算法完全一致；两端各产生 1,649 条 operation plan 和 602 条交付，PostgreSQL 中 40 条 comparison 的差异数组均为空。连续两轮全量运行结果一致，构建、语义夹具和 57 文件外形验收全部通过。

据此，当前 TypeScript 算法在“普通 MRP + 采购 + 配送 + 生产排产”的约定范围内达到约 95% 的工程能力目标，并达到可用、可审计和可持续回归的验收状态。该百分比是基于已覆盖实体、求解路径和全量差分场景的能力评估，不是未覆盖输入空间的数学等价率，也不宣称完整 frePPLe Python API、forecasting、optimization、Web UI、数据库加载任务及第三方插件生态达到 95%。
