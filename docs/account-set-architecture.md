# 多账套登录与数据隔离架构

## 目标

系统采用类似用友 ERP 的“身份账号 + 业务账套”登录模型。用户先完成身份认证，再从其有权访问且处于启用状态的账套中选择本次工作上下文。账套不是浏览器传来的普通筛选条件，而是服务端验证后的安全边界。

## 核心模型

- 账套主数据复用 `basejump.accounts`，标准主键为 `account_id uuid`。
- 账套成员复用 `basejump.account_user`，角色为 `owner` 或 `member`。
- `basejump.accounts.code` 是面向 ERP 用户的账套编码，编码全局唯一。
- `status` 支持 `active`、`inactive`、`archived`；只有 `active` 可以进入。
- `account_user_preferences` 分别保存用户显式设置的默认账套、最近账套和最近登录时间。
- `account_login_events` 保存账套进入记录，便于审计。
- `admin_user_roles.account_id is null` 仅表示显式保留的平台级角色，具体 UUID 表示账套级角色。迁移通过一次性标记把升级前的既有角色归入默认制造账套；标记完成后重跑迁移不会移动后来显式创建的平台角色。

历史业务表若使用 `tenant_id text`，统一保存 `account_id::text`。新增业务表优先使用 `account_id uuid`。

## 登录流程

1. `POST /auth/signin` 验证账号密码，返回用户可访问的完整账套列表，不直接启用账套。
2. 用户在登录页搜索并选择账套。
3. `POST /auth/select-account` 再次校验成员关系和账套状态，并记录最近使用账套；登录页勾选“下次优先使用”时才更新默认账套。最近账套用于审计和当前会话恢复，不会覆盖用户显式设置的默认账套。
4. 前端保存 `enlearn_active_account_id`，后续请求自动携带 `X-Account-Id`。
5. `GET /auth/me` 恢复会话。若本地账套已停用、归档或成员关系已撤销，接口保留登录身份并返回 `accountRequired: true`，用户可重新选择其他账套。

开发环境自动登录仅在内部自动登录路径启用自动选择；人工登录仍执行完整的两阶段流程。

## 服务端边界

所有 `/api/service` 请求先经过网关：

1. 验证访问令牌。
2. 读取并校验 `X-Account-Id` UUID。
3. 校验当前用户属于该账套且账套状态为 `active`。
4. 将可信的 `userId/accountId/accountCode/accountName/accountRole` 写入 `ServiceContext`。
5. 再路由到领域服务。

业务服务不得信任请求体或 query 中的 `accountId/tenantId`。`BaseService.accountField` 会对列表、创建、更新、删除、明细替换及 `afterSave` 自动附加账套条件，并覆盖客户端提交的账套字段。

Workflow RPC 使用网关注入的 `x-tenant-id` 和认证 `userId`，不接受普通请求体冒充操作人；模型固定用户、转办、加签、抄送和通知收件人都必须属于当前账套。开发环境的一键审批测试身份仅对具备流程设计权限的用户开放，生产环境禁用。Chat WebSocket 在握手时验证 `accountId`，会话成员也必须属于当前账套。

## 前端切换

工作台顶栏显示“账套编码 + 名称”。切换账套后：

- 重新拉取账套级权限和菜单；
- 跳回工作台首页；
- 断开并清空 Chat Socket 状态；
- 清空通知列表及未读数；
- 使用 `accountId + accountEpoch` 重建布局和 KeepAlive 缓存；
- Workflow 本地草稿按账套单独存储。

本地存储只用于恢复用户选择，不作为授权凭据。服务端始终重新验证。

## 数据库防线

迁移 `20260804090000_account_set_login.sql` 提供：

- 账套字段、状态约束、默认账套和历史数据迁移；
- 账套偏好、登录历史和账套级角色；
- `is_active_account_member`、`has_account_permission` 等安全函数；
- `account_user_ids` 的批量成员校验，供 service role 和认证调用安全复用；
- 销售、Workflow、通知、聊天、角色分配和打印日志的账套 RLS；
- 默认制造账套 `00000000-0000-4000-8000-000000000001`。

RLS 是纵深防御，不能替代网关和服务层校验。使用 service role 的服务必须显式添加账套条件。

本项目当前远端数据库没有 `supabase_migrations.schema_migrations`，历史迁移也采用项目脚本直接执行。应用本迁移可运行 `pnpm --dir api db:apply-account-sets`；脚本在单事务中执行，SQL 本身可重复应用。安全回归运行 `pnpm --dir api security:verify-account-sets`。

## 验收场景

- 无账套用户不能进入工作台。
- 单账套和多账套用户均能完成两阶段登录。
- 停用、归档或非成员账套不能启用。
- 修改请求体中的 `account_id/tenant_id` 不能跨账套读写。
- 通过 ID 访问 Workflow、Chat、通知或销售数据时仍需匹配当前账套。
- 刷新页面可恢复有效账套；无效旧账套不会清空登录身份。
- 切换账套后菜单、权限、通知、聊天和页面缓存均无旧账套残留。
