# 精简 WMS 核心结构

本方案使用 6 张核心表，按用户指定复用 `public.item` 作为物料主数据，不新建物料表，也不使用排产模块的 `planning_item`。所有 `item_id` 使用 `(account_id, item_id)` 复合外键关联已有物料，不能引用其他账套的物料。物料编码、名称和单位沿用 `item` 的实际字段，不在 WMS 中复制主数据。

建表及过账函数：[wms-core-schema.sql](wms-core-schema.sql)。本次交付数据库核心建表稿，不包含菜单、低代码页面、Nest 服务注册或外部系统同步。

当前项目配置连接的数据库已有完整版 `wms_*` 表，但未查到 `public.item`。因此本稿不放入自动迁移目录、不在现有数据库执行，也不删除或覆盖已有 WMS。SQL 采用普通 `create table`，遇到同名表会失败并回滚，不能静默复用结构不同的旧表。实际部署前需确认 `item` 所在数据库、主键类型和账套字段，再制定旧 WMS 的数据兼容方案。

## 命名及公共字段

- 表名：`wms_` + 单数业务名，小写下划线；延续现有 `mes_work_order` 和 `planning_item` 的命名方式。
- 主键：`id uuid`，默认 `gen_random_uuid()`。
- 账套：`account_id uuid`，复用 `basejump.accounts`；业务编码按账套唯一，关联使用带账套的复合外键。
- 外键：`warehouse_id`、`location_id`、`item_id`、`document_id` 等，以 `_id` 结尾。
- 基础档案：`code` 编码、`name` 名称、`status` 状态、`remark` 备注。
- 数量：`numeric(30,8)`，统一使用物料基本单位；不做包装单位换算或成本核算。
- 审计：`created_by`、`updated_by`、`created_at`、`updated_at`；流水仅保留创建审计，禁止修改和删除。
- 批次：`batch text not null default ''`，不管理批次时统一为空字符串，避免 NULL 导致重复库存维度。

## 核心表及字段

| 表 | 用途 | 主要业务字段 |
| --- | --- | --- |
| `wms_warehouse` | 仓库档案 | `code`, `name`, `status`, `remark` |
| `wms_location` | 库位档案 | `warehouse_id`, `code`, `name`, `status`, `remark` |
| `wms_document` | 统一库存单据头 | `code`, `type`, `status`, `warehouse_id`, `target_warehouse_id`, `business_date`, `source_type`, `source_id`, `posted_by`, `posted_at` |
| `wms_document_line` | 库存单据明细 | `document_id`, `line_no`, `item_id`, `location_id`, `target_location_id`, `batch`, `quantity`, `expected_quantity`, `remark` |
| `wms_inventory_balance` | 当前库存余额 | `item_id`, `location_id`, `batch`, `quantity` |
| `wms_inventory_ledger` | 不可变库存流水 | `document_line_id`, `balance_id`, `quantity_change`, `quantity_before`, `quantity_after` |

仓库包含多个库位；无需精细库位管理时，给每个仓库建立一个默认库位即可。库区不单独建表。库存余额的唯一维度为 **账套 + 物料 + 库位 + 批次**；仓库通过库位取得，避免冗余仓库字段。流水通过余额取得库存维度，通过明细取得单据及来源。

每张单据同一个物料、来源库位和批次只保留一行，相同维度的输入先合并。库位不能迁移到另一仓库，余额记录不能修改维度，引用中的物料和档案不能物理删除。

## 单据类型

| `type` | 业务 | `quantity` 含义 | 库存变化 |
| --- | --- | --- | --- |
| `receipt` | 入库、退料、退货入库 | 正数 | 来源库位增加 |
| `issue` | 出库、领料、退货出库 | 正数 | 来源库位减少 |
| `transfer` | 仓库调拨或同仓移库 | 正数 | 来源库位减少，目标库位增加 |
| `count` | 盘点 | 非负实盘数量 | 实盘数量减去账面快照 |
| `adjustment` | 库存调整、期初建账 | 带符号差额，不能为零 | 正数增加、负数减少 |

只有调拨使用 `target_warehouse_id` 和 `target_location_id`；同仓移库时目标仓库等于来源仓库，库位必须不同。采购、销售、生产等业务细分通过 `source_type` 和 `source_id` 记录，不拆更多库存单据表。来源 ID 是多态业务引用，不设跨业务表外键，接入时由服务校验。

盘点明细必须携带 `expected_quantity`（盘点时账面数量）。如果过账时当前库存已经变化，则拒绝过账，重新取得账面数量并复盘；本期采用这种简化策略，不支持长时间冻结盘点或盘点期间流水补偿。

## 状态及过账

状态为 `draft`（草稿）、`posted`（已过账）、`cancelled`（已取消）。草稿可编辑、删除或取消；已过账及已取消的单据不可编辑。已过账记录更正时新建有来源说明的反向调整单，调拨撤销则建立反向调拨单。

唯一库存写入口为：

```sql
select public.wms_post_document(:account_id, :document_id);
```

调用必须携带有效认证用户，并拥有当前账套的 `wms.core.manage` 权限。服务层的账套值必须来自可信网关上下文，不能直接相信请求体；使用 service role 调用时也必须保留认证用户上下文。

函数锁定单据后，按固定库存维度顺序加锁，在同一事务内更新余额、追加流水并标记已过账。缺少明细、库存不足、库位不属于单据仓库、仓库/库位停用、盘点快照失效均整体回滚。相同已过账单据重复调用返回原单据 ID，不重复扣库存；客户端应以同一个单据 ID 重试。单据编码按账套唯一，创建重试也应复用原编码/ID。

调拨一行产生两条流水；盘点无差异时不产生流水。禁止负库存。初始库存通过调整单建立，不直接编辑余额。物料基本单位有库存或历史单据后应保持不变；后续接入物料编辑服务时需增加这一业务校验。

## 接入范围及兼容

6 张表均启用 RLS，权限复用现有 `is_active_account_member` 与 `has_account_permission`。迁移登记 `wms.core.view` 和 `wms.core.manage`，不自动给角色授权。普通认证用户可以按权限维护档案和草稿；库存余额和流水仅能读取，过账通过函数完成。

执行建表稿前需已有 `basejump.accounts`、`auth.users`、`item`（本稿假设 `id uuid`、`account_id uuid`，含 `(account_id,id)` 唯一约束）、`admin_permissions` 和现有权限函数。若 `item` 是全局物料表、主键不是 UUID 或没有账套字段，应按实际结构调整关联，不能直接执行本稿。本稿不改动物料表，也不自动应用到远端数据库。

首期没有独立的物料、批次、入库/出库头行、盘点头行、库存预留、条码、托盘、拣货、上架任务、接口日志等表，也不实现序列号、保质期、库存成本或订单预占。批次仅作为数量维度。

早期商品交易设计稿中提及的 `wms_item`、`wms_shipment`、`wms_inventory_reservation` 属于其他方案，不是本期依赖；本期商品库存物料应关联 `item`，出库引用 `wms_document` 的 `issue` 类型。那些审核稿不能直接与本建表稿一起部署；正式接入订单履约与预占时需另行调整它们。

## 验证

`api/scripts/wms-core-local-db-smoke.ts` 使用空的隔离本地 PostgreSQL 数据库；通过 `WMS_TEST_DATABASE_URL` 指定连接，运行 `node api/node_modules/tsx/dist/cli.mjs api/scripts/wms-core-local-db-smoke.ts`。脚本不会覆盖已有表，测试数据库由调用方创建并回收。

已通过 PostgreSQL 16 实测：6 表建表及过账函数、模拟 `item` 的复合外键、跨账套引用拦截、RLS、出入库/调拨/盘点/调整、重复过账、库存不足时整单回滚、并发扣减防超卖、余额与流水对账和流水不可变。测试物料表是符合本稿约定的模拟表，实际已有 `item` 的兼容性仍待核对。
