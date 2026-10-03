# 通用商品交易服务与阶段开发方案

## 1. 目标与约束

本方案在现有 enLearn 平台上建设一套通用商品交易能力，可覆盖普通商品、餐饮、零售、预约服务等场景。餐饮只是订单类型之一，不单独复制商品和订单主模型。

本方案中的“数据 URL”指项目现有统一服务入口：

```http
POST /api/service
Authorization: Bearer <token>
X-Account-Id: <account-id>
X-Request-Id: <idempotency-key>
Content-Type: application/json
```

请求体保持现有协议：

```json
{
  "serviceName": "product",
  "serviceMethod": "listItems",
  "postData": {
    "resource": "products",
    "filters": { "status": "active" },
    "page": 1,
    "pageSize": 20
  }
}
```

设计约束：

1. 页面查询和基础资料维护使用统一数据 URL 与 `BaseService` CRUD。
2. 核心业务状态不能由客户端 CRUD 直接修改，必须调用领域命令。
3. 单服务内跨表一致性使用 PostgreSQL 函数/RPC 事务。
4. 跨服务流程不使用分布式数据库事务，采用本地事务、幂等命令和 Outbox 事件。
5. 金额使用最小货币单位 `bigint`，禁止在核心交易中使用浮点数。
6. 所有数据按 `account_id` 隔离；门店、仓库等是账套内业务维度。
7. 订单、支付、钱包、积分、券和库存流水只追加或冲正，不直接覆盖历史事实。

## 2. 服务总体设计

### 2.1 第一阶段必须建设

| 服务 | 服务名 | 职责 | 主要复用 |
| --- | --- | --- | --- |
| 商品服务 | `product` | 商品、SKU、分类、价格、销售状态 | `planning_item` / `wms_item`、文件服务 |
| 订单服务 | `order` | 计价、建单、提交、取消、状态机、订单快照 | `sales_orders`、`sales_order_lines` |
| 库存服务 | `inventory` | 可售量、预占、释放、扣减、退回 | WMS 库存表 |
| 支付服务 | `payment` | 支付单、渠道适配、回调、退款、对账 | 扩展现有 Stripe 支付服务 |

### 2.2 第二阶段建设

| 服务 | 服务名 | 职责 |
| --- | --- | --- |
| 会员服务 | `member` | 会员档案、等级、钱包、积分、充值 |
| 权益服务 | `promotion` | 优惠券、功能券、促销试算、锁券、核销 |

### 2.3 暂不单独建设

- 预约：初期作为 `sales_orders.order_type = reservation` 和订单扩展字段处理；出现复杂资源排期后再拆 `reservation-service`。
- 履约：初期属于订单服务，并复用 `wms_shipment`、打印和通知；多渠道配送复杂后再拆 `fulfillment-service`。
- 客户：登录身份复用 `auth.users/public.users`，交易会员由 `member-service` 管理，不另建 customer-service。

## 3. CRUD 与命令边界

### 3.1 可以通过数据 URL 直接 CRUD

这些是配置或基础资料，仍需字段白名单、权限和 RLS：

| 服务 | 可 CRUD 资源 |
| --- | --- |
| `product` | `catalog_categories`、`catalog_products`、`catalog_skus`、`catalog_prices`、`catalog_options` |
| `inventory` | `wms_warehouse`、`wms_zone`、`wms_location`；库存余额只读 |
| `member` | `member_levels`；会员档案只允许有限字段更新 |
| `promotion` | `coupon_templates`、`voucher_templates`、促销规则草稿 |
| `order` | 仅订单备注、标签等明确允许的非核心字段；订单及明细主要只读 |
| `payment` | 支付、退款、回调和对账记录全部只读，不开放通用写 CRUD |

统一方法：

```text
listItems
createItem
updateItem
deleteItem
saveItem
```

低代码数据源示例：

```json
{
  "key": "products",
  "serviceName": "product",
  "serviceMethod": "listItems",
  "postData": {
    "resource": "catalog_products",
    "orderBy": "updated_at",
    "orderDirection": "desc"
  },
  "saveServiceName": "product",
  "saveMethod": "saveItem"
}
```

### 3.2 必须通过领域命令处理

以下操作禁止使用 `updateItem/saveItem`：

- 订单提交、改价确认、取消、关闭、支付确认、退款确认。
- 库存预占、释放、扣减、退回和盘点生效。
- 支付创建、回调入账、退款和对账差异处理。
- 余额充值、消费、退款、调账；积分发放、消费和冲正。
- 优惠券领取、锁定、核销、释放和撤销核销。

命令请求同样使用 `/api/service`，但 `serviceMethod` 是业务动作：

```json
{
  "serviceName": "order",
  "serviceMethod": "submitOrder",
  "postData": {
    "orderId": "uuid",
    "expectedVersion": 1
  }
}
```

所有写命令必须携带 `X-Request-Id`。服务端同时保存业务幂等键，不能只依赖进程内缓存。

## 4. 数据模型归属

### 4.1 商品服务

保留 `planning_item`/`wms_item` 作为物料主数据，新增销售层：

```text
catalog_categories
catalog_products
catalog_skus
catalog_prices
catalog_options
catalog_option_values
catalog_sku_option_values
```

关键关系：

- `catalog_products` 可关联 `planning_item` 或 `wms_item`。
- `catalog_skus.inventory_item_id` 可关联实际扣库存的 `wms_item`；允许为空，空值表示无库存商品。
- 商品与 SKU 分离；订单行引用 `sku_id`，并保存名称、规格、价格快照。
- `catalog_prices` 支持标准价、会员价、合同价、促销价和生效区间。

商品命令：

```text
publishProduct
unpublishProduct
resolveSellableSku
quoteProducts
```

### 4.2 订单服务

继续使用：

```text
sales_orders
sales_order_lines
```

新增或补充：

```text
order_status_history
order_adjustments
order_addresses
order_fulfillments
order_outbox
```

订单主表需要增加：

```text
order_type
order_channel
member_id
payment_status
fulfillment_status
scheduled_at
subtotal_amount
promotion_amount
coupon_amount
points_amount
wallet_amount
payable_amount
paid_amount
refunded_amount
version
submitted_at
cancelled_at
completed_at
```

订单行需要增加：

```text
product_id
sku_id
product_name_snapshot
sku_name_snapshot
options_snapshot
unit_price_amount
promotion_amount
payable_amount
fulfillment_status
version
```

订单命令：

```text
quoteOrder
createDraft
updateDraft
submitOrder
cancelOrder
confirmPayment
confirmRefund
completeOrder
```

### 4.3 库存服务

复用：

```text
wms_item
wms_inventory_balance
wms_inventory_reservation
wms_inventory_ledger
wms_warehouse
wms_location
```

补充：

```text
inventory_commands
inventory_outbox
```

`wms_inventory_reservation` 增加或规范：

```text
reservation_key
source_type
source_id
source_line_id
expires_at
consumed_at
released_at
```

库存命令：

```text
checkAvailability
reserveStock
releaseReservation
commitReservation
restoreStock
```

### 4.4 支付服务

保留当前 Stripe 能力，但把渠道实现放入适配器：

```text
PaymentProvider
  StripeProvider
  WechatPayProvider
```

新增：

```text
payment_transactions
payment_attempts
payment_callbacks
refund_records
reconciliation_batches
reconciliation_items
payment_outbox
```

支付命令：

```text
createPayment
queryPayment
handleProviderCallback
createRefund
handleRefundCallback
runReconciliation
```

支付回调必须先原样落库，再验签、去重和处理；回调接口不通过登录鉴权，但必须通过渠道签名验证。

### 4.5 会员服务

新增：

```text
members
member_levels
member_wallets
wallet_ledger
points_accounts
points_ledger
recharge_orders
member_outbox
```

钱包中现金余额和赠送余额分开记账。余额表是快照，`wallet_ledger` 是事实来源。

会员命令：

```text
registerMember
changeLevel
createRecharge
creditRecharge
consumeWallet
refundWallet
grantPoints
consumePoints
reversePoints
```

### 4.6 权益服务

新增：

```text
coupon_templates
member_coupons
coupon_locks
coupon_usages
voucher_templates
member_vouchers
voucher_redemptions
promotion_outbox
```

权益命令：

```text
calculatePromotions
issueCoupon
claimCoupon
lockBenefits
consumeBenefits
releaseBenefits
redeemVoucher
reverseRedemption
```

## 5. 核心事务流程

### 5.1 创建草稿订单

`order.createDraft` 调用数据库 RPC `commerce_create_order_draft`，在单个事务中：

1. 校验当前账套、门店和用户权限。
2. 读取并锁定所需商品/SKU版本。
3. 重新读取有效价格，禁止信任客户端金额。
4. 写入 `sales_orders`。
5. 写入 `sales_order_lines` 和商品快照。
6. 计算订单汇总金额。
7. 写入初始状态历史。
8. 提交事务并返回订单、明细和版本号。

明细校验失败时主表必须回滚。现有 `execute_dynamic_crud` 可继续支持后台主子表维护，但消费者建单使用专用 RPC。

### 5.2 提交订单

提交订单涉及订单、权益和库存三个领域，不使用跨库长事务：

1. `order.submitOrder` 在订单本地事务中锁定订单行 (`FOR UPDATE`)。
2. 校验订单为 `draft` 且版本匹配。
3. 调用权益服务锁券/积分，使用 `order_id` 作为幂等业务键。
4. 调用库存服务预占，使用 `order_id + line_id` 作为预占键。
5. 任一步失败，释放已经成功的外部锁定。
6. 全部成功后，订单事务写 `submitted`、权益/库存引用和 Outbox 事件。
7. 返回支付所需订单摘要。

第一期服务均部署在同一代码库和数据库时，可以由一个受控数据库 RPC 原子完成订单、库存预占；权益上线后改为 Saga 编排，但保持命令接口不变。

### 5.3 支付成功

1. 回调原文插入 `payment_callbacks`，渠道事件号唯一。
2. 验签并查找 `payment_transactions`。
3. `payment_apply_callback` 在事务中锁定支付单，检查金额、币种、商户号和状态。
4. 将支付单更新为成功并写支付 Outbox。
5. Outbox 消费者调用 `order.confirmPayment(paymentId)`。
6. 订单服务事务锁定订单，累计实付金额并转换支付状态。
7. 库存服务提交预占；失败进入可重试任务，不回滚已经被渠道确认的支付事实。

### 5.4 取消订单

1. 订单服务锁定订单并校验是否允许取消。
2. 未支付订单：写取消状态与 Outbox，释放库存和权益。
3. 已支付订单：先进入 `cancelling`，创建退款单。
4. 退款成功回调后，订单转为 `cancelled/refunded`，再释放或退回库存、返还权益。

### 5.5 钱包支付

`member.consumeWallet` 在单个数据库事务中：

1. 按 `member_id` 锁定钱包行。
2. 检查幂等业务号 `order:<order-id>`。
3. 按约定顺序扣现金余额和赠送余额。
4. 插入不可变钱包流水。
5. 更新钱包快照和版本号。
6. 写 Outbox，返回扣款分摊结果。

订单服务只保存钱包支付结果引用，不直接更新会员钱包表。

### 5.6 券核销

1. 下单提交时锁券，记录失效时间和订单号。
2. 支付成功后核销。
3. 未支付取消或超时关闭时释放。
4. 已退款是否退券由券模板规则决定，执行冲正记录，不能删除原核销记录。

## 6. 状态机建议

### 6.1 订单状态

```text
draft -> submitted -> awaiting_payment -> paid -> fulfilling -> completed -> closed
                     |                 |
                     +-> cancelled     +-> cancelling -> cancelled
```

订单业务状态、支付状态和履约状态分列保存：

```text
status              订单总状态
payment_status      unpaid / partial / paid / refunding / partial_refunded / refunded
fulfillment_status  unfulfilled / reserved / processing / fulfilled / returned
```

### 6.2 支付状态

```text
created -> pending -> succeeded
                  -> failed
                  -> closed
succeeded -> partial_refunded -> refunded
```

所有转换在服务端白名单中定义，并使用 `version` 做乐观并发控制。

## 7. 权限与安全

建议权限编码：

```text
commerce.product.view
commerce.product.manage
commerce.order.view
commerce.order.manage
commerce.order.cancel
commerce.order.refund
commerce.inventory.view
commerce.inventory.manage
commerce.payment.view
commerce.payment.manage
commerce.payment.reconcile
commerce.member.view
commerce.member.manage
commerce.wallet.adjust
commerce.promotion.view
commerce.promotion.manage
commerce.voucher.redeem
```

要求：

- 每张业务表开启 RLS，并强制 `account_id`。
- 商品后台 CRUD 使用允许字段清单。
- 订单金额、支付状态、钱包余额、积分余额、库存余额禁止通用更新。
- 支付密钥只存在服务端环境变量或密钥服务。
- 日志不得输出支付密钥、完整回调密文、身份证号和完整手机号。
- 手工调账、退款和核销撤销记录操作者、原因和审批引用。

## 8. 工程接入点

每个新领域服务按当前结构增加：

```text
api/src/product-service/
api/src/order-service/
api/src/inventory-service/
api/src/member-service/
api/src/promotion-service/
```

每个目录包含：

```text
app.module.ts
<name>.module.ts
<name>.service.ts
main.ts
index.ts
```

同时修改：

- `api/src/common/service-bus.ts`
- `api/src/domain-service/service-router.service.ts`
- `api/src/domain-service/app.module.ts`
- `api/src/standalone/standalone.module.ts`
- `api/src/gateway/service-gateway.controller.ts` 的错误提示
- 根目录和 `api/package.json` 的启动脚本
- 服务资源元数据、权限、RLS 和低代码页面数据源

独立 Redis 微服务是部署选项，不是第一阶段强制要求。先以 standalone 模式跑通领域边界，再按压力独立部署。

## 9. 阶段开发计划

### 阶段 0：基线与迁移链修复

目标：保证新环境可重复部署。

工作项：

- 恢复并整理 `sales_orders/sales_order_lines` 当前缺失的正式迁移。
- 盘点现网数据库与仓库迁移的差异。
- 固化金额、状态、编号、时间和审计字段规范。
- 为新增服务补充统一资源元数据和权限命名规范。
- 验证 `execute_dynamic_crud` 主子表事务及持久幂等组件。

验收：

- 空数据库可以从迁移链完整初始化。
- 销售订单主子表失败可完全回滚。
- 同一 `X-Request-Id` 同载荷只执行一次，不同载荷返回冲突。

### 阶段 1：商品与订单 MVP

目标：完成后台商品维护和不含支付的通用商品订单。

工作项：

- 新增 `product-service`、`order-service`。
- 新增销售商品层表，并关联 Item/WMS Item。
- 扩展销售订单交易字段和订单快照。
- 建立商品、SKU、价格低代码 CRUD 页面。
- 实现订单计价、建草稿、提交、取消、查询。
- 实现订单事务 RPC、状态历史和乐观锁。

验收：

- 商品/SKU/价格可通过统一数据 URL 管理。
- 客户端篡改单价时，服务端仍按有效价格建单。
- 任一明细失败时订单整体回滚。
- 已提交订单不能通过 CRUD 改金额或状态。

### 阶段 2：库存闭环

目标：订单与现有 WMS 库存打通。

工作项：

- 新增 `inventory-service`。
- 实现库存查询、预占、释放、确认扣减、退回。
- 订单提交、取消、完成接入库存命令。
- 增加预占超时释放任务。
- 增加库存幂等命令与并发测试。

验收：

- 并发下单不会产生负可用库存。
- 重复提交不会重复预占或扣减。
- 取消和超时能正确释放预占。
- 库存余额可由流水重算核对。

### 阶段 3：支付、退款与对账

目标：形成订单收款闭环。

工作项：

- 重构现有 `payment-service` 为渠道适配器架构。
- 建立支付单、回调、退款和对账表。
- 接入首个支付渠道；Stripe 保持兼容，微信支付可作为目标渠道。
- 实现回调验签、去重、支付确认 Outbox。
- 实现全额/部分退款和日对账。

验收：

- 重复、乱序回调不会重复入账或倒退状态。
- 支付金额或币种不一致时拒绝入账并告警。
- 支付成功后订单最终一致转为已支付。
- 退款、订单累计退款金额和渠道账单可以核对。

### 阶段 4：会员钱包与积分

目标：增加会员账户和储值支付能力。

工作项：

- 新增 `member-service`。
- 建立会员、等级、钱包、积分和充值订单表。
- 实现充值到账、余额消费、退款和调账事务。
- 订单支持钱包与外部支付组合支付。
- 建立钱包/积分日核对任务。

验收：

- 高并发扣款不透支、不重复扣款。
- 钱包余额等于流水汇总。
- 充值只在支付成功后到账一次。
- 退款按原现金/赠送余额分摊返还。

### 阶段 5：优惠券与功能券

目标：增加通用权益和促销闭环。

工作项：

- 新增 `promotion-service`。
- 建立券模板、用户券、锁定、核销和冲正表。
- 接入订单优惠试算、提交锁券、支付核销、取消释放。
- 实现功能券扫码/码值核销及撤销。

验收：

- 同一张券不能被两个订单同时使用。
- 重复核销保持幂等。
- 取消和退款按规则释放或返券。
- 订单优惠分摊可以追溯到订单行和权益记录。

### 阶段 6：生产加固与可选扩展

目标：满足生产运行和复杂场景。

工作项：

- Outbox 重试、死信、告警和管理页面。
- 支付、库存、钱包、积分、券的自动对账。
- 审计日志、指标、链路追踪和容量测试。
- 按需要增加预约、配送、POS、第三方平台和独立微服务部署。

验收：

- 可定位每笔订单从建单到支付、履约、退款的完整链路。
- Outbox 重试不造成重复业务结果。
- 核心接口具备并发、故障恢复和回归测试报告。

## 10. 审核决策点

开始编码前需要确认以下决策：

1. 商品销售层采用 `catalog_products/catalog_skus`，并关联现有 Item；已确认。
2. 金额是否统一使用最小货币单位 `bigint`；建议采用。
3. 第一个支付渠道是 Stripe、微信支付还是模拟支付；不影响公共接口。
4. 第一阶段允许无库存商品；已确认。需要库存的 SKU 在阶段 2 接入库存闭环。
5. 不支持多门店，不增加 `store_id`；已确认。
6. 预约作为 `sales_orders.order_type = reservation`；已确认，暂不拆独立服务。
7. 新服务是否立即独立进程部署；建议先 standalone，稳定后按负载拆分。

## 11. 本轮建议审核范围

建议先批准阶段 0 至阶段 2：

```text
迁移链修复
  -> 商品服务
  -> 订单服务
  -> 库存服务
```

这一范围可以先形成“商品维护、订单创建、库存预占与取消”的完整可测试骨架。支付、会员和权益依赖该骨架，但不阻塞前两阶段的数据模型和接口设计。
