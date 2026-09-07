-- Store frontend column metadata in PostgreSQL column comments.
--
-- PostgreSQL comments are text values, so each comment contains one valid JSON
-- document with this stable contract:
--   {"title":"...","type":"...","align":"...","description":"..."}
--
-- Supported frontend types: text, number, boolean, date, datetime, time,
-- duration, json, array, and enum.
-- Supported alignments: left, center, and right.
--
-- This block is intentionally catalog-driven. It covers every current column
-- on public tables, partitioned tables, views, materialized views, and foreign
-- tables, and it is safe to run again after new columns have been added.

do $migration$
declare
  v_column record;
  v_title text;
  v_type text;
  v_align text;
  v_description text;
  v_comment text;
  v_written integer := 0;
  v_expected integer;
  v_commented integer;
  v_invalid integer;

  -- Overrides are deliberately limited to names whose meaning depends on the
  -- owning table. General names are handled by the reusable dictionaries below.
  v_column_titles jsonb := $json$
  {
    "account_login_events.id": "登录事件ID",
    "account_login_events.logged_in_at": "登录时间",
    "account_user_preferences.default_account_id": "默认账套ID",
    "account_user_preferences.last_account_id": "最近账套ID",
    "account_user_preferences.last_login_at": "最近登录时间",
    "admin_entities.schema": "实体配置",
    "entity_design_columns.schema": "字段配置",
    "lowcode_form_definitions.schema": "表单结构",
    "lowcode_page_versions.schema": "页面结构",
    "lowcode_pages.schema": "页面结构",
    "prices.type": "计价类型",
    "prices.interval": "计费周期",
    "subscriptions.status": "订阅状态",
    "system_config.metadata": "扩展元数据",
    "wf_process_instance.status": "流程状态",
    "wf_task.status": "任务状态",
    "wf_timer_job.status": "定时任务状态"
  }
  $json$::jsonb;

  v_titles jsonb := $json$
  {
    "id": "ID",
    "account_id": "账套ID",
    "user_id": "用户ID",
    "created_at": "创建时间",
    "created_by": "创建人",
    "updated_at": "更新时间",
    "updated_by": "更新人",
    "deleted_at": "删除时间",
    "published_at": "发布时间",
    "published_by": "发布人",
    "started_at": "开始时间",
    "finished_at": "结束时间",
    "ended_at": "结束时间",
    "completed_at": "完成时间",
    "approved_at": "审批时间",
    "approved_by": "审批人",
    "archived_at": "归档时间",
    "read_at": "读取时间",
    "sent_at": "发送时间",
    "processed_at": "处理时间",
    "lastmodified": "最后修改时间",
    "name": "名称",
    "title": "标题",
    "code": "编码",
    "description": "说明",
    "status": "状态",
    "type": "类型",
    "category": "分类",
    "subcategory": "子分类",
    "metadata": "扩展元数据",
    "schema": "结构定义",
    "config": "配置",
    "payload": "载荷",
    "input": "输入数据",
    "output": "输出数据",
    "result": "执行结果",
    "details": "详细信息",
    "remark": "备注",
    "comment": "意见",
    "content": "内容",
    "value": "值",
    "label": "显示名称",
    "sort_order": "排序",
    "priority": "优先级",
    "quantity": "数量",
    "amount": "金额",
    "cost": "成本",
    "price": "价格",
    "active": "启用",
    "enabled": "启用",
    "disabled": "禁用",
    "visible": "可见",
    "is_system": "系统内置",
    "is_current": "当前版本",
    "is_required": "必填",
    "is_unique": "唯一",
    "is_primary_key": "主键",
    "is_enforced": "强制约束",
    "is_free": "免费",
    "is_free_gift": "免费赠品",
    "keep_alive": "页面缓存",
    "locked": "锁定",
    "editable": "可编辑",
    "constrained": "受约束",
    "lft": "树左值",
    "rght": "树右值",
    "lvl": "层级",
    "uom": "单位",
    "adi": "ADI",
    "cv2": "CV²",
    "outlier_1b": "近1期异常值",
    "outlier_6b": "近6期异常值",
    "outlier_12b": "近12期异常值",
    "lastmodified": "最后修改时间",
    "startdate": "开始时间",
    "enddate": "结束时间",
    "starttime": "开始时刻",
    "endtime": "结束时刻",
    "deliverydate": "计划交期",
    "plannedquantity": "已计划数量",
    "quantityplanned": "已计划数量",
    "periodofcover": "覆盖周期",
    "minshipment": "最小发运量",
    "maxlateness": "最大延期",
    "maxearly": "最大提前量",
    "batchwindow": "合批窗口",
    "sizeminimum": "最小批量",
    "sizemultiple": "批量倍数",
    "sizemaximum": "最大批量",
    "safetystock": "安全库存",
    "onhand": "现有库存",
    "fromsetup": "原换型",
    "tosetup": "目标换型",
    "posttime": "后处理时间",
    "processid": "进程ID",
    "logfile": "日志文件",
    "defaultvalue": "默认值",
    "latedemandcount": "延期需求数",
    "latedemandquantity": "延期需求量",
    "latedemandvalue": "延期需求金额",
    "unplanneddemandcount": "未排需求数",
    "unplanneddemandquantity": "未排需求量",
    "unplanneddemandvalue": "未排需求金额"
  }
  $json$::jsonb;

  -- Token translations provide readable titles for identifiers that do not
  -- have a table-specific or exact-name title.
  v_tokens jsonb := $json$
  {
    "account": "账套",
    "accuracy": "准确度",
    "action": "动作",
    "active": "启用",
    "actor": "操作人",
    "address": "地址",
    "age": "年龄",
    "amount": "金额",
    "applied": "应用",
    "approval": "审批",
    "approved": "审批",
    "archived": "归档",
    "arguments": "参数",
    "assigned": "分配",
    "assignee": "处理人",
    "attachment": "附件",
    "attempt": "尝试",
    "attempted": "尝试",
    "audio": "音频",
    "available": "可用",
    "avatar": "头像",
    "batch": "批次",
    "billing": "账单",
    "blockedby": "前置项",
    "booked": "已预约",
    "booking": "预约",
    "bucket": "时间桶",
    "buffer": "缓冲区",
    "business": "业务",
    "cache": "缓存",
    "calendar": "日历",
    "campus": "校区",
    "cancel": "取消",
    "canceled": "取消",
    "candidate": "候选人",
    "capacity": "容量",
    "category": "分类",
    "channel": "渠道",
    "checksum": "校验和",
    "city": "城市",
    "claimed": "认领",
    "close": "关闭",
    "code": "编码",
    "color": "颜色",
    "column": "字段",
    "comment": "意见",
    "completed": "完成",
    "compute": "计算",
    "concurrency": "并发",
    "condition": "条件",
    "config": "配置",
    "confirmed": "确认",
    "constrained": "受约束",
    "constraint": "约束",
    "consultant": "顾问",
    "contact": "联系人",
    "content": "内容",
    "conversation": "会话",
    "converted": "转化",
    "copied": "复制",
    "copies": "份数",
    "cost": "成本",
    "course": "课程",
    "created": "创建",
    "criticality": "关键度",
    "cron": "Cron",
    "currency": "币种",
    "current": "当前",
    "customer": "客户",
    "data": "数据",
    "date": "日期",
    "decision": "决策",
    "default": "默认",
    "definition": "定义",
    "delay": "延期",
    "deleted": "删除",
    "delivered": "已交",
    "delivery": "交付",
    "demand": "需求",
    "department": "部门",
    "description": "说明",
    "destination": "目的地",
    "details": "详情",
    "disabled": "禁用",
    "discount": "折扣",
    "display": "显示",
    "district": "区域",
    "doc": "单据",
    "document": "文档",
    "draft": "草稿",
    "due": "到期",
    "duration": "时长",
    "edge": "连线",
    "edit": "编辑",
    "editable": "可编辑",
    "edited": "编辑",
    "effective": "生效",
    "efficiency": "效率",
    "email": "邮箱",
    "enabled": "启用",
    "end": "结束",
    "ended": "结束",
    "english": "英语",
    "entity": "实体",
    "error": "错误",
    "event": "事件",
    "exchange": "汇率",
    "execution": "执行",
    "expires": "过期",
    "expression": "表达式",
    "external": "外部",
    "extra": "额外",
    "failure": "失败",
    "feature": "功能",
    "feedback": "反馈",
    "file": "文件",
    "finished": "结束",
    "fixed": "固定",
    "flags": "开关",
    "flowdate": "流动时间",
    "fluency": "流利度",
    "forecast": "预测",
    "formatter": "格式",
    "free": "空闲",
    "full": "完整",
    "future": "未来",
    "gift": "赠品",
    "goal": "目标",
    "grammar": "语法",
    "hard": "硬性",
    "hash": "哈希",
    "help": "帮助",
    "hidden": "隐藏",
    "hold": "挂起",
    "horizon": "计划范围",
    "hours": "时段",
    "icon": "图标",
    "id": "ID",
    "idempotency": "幂等",
    "ids": "ID列表",
    "image": "图片",
    "inbox": "站内信",
    "inclusive": "含税",
    "info": "信息",
    "initially": "默认",
    "initiator": "发起人",
    "input": "输入",
    "interval": "周期",
    "intro": "简介",
    "invoice": "开票客户",
    "invoiced": "已开票",
    "invoker": "调用者",
    "is": "是否",
    "item": "物料",
    "job": "作业",
    "joined": "加入",
    "keep": "保持",
    "key": "键",
    "label": "显示名称",
    "language": "语言",
    "last": "最近",
    "lead": "线索",
    "learning": "学习",
    "lesson": "课时",
    "level": "级别",
    "line": "行",
    "link": "链接",
    "load": "负荷",
    "local": "本币",
    "locale": "区域设置",
    "location": "地点",
    "locked": "锁定",
    "logged": "登录",
    "login": "登录",
    "lot": "批号",
    "maximum": "最大",
    "media": "媒体",
    "message": "消息",
    "metadata": "扩展元数据",
    "method": "方法",
    "mime": "MIME",
    "min": "最小",
    "minimum": "最小",
    "mode": "模式",
    "model": "模型",
    "muted": "静音",
    "name": "名称",
    "need": "需求",
    "next": "下次",
    "nickname": "昵称",
    "no": "编号",
    "node": "节点",
    "note": "备注",
    "object": "对象",
    "offset": "偏移",
    "online": "在线",
    "open": "未交",
    "opening": "开场",
    "operation": "工序",
    "operationplan": "计划订单",
    "operator": "操作员",
    "order": "订单",
    "ordered": "订购",
    "org": "组织",
    "origin": "来源地",
    "original": "原始",
    "out": "输出",
    "output": "输出",
    "owner": "所有者",
    "page": "页面",
    "parent": "父级",
    "path": "路径",
    "payer": "付款客户",
    "payload": "载荷",
    "payment": "支付",
    "percent": "百分比",
    "permission": "权限",
    "phone": "电话",
    "pinned": "置顶",
    "plan": "计划",
    "planned": "已计划",
    "policy": "策略",
    "position": "位置",
    "price": "价格",
    "pricing": "计价",
    "primary": "主",
    "printer": "打印机",
    "priority": "优先级",
    "process": "流程",
    "processed": "处理",
    "product": "产品",
    "progress": "进度",
    "project": "项目",
    "promise": "承诺",
    "prompt": "提示词",
    "pronunciation": "发音",
    "provider": "服务商",
    "published": "发布",
    "purpose": "用途",
    "qty": "数量",
    "quantity": "数量",
    "queued": "排队",
    "quiet": "免打扰",
    "rate": "比率",
    "reaction": "回应",
    "read": "读取",
    "recipient": "接收人",
    "reference": "引用编号",
    "relation": "关系",
    "released": "释放",
    "remark": "备注",
    "reply": "回复",
    "report": "报表",
    "request": "请求",
    "requested": "发起人",
    "required": "必填",
    "resource": "资源",
    "result": "结果",
    "retry": "重试",
    "returned": "退回",
    "role": "角色",
    "route": "路由",
    "row": "行",
    "run": "运行",
    "safety": "安全",
    "sale": "销售",
    "sales": "销售",
    "salesperson": "业务员",
    "scenario": "场景",
    "schedule": "调度",
    "score": "评分",
    "search": "搜索",
    "section": "章节",
    "security": "安全",
    "sender": "发送人",
    "sent": "发送",
    "session": "会话",
    "settlement": "结算",
    "setup": "换型",
    "ship": "收货客户",
    "shipped": "已发货",
    "size": "大小",
    "skill": "技能",
    "sms": "短信",
    "snapshot": "快照",
    "solver": "求解器",
    "sort": "排序",
    "source": "来源",
    "spec": "规格",
    "specialties": "专长",
    "sql": "SQL",
    "start": "开始",
    "started": "开始",
    "status": "状态",
    "storage": "存储",
    "stripe": "Stripe",
    "student": "学员",
    "subcategory": "子分类",
    "submitted": "提交",
    "suboperation": "子工序",
    "subtitle": "副标题",
    "success": "成功",
    "summary": "汇总",
    "supplier": "供应商",
    "sync": "同步",
    "system": "系统",
    "table": "表",
    "target": "目标",
    "task": "任务",
    "tax": "税",
    "teacher": "教师",
    "template": "模板",
    "terms": "条件",
    "theme": "主题",
    "time": "时间",
    "timeout": "超时",
    "timezone": "时区",
    "title": "标题",
    "token": "令牌",
    "total": "合计",
    "trade": "贸易",
    "transcript": "转写文本",
    "trial": "试听",
    "trigger": "Trigger",
    "type": "类型",
    "unavailable": "不可用",
    "unit": "单位",
    "unique": "唯一",
    "updated": "更新",
    "upload": "上传",
    "uom": "单位",
    "url": "URL",
    "user": "用户",
    "value": "值",
    "version": "版本",
    "video": "视频",
    "view": "视图",
    "visibility": "可见范围",
    "visible": "可见",
    "vocabulary": "词汇",
    "volume": "体积",
    "waitpoint": "等待点",
    "warehouse": "仓库",
    "watched": "观看",
    "weight": "重量",
    "workflow": "工作流",
    "workspace": "工作区",
    "x": "横坐标",
    "y": "纵坐标"
  }
  $json$::jsonb;

  v_descriptions jsonb := $json$
  {
    "id": "当前记录的唯一标识。",
    "account_id": "所属账套的唯一标识，用于多租户数据隔离。",
    "created_at": "记录创建时间。",
    "created_by": "创建该记录的用户标识。",
    "updated_at": "记录最后更新时间。",
    "updated_by": "最后更新该记录的用户标识。",
    "deleted_at": "记录软删除时间；为空表示未删除。",
    "published_at": "记录发布时间。",
    "published_by": "发布该记录的用户标识。",
    "metadata": "保存业务或前端扩展元数据。",
    "schema": "保存结构化的页面、表单或业务模型定义。",
    "sort_order": "控制记录在前端列表中的显示顺序。",
    "status": "记录当前业务状态。",
    "description": "记录面向用户的说明信息。",
    "remark": "记录补充备注。"
  }
  $json$::jsonb;
begin
  for v_column in
    with source_candidates as (
      select
        pages.id as page_id,
        pages.code as page_code,
        regexp_replace(
          coalesce(
            nullif(source.value ->> 'tableName', ''),
            nullif(source.value #>> '{postData,tableName}', '')
          ),
          '^public[.]',
          ''
        ) as table_name,
        case
          when replace(regexp_replace(pages.code, '-(list|edit)$', ''), '-', '_') =
               regexp_replace(
                 coalesce(
                   nullif(source.value ->> 'tableName', ''),
                   nullif(source.value #>> '{postData,tableName}', '')
                 ),
                 '^public[.]',
                 ''
               )
            then 0
          else 2
        end as source_rank
      from public.lowcode_pages pages
      cross join lateral jsonb_each(
        case
          when jsonb_typeof(pages.schema -> 'dataSources') = 'object'
            then pages.schema -> 'dataSources'
          else '{}'::jsonb
        end
      ) source
      where coalesce(
        nullif(source.value ->> 'tableName', ''),
        nullif(source.value #>> '{postData,tableName}', '')
      ) is not null

      union all

      select
        pages.id,
        pages.code,
        regexp_replace(entities.table_name, '^public[.]', ''),
        1
      from public.lowcode_pages pages
      join public.admin_entities entities on entities.page_code = pages.code
    ),
    page_targets as (
      select ranked.page_id, ranked.page_code, ranked.table_name
      from (
        select
          candidates.*,
          row_number() over (
            partition by candidates.page_id
            order by candidates.source_rank, candidates.table_name
          ) as row_rank
        from source_candidates candidates
        join information_schema.tables db_tables
          on db_tables.table_schema = 'public'
         and db_tables.table_name = candidates.table_name
      ) ranked
      where ranked.row_rank = 1
    ),
    page_nodes as (
      select pages.id as page_id, node.value, 0 as node_rank
      from public.lowcode_pages pages
      cross join lateral jsonb_path_query(pages.schema, '$.**.fields[*]') node(value)

      union all

      select pages.id, node.value, 1
      from public.lowcode_pages pages
      cross join lateral jsonb_path_query(pages.schema, '$.**.columns[*]') node(value)
    ),
    ui_hints as (
      select table_name, column_name, title, align
      from (
        select
          targets.table_name,
          nodes.value ->> 'field' as column_name,
          coalesce(
            nullif(nodes.value ->> 'label', ''),
            nullif(nodes.value ->> 'title', '')
          ) as title,
          nullif(nodes.value ->> 'align', '') as align,
          row_number() over (
            partition by targets.table_name, nodes.value ->> 'field'
            order by
              (
                coalesce(nodes.value ->> 'label', nodes.value ->> 'title')
                ~ '[^[:ascii:]]'
              ) desc,
              nodes.node_rank,
              length(coalesce(nodes.value ->> 'label', nodes.value ->> 'title')),
              targets.page_code
          ) as hint_rank
        from page_targets targets
        join page_nodes nodes on nodes.page_id = targets.page_id
        join information_schema.columns db_columns
          on db_columns.table_schema = 'public'
         and db_columns.table_name = targets.table_name
         and db_columns.column_name = nodes.value ->> 'field'
        where coalesce(
          nullif(nodes.value ->> 'label', ''),
          nullif(nodes.value ->> 'title', '')
        ) is not null
      ) ranked_hints
      where hint_rank = 1
    )
    select
      namespaces.nspname as schema_name,
      classes.relname as table_name,
      attributes.attname as column_name,
      attributes.attnotnull as is_required,
      attributes.attndims,
      types.typname as udt_name,
      types.typtype,
      types.typcategory,
      format_type(attributes.atttypid, attributes.atttypmod) as database_type,
      exists (
        select 1
        from pg_index indexes
        where indexes.indrelid = classes.oid
          and indexes.indisprimary
          and attributes.attnum = any(indexes.indkey)
      ) as is_primary_key,
      exists (
        select 1
        from pg_constraint constraints
        where constraints.conrelid = classes.oid
          and constraints.contype = 'f'
          and attributes.attnum = any(constraints.conkey)
      ) as is_foreign_key,
      hints.title as ui_title,
      hints.align as ui_align,
      case
        when designer_columns.label ~ '[^[:ascii:]]'
          then designer_columns.label
        else null
      end as designer_title,
      translated.title as translated_title
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    join pg_attribute attributes
      on attributes.attrelid = classes.oid
     and attributes.attnum > 0
     and not attributes.attisdropped
    join pg_type types on types.oid = attributes.atttypid
    left join ui_hints hints
      on hints.table_name = classes.relname
     and hints.column_name = attributes.attname
    left join public.entity_design_tables designer_tables
      on designer_tables.schema_name = namespaces.nspname
     and designer_tables.table_name = classes.relname
    left join public.entity_design_columns designer_columns
      on designer_columns.table_id = designer_tables.id
     and designer_columns.column_name = attributes.attname
    left join lateral (
      select string_agg(
        coalesce(v_tokens ->> token.part, initcap(token.part)),
        '' order by token.ordinality
      ) as title
      from unnest(string_to_array(attributes.attname, '_'))
        with ordinality as token(part, ordinality)
    ) translated on true
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p', 'v', 'm', 'f')
    order by classes.relname, attributes.attnum
  loop
    v_title := coalesce(
      nullif(v_column_titles ->> (v_column.table_name || '.' || v_column.column_name), ''),
      nullif(v_column.ui_title, ''),
      nullif(v_column.designer_title, ''),
      nullif(v_titles ->> v_column.column_name, ''),
      nullif(v_column.translated_title, ''),
      initcap(replace(v_column.column_name, '_', ' '))
    );

    v_type := case
      when v_column.typtype = 'e' then 'enum'
      when v_column.attndims > 0 or v_column.typcategory = 'A' then 'array'
      when v_column.udt_name in ('json', 'jsonb') then 'json'
      when v_column.udt_name = 'bool' then 'boolean'
      when v_column.udt_name = 'date' then 'date'
      when v_column.udt_name in ('timestamp', 'timestamptz') then 'datetime'
      when v_column.udt_name in ('time', 'timetz') then 'time'
      when v_column.udt_name = 'interval' then 'duration'
      when v_column.typcategory = 'N' then 'number'
      else 'text'
    end;

    v_align := coalesce(
      case
        when v_column.ui_align in ('left', 'center', 'right')
          then v_column.ui_align
        else null
      end,
      case
        when v_type = 'number' then 'right'
        when v_type in ('boolean', 'date', 'datetime', 'time', 'enum') then 'center'
        else 'left'
      end
    );

    v_description := coalesce(
      nullif(v_descriptions ->> v_column.column_name, ''),
      case
        when v_column.is_primary_key
          then '当前记录的唯一标识。'
        when v_column.is_foreign_key
          then '关联“' || v_title || '”对应记录的唯一标识。'
        when v_type = 'boolean'
          then '用于标识“' || v_title || '”是否成立。'
        when v_type = 'number'
          then '记录“' || v_title || '”的数值。'
        when v_type = 'date'
          then '记录“' || v_title || '”的日期。'
        when v_type in ('datetime', 'time')
          then '记录“' || v_title || '”的时间。'
        when v_type = 'duration'
          then '记录“' || v_title || '”的时长。'
        when v_type = 'json'
          then '以 JSON 结构保存“' || v_title || '”数据。'
        when v_type = 'array'
          then '以数组形式保存“' || v_title || '”数据。'
        when v_type = 'enum'
          then '记录“' || v_title || '”的枚举值。'
        else '记录“' || v_title || '”。'
      end
    );

    v_comment := json_build_object(
      'title', v_title,
      'type', v_type,
      'align', v_align,
      'description', v_description
    )::text;

    execute format(
      'comment on column %I.%I.%I is %L',
      v_column.schema_name,
      v_column.table_name,
      v_column.column_name,
      v_comment
    );
    v_written := v_written + 1;
  end loop;

  select count(*)
  into v_expected
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  join pg_attribute attributes
    on attributes.attrelid = classes.oid
   and attributes.attnum > 0
   and not attributes.attisdropped
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p', 'v', 'm', 'f');

  select count(*)
  into v_commented
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  join pg_attribute attributes
    on attributes.attrelid = classes.oid
   and attributes.attnum > 0
   and not attributes.attisdropped
  join pg_description descriptions
    on descriptions.classoid = 'pg_class'::regclass
   and descriptions.objoid = classes.oid
   and descriptions.objsubid = attributes.attnum
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p', 'v', 'm', 'f')
    and descriptions.description is not null;

  if v_written <> v_expected or v_commented <> v_expected then
    raise exception
      'Frontend column comments are incomplete: expected %, wrote %, found %.',
      v_expected,
      v_written,
      v_commented;
  end if;

  select count(*)
  into v_invalid
  from (
    select
      pg_input_is_valid(descriptions.description, 'jsonb') as is_valid,
      case
        when pg_input_is_valid(descriptions.description, 'jsonb')
          then descriptions.description::jsonb
        else null
      end as metadata
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    join pg_attribute attributes
      on attributes.attrelid = classes.oid
     and attributes.attnum > 0
     and not attributes.attisdropped
    join pg_description descriptions
      on descriptions.classoid = 'pg_class'::regclass
     and descriptions.objoid = classes.oid
     and descriptions.objsubid = attributes.attnum
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p', 'v', 'm', 'f')
  ) comments
  where not comments.is_valid
     or jsonb_typeof(comments.metadata) <> 'object'
     or not comments.metadata ?& array['title', 'type', 'align', 'description']
     or nullif(btrim(comments.metadata ->> 'title'), '') is null
     or comments.metadata ->> 'type' not in (
       'text', 'number', 'boolean', 'date', 'datetime',
       'time', 'duration', 'json', 'array', 'enum'
     )
     or comments.metadata ->> 'align' not in ('left', 'center', 'right')
     or nullif(btrim(comments.metadata ->> 'description'), '') is null;

  if v_invalid > 0 then
    raise exception 'Found % invalid frontend column comments.', v_invalid;
  end if;

  raise notice 'Wrote % frontend JSON column comments in the public schema.', v_written;
end;
$migration$;
