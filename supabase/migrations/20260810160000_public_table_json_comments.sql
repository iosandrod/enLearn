-- Describe every public table with one JSON document.
--
-- Contract:
-- {
--   "title": "Chinese table name",
--   "description": "Business purpose and significance",
--   "relation": [
--     {
--       "table": "schema.related_table",
--       "type": "references | referenced_by",
--       "localColumns": ["..."],
--       "relatedColumns": ["..."],
--       "constraint": "foreign_key_name",
--       "onDelete": "CASCADE | RESTRICT | SET NULL | SET DEFAULT | NO ACTION"
--     }
--   ]
-- }
--
-- Relations are generated from PostgreSQL foreign keys so the comments remain
-- faithful to the physical schema. Running the migration again is safe.

do $migration$
declare
  v_metadata jsonb := $metadata$
  {
    "account_login_events": {"title":"账套登录事件","description":"记录用户登录账套的时间和上下文，用于登录审计、安全分析和使用情况追踪。"},
    "account_user_preferences": {"title":"用户账套偏好","description":"保存用户的默认账套、最近使用账套和最近登录时间，为多账套登录和切换提供个性化状态。"},
    "admin_entities": {"title":"管理实体","description":"登记低代码 CRUD 使用的业务实体、物理表、页面和路由，是实体管理与页面生成之间的元数据桥梁。"},
    "admin_permissions": {"title":"管理权限","description":"定义菜单、页面、实体和操作级权限，为后台授权判断提供统一权限目录。"},
    "admin_role_permissions": {"title":"角色权限关联","description":"维护管理角色与权限的多对多关系，决定每个角色可访问的资源和操作。"},
    "admin_roles": {"title":"管理角色","description":"定义后台角色及其状态和系统属性，是用户权限聚合与授权管理的基础。"},
    "admin_routes": {"title":"管理路由","description":"维护后台菜单和路由树、页面绑定及权限要求，用于数据库驱动的动态导航。"},
    "admin_user_roles": {"title":"用户角色关联","description":"在账套范围内为用户分配管理角色，形成用户、账套与角色之间的授权关系。"},
    "ai_conversations": {"title":"AI 练习会话","description":"记录用户在指定 AI 场景中的完整练习会话、评分和反馈，用于口语训练过程管理。"},
    "ai_messages": {"title":"AI 会话消息","description":"保存 AI 练习会话中的逐条消息、音频和语言反馈，是对话回放与能力分析的明细数据。"},
    "ai_scenarios": {"title":"AI 练习场景","description":"定义 AI 口语练习的情境、难度、提示词和开场语，为会话生成提供可复用配置。"},
    "app_migration_markers": {"title":"应用迁移标记","description":"记录由应用执行的一次性数据或结构迁移，防止同一迁移被重复应用。"},
    "campuses": {"title":"校区","description":"维护校区地址、联系方式和地理位置，为试听课程、预约和线下服务提供地点主数据。"},
    "chat_conversation_members": {"title":"聊天会话成员","description":"记录聊天会话的参与用户、角色、静音置顶及已读位置，用于成员权限和个人会话状态管理。"},
    "chat_conversations": {"title":"聊天会话","description":"保存账套内聊天会话的类型、标题和最新消息摘要，是即时沟通功能的会话主表。"},
    "chat_message_reactions": {"title":"聊天消息回应","description":"记录用户对聊天消息添加的表情回应，用于表达轻量反馈并支持互动统计。"},
    "chat_message_reads": {"title":"聊天消息已读记录","description":"按用户记录消息的已读时间，为未读计数和阅读回执提供依据。"},
    "chat_messages": {"title":"聊天消息","description":"统一保存课程聊天与账套会话中的文本、媒体、附件、回复和状态，是聊天内容的核心明细表。"},
    "chat_sessions": {"title":"师生聊天课次","description":"记录学生与教师之间的实时聊天或教学会话及第三方会话标识，用于课程沟通过程追踪。"},
    "consultant_tasks": {"title":"顾问任务","description":"维护顾问针对潜在学员和试听预约的跟进任务、期限与完成状态，支撑招生转化流程。"},
    "conversion_records": {"title":"转化记录","description":"记录试听用户由顾问促成购买的产品、金额和转化结果，用于招生业绩与漏斗分析。"},
    "course_enrollments": {"title":"课程报名","description":"建立用户与课程的报名关系并记录来源和状态，是课程访问资格与学习统计的依据。"},
    "course_sections": {"title":"课程章节","description":"按顺序组织课程中的章节，为课时编排和课程目录展示提供结构。"},
    "courses": {"title":"课程","description":"维护课程标题、级别、适龄范围、类型和发布状态，是教学内容与报名业务的课程主数据。"},
    "customers": {"title":"支付客户","description":"保存应用用户与 Stripe 客户标识的映射，为支付、账单和订阅管理提供客户身份。"},
    "dynamic_crud_resource_registry": {"title":"动态 CRUD 资源注册表","description":"登记动态 CRUD 资源与物理表、配置及配置哈希，用于服务启动时的资源发现和变更识别。"},
    "entity_design_columns": {"title":"实体设计字段","description":"保存可视化实体设计器中的字段名称、类型、约束和展示配置，用于生成或同步物理字段。"},
    "entity_design_relations": {"title":"实体设计关系","description":"描述实体设计器中的源表、目标表和字段关系，可用于创建外键并呈现实体关系图。"},
    "entity_design_smoke_students": {"title":"实体设计测试学生","description":"供实体设计功能冒烟测试使用的学生示例表，用于验证动态建表和字段操作。"},
    "entity_design_tables": {"title":"实体设计表","description":"登记可视化设计的数据库表、中文名称、主键和画布位置，是实体建模的表级元数据。"},
    "entity_design_views": {"title":"实体设计视图","description":"管理 PostgreSQL 视图的定义、发布状态和安全属性，为可视化查询与低代码页面提供数据视图。"},
    "file_folders": {"title":"文件夹","description":"保存文件树中的持久化目录、层级路径和所有者信息，用于组织对象存储中的业务文件。"},
    "file_objects": {"title":"文件对象","description":"记录对象存储文件的路径、名称、类型、大小、校验值、可见性和生命周期状态。"},
    "file_usages": {"title":"文件引用","description":"建立文件对象与业务实体的引用关系，用于附件查询、引用追踪和安全删除判断。"},
    "lead_events": {"title":"线索事件","description":"记录用户在线索生命周期中的行为及扩展数据，为招生触达、分群和转化分析提供事件流。"},
    "lesson_progress": {"title":"课时学习进度","description":"按用户和课时记录观看时长、完成比例及最后学习时间，用于续学和学习成效统计。"},
    "lessons": {"title":"课时","description":"维护课程课时的内容、视频、时长、类型和开放状态，是课程学习的最小内容单元。"},
    "lowcode_form_definitions": {"title":"低代码表单定义","description":"保存管理编辑器使用的数据库驱动表单结构，使表单设计可以复用、版本化并在运行时加载。"},
    "lowcode_page_versions": {"title":"低代码页面版本","description":"保存低代码页面每次发布或留档的结构快照，用于版本追溯、比较和恢复。"},
    "lowcode_pages": {"title":"低代码页面","description":"保存页面路由、布局、结构和发布状态，是低代码设计器与运行时渲染的核心页面定义。"},
    "notification_deliveries": {"title":"通知投递记录","description":"记录每条通知在站内信、邮件、短信等渠道的投递目标、重试、结果和错误，用于可靠投递与审计。"},
    "notification_events": {"title":"通知事件","description":"接收业务系统产生的通知事件和幂等标识，作为模板渲染、收件人解析和消息投递的源头。"},
    "notification_messages": {"title":"通知消息","description":"保存面向具体接收人的通知内容、优先级、业务来源和阅读状态，为通知中心提供用户消息。"},
    "notification_preferences": {"title":"通知偏好","description":"按用户和通知类别保存渠道开关及免打扰时段，用于个性化控制消息触达。"},
    "notification_push_devices": {"title":"移动推送设备","description":"登记用户的移动设备推送令牌、平台和活跃状态，为 Android 与 iOS 推送提供目标设备。"},
    "notification_templates": {"title":"通知模板","description":"按事件类型和渠道维护通知标题、正文模板及状态，实现通知内容的集中配置和复用。"},
    "planning_archive_manager": {"title":"归档快照","description":"记录计划历史快照的场景、时点和各类记录数量，用于管理排产结果的归档与追溯。"},
    "planning_archived_buffer": {"title":"历史库存","description":"保存归档时点的物料库存、成本和安全库存，用于比较不同计划快照的库存状态。"},
    "planning_archived_demand": {"title":"历史需求","description":"保存归档时点的需求、交期、优先级和已计划数量，用于需求履约历史分析。"},
    "planning_archived_operationplan": {"title":"历史计划订单","description":"保存归档时点的制造、采购、配送和交付计划，用于计划版本对比和历史审计。"},
    "planning_attribute": {"title":"计划扩展属性","description":"定义排产模型的自定义字段、类型和可编辑性，为计划对象扩展业务属性。"},
    "planning_bucket": {"title":"时间桶","description":"定义日、周、月等计划分析时间维度，为预测、产能和库存报表提供统一时间分组。"},
    "planning_bucketdetail": {"title":"时间桶明细","description":"保存时间桶中的具体起止区间，使计划数据可以准确归集到每个分析周期。"},
    "planning_buffer": {"title":"库存缓冲区","description":"描述物料在地点上的现有库存、上下限和补货日历，是库存计划与缺料判断的基础。"},
    "planning_calendar": {"title":"计划日历","description":"定义工作时间、资源能力或业务阈值日历，为排产中的可用性和时变参数提供基准。"},
    "planning_calendarbucket": {"title":"计划日历明细","description":"按日期范围、星期和日内时段定义日历值，使能力与可用时间能够精细变化。"},
    "planning_constraint": {"title":"需求约束","description":"保存求解器识别的需求、预测和物料约束冲突，用于解释未满足计划的原因。"},
    "planning_customer": {"title":"计划客户","description":"维护计划需求和预测引用的客户主数据及层级结构，用于客户维度的供需分析。"},
    "planning_demand": {"title":"计划需求","description":"记录待交付客户需求、数量、交期、优先级及计划结果，是排产求解的主要需求输入。"},
    "planning_demand_sync_state": {"title":"需求同步状态","description":"追踪销售订单明细到计划需求的幂等同步、映射缺口和错误，保障业务需求可靠进入排产模型。"},
    "planning_export": {"title":"计划导出","description":"保存计划数据和报表的导出定义、查询及参数，用于复用标准化数据输出。"},
    "planning_forecast": {"title":"预测对象","description":"按客户、物料和地点定义预测对象、算法和计划策略，是需求预测计算的主数据。"},
    "planning_forecastplan": {"title":"预测计划","description":"按预测对象和时间区间保存预测度量值，为预测编辑、汇总和补货计划提供时间序列。"},
    "planning_item": {"title":"计划物料","description":"维护原料、半成品和成品的成本、单位、层级及需求特征，是供需计划的物料主数据。"},
    "planning_itemdistribution": {"title":"物料配送规则","description":"定义物料在来源地与目的地之间的配送提前期、批量、成本和优先级，用于生成调拨计划。"},
    "planning_itemsupplier": {"title":"物料供应规则","description":"定义物料、供应商和地点之间的采购提前期、批量、成本和资源约束，用于生成采购计划。"},
    "planning_location": {"title":"计划地点","description":"维护工厂、仓库及其他供需地点和可用日历，是库存、工序和需求的空间维度。"},
    "planning_measure": {"title":"预测度量","description":"定义预测时间序列的度量、计算表达式和编辑方式，为预测工作台提供指标模型。"},
    "planning_operation": {"title":"工序","description":"维护制造工序的类型、提前期、批量、日历和层级，是生产路线与计划订单生成的核心主数据。"},
    "planning_operation_dependency": {"title":"工序依赖","description":"定义工序之间的前置约束、数量关系和安全提前期，用于保证工艺执行顺序。"},
    "planning_operationmaterial": {"title":"工序物料","description":"定义工序消耗或产出的物料、数量和生效区间，构成生产计划的物料流。"},
    "planning_operationplan": {"title":"计划订单","description":"保存求解生成或人工维护的制造、采购、配送、交付及库存计划，是排产结果的核心载体。"},
    "planning_operationplanmaterial": {"title":"计划订单物料","description":"记录计划订单在具体时间和地点的物料消耗或产出，用于库存投影与物料追溯。"},
    "planning_operationplanresource": {"title":"计划订单资源","description":"记录计划订单占用的资源、数量和换型状态，用于资源负荷分析和甘特展示。"},
    "planning_operationresource": {"title":"工序资源","description":"定义工序所需资源、技能、用量和优先级，构成排产中的能力约束。"},
    "planning_parameter": {"title":"计划参数","description":"保存账套级排产、预测和展示参数，用于调整求解器及计划服务行为。"},
    "planning_plan_version": {"title":"计划版本","description":"保存一次排产运行的场景、输入快照、参数、发布状态和结果摘要，使计划结果可追溯和可切换。"},
    "planning_problem": {"title":"计划问题","description":"保存求解器输出的缺料、延期、超载等问题及影响区间，用于计划诊断与改进。"},
    "planning_resource": {"title":"计划资源","description":"维护设备、人员和产线等能力资源、可用性、成本及换型属性，是有限能力排产的基础。"},
    "planning_resourceplan": {"title":"资源负荷","description":"按资源和时间汇总可用、占用、换型及空闲能力，用于识别产能瓶颈和超载。"},
    "planning_resourceskill": {"title":"资源技能","description":"维护资源具备的技能、生效区间和优先级，使工序可以按技能选择可用资源。"},
    "planning_run": {"title":"排产运行","description":"记录排产、预测、归档和导出任务的提交、执行、进度、日志与结果，是计划执行的运行投影。"},
    "planning_scenario": {"title":"计划场景","description":"管理账套内的基线和假设分析场景，为不同参数或业务条件下的计划比较提供隔离空间。"},
    "planning_schedule": {"title":"排产调度","description":"定义排产作业类型、执行场景、Cron 计划和通知配置，用于自动触发计划任务。"},
    "planning_setupmatrix": {"title":"换型矩阵","description":"组织资源换型规则集合，为不同前后状态之间的换型计算提供规则容器。"},
    "planning_setuprule": {"title":"换型规则","description":"定义换型前后状态、耗时、成本和适用资源，用于排产时计算序列相关换型。"},
    "planning_skill": {"title":"计划技能","description":"定义资源能力所需或具备的技能，是工序与资源匹配的能力分类主数据。"},
    "planning_source_mapping": {"title":"计划主数据映射","description":"将外部业务编码映射到计划客户、物料、地点、供应商、资源和工序，保障跨系统数据一致。"},
    "planning_suboperation": {"title":"子工序","description":"定义路线、备选或拆分工序的成员和顺序，形成复合工序的层级结构。"},
    "planning_supplier": {"title":"计划供应商","description":"维护采购来源、供应商层级和可用日历，为物料供应规则和采购计划提供主数据。"},
    "posts": {"title":"文章","description":"保存用户发布的文章标题和正文，是内容展示与示例博客功能的基础数据。"},
    "prices": {"title":"商品价格","description":"保存 Stripe 商品的计价金额、币种、周期和试用规则，为订阅结算提供价格方案。"},
    "print_logs": {"title":"打印日志","description":"记录打印请求、模板版本、打印机、份数、耗时、结果和错误，用于执行追踪与故障审计。"},
    "print_templates": {"title":"打印模板","description":"保存打印设计器的模板内容、工作区配置和版本状态，用于业务单据的可视化打印。"},
    "products": {"title":"订阅商品","description":"保存 Stripe 商品名称、说明、图片和扩展信息，是价格方案和订阅销售的商品主数据。"},
    "sale": {"title":"销售单","description":"保存简化销售业务的单号、客户、日期、金额和状态，作为销售明细的主记录。"},
    "sale_detail": {"title":"销售单明细","description":"记录销售单中的产品、数量、单价和备注，用于计算并解释销售单金额。"},
    "sales_order_lines": {"title":"销售订单明细","description":"保存 U9 风格销售订单的物料、数量、价格、税额、交期和来源单据，是订单履约与排产需求的明细基础。"},
    "sales_orders": {"title":"销售订单","description":"保存 U9 风格销售订单的组织、客户、结算、金额和审批信息，是销售业务及排产需求同步的单据主表。"},
    "service_request_idempotency": {"title":"服务请求幂等记录","description":"保存服务写请求的标识、指纹、处理状态和响应，防止网络重试造成重复业务写入。"},
    "speech_assessments": {"title":"语音评测","description":"保存用户语音转写、流利度、发音和准确度评分，为口语训练反馈和能力分析提供结果。"},
    "subscriptions": {"title":"用户订阅","description":"保存用户的 Stripe 订阅状态、价格、周期和取消试用信息，用于控制付费权益与续费。"},
    "system_config": {"title":"系统设置","description":"按用户保存主题、表格、语言区域和功能开关配置，为应用界面提供个性化设置。"},
    "system_option_items": {"title":"下拉选项明细","description":"维护字典型下拉数据源的标签、值、层级、颜色和状态，为表单和表格提供标准选项。"},
    "system_option_sources": {"title":"下拉数据源","description":"统一定义静态字典、查询或远程类型的下拉数据源及缓存策略，供低代码控件复用。"},
    "teachers": {"title":"教师","description":"维护教师身份、简介、头像、擅长领域、授课级别和在线状态，为课程与师生会话提供教师主数据。"},
    "trial_bookings": {"title":"试听预约","description":"记录学员对试听课的预约、校区、联系方式、学习目标和顾问分配，是招生跟进的核心业务记录。"},
    "trial_classes": {"title":"试听课","description":"维护校区可预约的试听课程、教师、时间、容量和已预约人数，为试听排课和预约提供场次。"},
    "users": {"title":"用户资料","description":"扩展认证用户的姓名、联系方式、学习目标、线索状态和顾问分配，是应用用户的公开业务档案。"},
    "wf_cc": {"title":"流程抄送","description":"记录流程节点向用户产生的抄送事项及阅读状态，为审批知会和待阅中心提供数据。"},
    "wf_comment": {"title":"流程意见","description":"保存流程实例或任务上的操作、处理人和意见，形成审批过程的意见留痕。"},
    "wf_document_binding": {"title":"流程单据绑定","description":"建立业务单据与流程实例的关系，使业务对象可以查询其审批状态和流程轨迹。"},
    "wf_edge_definition": {"title":"流程连线定义","description":"保存已发布流程中节点之间的连线、条件和优先级，用于运行时决定流转路径。"},
    "wf_execution_token": {"title":"流程执行令牌","description":"保存旧版流程运行时的节点执行令牌；迁移到 Trigger.dev 后已废弃，仅保留兼容和历史追踪。"},
    "wf_history_event": {"title":"流程历史事件","description":"按时间记录流程实例的状态变化、操作者和事件载荷，为审批轨迹、审计和幂等处理提供依据。"},
    "wf_job": {"title":"系统执行任务","description":"定义一次性或定时执行的系统任务、Trigger.dev 任务标识、重试和并发策略，是后台作业主表。"},
    "wf_job_run": {"title":"任务运行记录","description":"记录系统任务每次触发的输入、输出、状态、尝试次数和错误，用于运行监控与审计。"},
    "wf_model": {"title":"流程模型","description":"保存流程模型的业务编码、单据类型、草稿结构和当前版本，是流程设计的主记录。"},
    "wf_model_version": {"title":"流程模型版本","description":"保存流程模型每个已发布版本的不可变结构和备注，用于发布追溯与定义生成。"},
    "wf_node_definition": {"title":"流程节点定义","description":"保存已发布流程定义中的节点类型、名称和配置，是运行时创建节点实例的模板。"},
    "wf_node_instance": {"title":"流程节点实例","description":"记录流程实例中各节点的执行状态、时间和执行键，用于展示并驱动实际审批进度。"},
    "wf_process_definition": {"title":"流程定义","description":"保存由模型版本编译发布的可执行流程结构、版本和状态，是启动流程实例的正式定义。"},
    "wf_process_instance": {"title":"流程实例","description":"记录业务单据启动的审批流程、定义版本、发起人、状态及 Trigger.dev 运行标识，是审批进度主记录。"},
    "wf_task": {"title":"审批任务","description":"记录流程节点产生的待办任务、处理人、期限、决定和运行令牌，是用户办理审批的核心记录。"},
    "wf_task_candidate": {"title":"任务候选人","description":"保存审批任务可认领的用户、角色或组织候选快照，用于任务可见性和认领控制。"},
    "wf_timer_job": {"title":"流程定时任务","description":"保存旧版流程定时节点任务；迁移到 Trigger.dev 等待机制后已废弃，仅保留兼容和历史数据。"},
    "wf_variable": {"title":"流程变量","description":"按流程实例保存运行时键值变量，为节点条件、表单数据和后续任务提供共享上下文。"}
  }
  $metadata$::jsonb;
  v_table record;
  v_table_metadata jsonb;
  v_relations jsonb;
  v_comment text;
  v_written integer := 0;
  v_expected integer;
  v_invalid integer;
begin
  select count(*)
  into v_expected
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p');

  for v_table in
    select classes.oid, namespaces.nspname as schema_name, classes.relname as table_name
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p')
    order by classes.relname
  loop
    v_table_metadata := v_metadata -> v_table.table_name;

    -- Dynamic entity tables can be created after this migration was authored.
    -- They still receive the same JSON contract, with an explicit fallback
    -- that makes the missing curated metadata visible to administrators.
    if v_table_metadata is null then
      v_table_metadata := jsonb_build_object(
        'title', '数据表（' || v_table.table_name || '）',
        'description', '存储 public.' || v_table.table_name || ' 对应的业务数据；尚未配置专用中文说明。'
      );
    end if;

    select coalesce(
      jsonb_agg(
        relation_rows.relation
        order by
          relation_rows.relation ->> 'table',
          relation_rows.relation ->> 'type',
          relation_rows.relation ->> 'constraint'
      ),
      '[]'::jsonb
    )
    into v_relations
    from (
      select jsonb_build_object(
        'table', related_namespaces.nspname || '.' || related_classes.relname,
        'type', 'references',
        'localColumns', (
          select jsonb_agg(local_attributes.attname order by local_keys.ordinality)
          from unnest(constraints.conkey) with ordinality local_keys(attnum, ordinality)
          join pg_attribute local_attributes
            on local_attributes.attrelid = constraints.conrelid
           and local_attributes.attnum = local_keys.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attributes.attname order by related_keys.ordinality)
          from unnest(constraints.confkey) with ordinality related_keys(attnum, ordinality)
          join pg_attribute related_attributes
            on related_attributes.attrelid = constraints.confrelid
           and related_attributes.attnum = related_keys.attnum
        ),
        'constraint', constraints.conname,
        'onDelete', case constraints.confdeltype
          when 'c' then 'CASCADE'
          when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
          else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraints
      join pg_class related_classes on related_classes.oid = constraints.confrelid
      join pg_namespace related_namespaces on related_namespaces.oid = related_classes.relnamespace
      where constraints.contype = 'f'
        and constraints.conrelid = v_table.oid

      union all

      select jsonb_build_object(
        'table', related_namespaces.nspname || '.' || related_classes.relname,
        'type', 'referenced_by',
        'localColumns', (
          select jsonb_agg(local_attributes.attname order by local_keys.ordinality)
          from unnest(constraints.confkey) with ordinality local_keys(attnum, ordinality)
          join pg_attribute local_attributes
            on local_attributes.attrelid = constraints.confrelid
           and local_attributes.attnum = local_keys.attnum
        ),
        'relatedColumns', (
          select jsonb_agg(related_attributes.attname order by related_keys.ordinality)
          from unnest(constraints.conkey) with ordinality related_keys(attnum, ordinality)
          join pg_attribute related_attributes
            on related_attributes.attrelid = constraints.conrelid
           and related_attributes.attnum = related_keys.attnum
        ),
        'constraint', constraints.conname,
        'onDelete', case constraints.confdeltype
          when 'c' then 'CASCADE'
          when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
          else 'NO ACTION'
        end
      ) as relation
      from pg_constraint constraints
      join pg_class related_classes on related_classes.oid = constraints.conrelid
      join pg_namespace related_namespaces on related_namespaces.oid = related_classes.relnamespace
      where constraints.contype = 'f'
        and constraints.confrelid = v_table.oid
    ) relation_rows;

    v_comment := json_build_object(
      'title', v_table_metadata ->> 'title',
      'description', v_table_metadata ->> 'description',
      'relation', v_relations
    )::text;

    execute format(
      'comment on table %I.%I is %L',
      v_table.schema_name,
      v_table.table_name,
      v_comment
    );
    v_written := v_written + 1;
  end loop;

  select count(*)
  into v_invalid
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  cross join lateral (
    select obj_description(classes.oid, 'pg_class')::jsonb as metadata
  ) comments
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
    and (
      jsonb_typeof(comments.metadata) is distinct from 'object'
      or jsonb_typeof(comments.metadata -> 'title') is distinct from 'string'
      or nullif(btrim(comments.metadata ->> 'title'), '') is null
      or jsonb_typeof(comments.metadata -> 'description') is distinct from 'string'
      or nullif(btrim(comments.metadata ->> 'description'), '') is null
      or jsonb_typeof(comments.metadata -> 'relation') is distinct from 'array'
    );

  if v_written <> v_expected or v_invalid <> 0 then
    raise exception
      'Public table comment verification failed: expected %, wrote %, invalid %.',
      v_expected,
      v_written,
      v_invalid;
  end if;
end
$migration$;
