-- Fill JSON metadata comments for tables and columns introduced after the
-- original catalog-wide comment migrations. Existing comments are preserved.
-- The catalog-driven fallback also covers dynamic entity tables that exist
-- when this migration runs.

do $migration$
declare
  v_table record;
  v_column record;
  v_table_metadata jsonb;
  v_relations jsonb;
  v_title text;
  v_type text;
  v_align text;
  v_description text;
  v_comment text;
  v_tables_written integer := 0;
  v_columns_written integer := 0;
  v_missing_tables integer;
  v_missing_columns integer;

  v_table_titles jsonb := $json$
  {
    "ai_audit_events": {"title":"AI 审计事件","description":"记录 AI 助手提案和运行过程中的安全审计事件。"},
    "ai_conversations": {"title":"AI 助手会话","description":"保存用户与 AI 助手交互的会话上下文及页面引用。"},
    "ai_messages": {"title":"AI 助手消息","description":"保存 AI 会话中的系统、用户、助手和工具消息。"},
    "ai_proposals": {"title":"AI 助手提案","description":"保存 AI 生成的页面或功能变更提案、校验结果和应用状态。"},
    "ai_runs": {"title":"AI 助手运行","description":"记录一次 AI 请求的提供商、执行状态、错误和时间信息。"},
    "ai_tool_calls": {"title":"AI 工具调用","description":"记录 AI 运行期间调用工具的参数、结果摘要和执行状态。"},
    "document_number_allocations": {"title":"单据编号分配记录","description":"记录单据编号规则实际分配的序号和生成结果，支持追溯与防重。"},
    "document_number_counters": {"title":"单据编号计数器","description":"按编号规则和周期保存当前序列值，为并发编号生成提供原子计数。"},
    "document_number_rules": {"title":"单据编号规则","description":"定义账套内单据编号的前后缀、日期格式、序列和重置周期。"},
    "lowcode_materials": {"title":"低代码物料","description":"登记低代码页面和表单物料的源码、版本、依赖和发布状态。"},
    "lowcode_node_actions": {"title":"低代码节点动作","description":"登记低代码节点可执行动作的源码、参数、能力限制和适用条件。"},
    "lowcode_page_runtime": {"title":"低代码页面运行时","description":"登记低代码页面函数、按钮规则、指令和集成能力的运行时定义。"},
    "mes_command_log": {"title":"MES 命令日志","description":"记录制造执行命令的幂等键、聚合对象、处理状态和结果。"},
    "mes_inbox_message": {"title":"MES 入站消息","description":"保存制造执行消费者收到的消息及处理结果，支持消息幂等。"},
    "mes_material_transaction": {"title":"MES 物料事务","description":"记录工单物料发料、退料、消耗和冲销事务。"},
    "mes_outbox_event": {"title":"MES 出站事件","description":"保存待发布或已发布的制造执行领域事件及重试状态。"},
    "mes_production_transaction": {"title":"MES 生产事务","description":"记录工序报工和冲销的数量、设备、操作员及发生时间。"},
    "mes_work_order": {"title":"MES 生产工单","description":"保存制造工单的来源、物料、数量、状态、快照和执行时间。"},
    "mes_work_order_component": {"title":"MES 工单物料组件","description":"记录工单工序所需或产出的物料组件及领用数量。"},
    "mes_work_order_operation": {"title":"MES 工单工序","description":"记录工单内工序的顺序、数量、状态和执行时间。"},
    "training_chapters": {"title":"培训课程章节","description":"保存企业培训课程章节、视频课件、时长和发布状态。"},
    "training_courses": {"title":"企业培训课程","description":"保存企业培训课程的编码、标题、说明、排序和发布状态。"},
    "training_progress": {"title":"培训学习进度","description":"记录用户在培训课程章节中的观看进度和完成状态。"}
  }
  $json$::jsonb;

  v_column_titles jsonb := $json$
  {
    "mes_work_order.work_order_no":"工单号",
    "mes_work_order.planned_quantity":"计划数量",
    "mes_work_order.good_quantity":"合格数量",
    "mes_work_order.scrap_quantity":"报废数量",
    "mes_work_order.planned_start":"计划开始时间",
    "mes_work_order.planned_end":"计划结束时间",
    "mes_work_order.actual_start":"实际开始时间",
    "mes_work_order.actual_end":"实际结束时间",
    "mes_work_order.route_snapshot":"工艺路线快照",
    "mes_work_order.bom_snapshot":"物料清单快照",
    "mes_work_order.resource_snapshot":"资源快照",
    "mes_work_order.source_snapshot":"来源快照",
    "mes_work_order.released_by":"下达人",
    "mes_work_order_operation.operation_code":"工序编码",
    "mes_work_order_operation.operation_name":"工序名称",
    "mes_work_order_operation.sequence_no":"工序顺序",
    "mes_work_order_operation.planned_quantity":"计划数量",
    "mes_work_order_operation.good_quantity":"合格数量",
    "mes_work_order_operation.scrap_quantity":"报废数量",
    "mes_work_order_component.requirement_type":"需求类型",
    "mes_work_order_component.required_quantity":"需求数量",
    "mes_work_order_component.issued_quantity":"已发料数量",
    "mes_work_order_component.returned_quantity":"已退料数量",
    "mes_production_transaction.transaction_type":"生产事务类型",
    "mes_production_transaction.original_transaction_id":"原事务",
    "mes_production_transaction.good_quantity":"合格数量",
    "mes_production_transaction.scrap_quantity":"报废数量",
    "mes_production_transaction.operator_id":"操作员",
    "mes_material_transaction.transaction_type":"物料事务类型",
    "mes_material_transaction.original_transaction_id":"原事务",
    "mes_material_transaction.reason_code":"原因编码",
    "mes_material_transaction.lot_no":"批号",
    "mes_material_transaction.serial_no":"序列号",
    "mes_material_transaction.quantity":"事务数量",
    "mes_command_log.command_type":"命令类型",
    "mes_command_log.aggregate_type":"聚合类型",
    "mes_command_log.aggregate_id":"聚合记录",
    "mes_command_log.request_hash":"请求哈希",
    "mes_outbox_event.aggregate_type":"聚合类型",
    "mes_outbox_event.aggregate_id":"聚合记录",
    "mes_outbox_event.aggregate_version":"聚合版本",
    "mes_outbox_event.event_type":"事件类型",
    "mes_inbox_message.message_id":"消息编号",
    "document_number_rules.number_format":"编号格式",
    "document_number_rules.date_pattern":"日期格式",
    "document_number_rules.serial_width":"序列宽度",
    "document_number_rules.reset_period":"重置周期",
    "document_number_rules.start_value":"起始值",
    "document_number_rules.increment_by":"递增值",
    "document_number_rules.is_default":"默认规则",
    "document_number_allocations.sequence_value":"序列值",
    "document_number_allocations.business_date":"业务日期",
    "document_number_allocations.document_number":"单据编号",
    "document_number_allocations.generated_by":"生成用户",
    "lowcode_node_actions.node_type":"节点类型",
    "lowcode_node_actions.node_label":"节点名称",
    "lowcode_node_actions.action_code":"动作编码",
    "lowcode_node_actions.source_code":"动作源码",
    "lowcode_node_actions.parameters":"动作参数",
    "lowcode_node_actions.insert_text_template":"插入文本模板",
    "lowcode_node_actions.is_data_source_loader":"数据源加载器",
    "lowcode_node_actions.limits":"执行限制",
    "lowcode_page_runtime.runtime_key":"运行时键",
    "lowcode_page_runtime.function_name":"函数名称",
    "lowcode_page_runtime.function_type":"函数类型",
    "lowcode_page_runtime.execution_mode":"执行模式",
    "lowcode_page_runtime.native_handler":"原生处理器",
    "lowcode_page_runtime.runtime_spec":"运行时规格",
    "lowcode_page_runtime.result_schema":"结果结构",
    "lowcode_page_runtime.capabilities":"能力列表",
    "lowcode_page_runtime.limits":"执行限制",
    "lowcode_materials.material_kind":"物料类型",
    "lowcode_materials.renderer_type":"渲染类型",
    "lowcode_materials.source_path":"源码路径",
    "lowcode_materials.source_text":"源码内容",
    "lowcode_materials.source_hash":"源码哈希",
    "lowcode_materials.material_version":"物料版本",
    "lowcode_materials.aliases":"别名",
    "lowcode_materials.manifest":"物料清单",
    "lowcode_materials.dependencies":"依赖项",
    "training_courses.sort_order":"排序",
    "training_chapters.course_id":"课程",
    "training_chapters.video_file_id":"视频文件",
    "training_chapters.ppt_file_id":"课件文件",
    "training_chapters.duration_seconds":"时长（秒）",
    "training_progress.course_id":"课程",
    "training_progress.chapter_id":"章节",
    "training_progress.progress_seconds":"学习进度（秒）",
    "training_progress.completed":"是否完成",
    "training_progress.last_viewed_at":"最近观看时间"
  }
  $json$::jsonb;

  v_tokens jsonb := $json$
  {
    "id":"ID", "account":"账套", "user":"用户", "created":"创建", "at":"时间",
    "updated":"更新", "deleted":"删除", "published":"发布", "started":"开始",
    "finished":"结束", "completed":"完成", "archived":"归档", "read":"读取",
    "processed":"处理", "name":"名称", "title":"标题", "code":"编码",
    "description":"说明", "status":"状态", "type":"类型", "category":"分类",
    "metadata":"扩展元数据", "schema":"结构定义", "config":"配置", "payload":"载荷",
    "result":"结果", "content":"内容", "value":"值", "label":"显示名称",
    "sort":"排序", "order":"顺序", "priority":"优先级", "quantity":"数量",
    "amount":"金额", "cost":"成本", "price":"价格", "active":"启用",
    "enabled":"启用", "visible":"可见", "system":"系统", "version":"版本",
    "source":"来源", "target":"目标", "operation":"工序", "work":"工单",
    "original":"原始",
    "batch":"批次", "planned":"计划", "actual":"实际", "good":"合格",
    "scrap":"报废", "route":"路线", "snapshot":"快照", "resource":"资源",
    "component":"组件", "transaction":"事务", "command":"命令", "device":"设备",
    "local":"本地", "sequence":"序列", "occurred":"发生", "recorded":"记录",
    "reason":"原因", "rule":"规则", "number":"编号", "format":"格式",
    "date":"日期", "serial":"序列", "reset":"重置", "period":"周期",
    "start":"开始", "end":"结束", "increment":"递增", "default":"默认",
    "generated":"生成", "by":"人", "ref":"引用", "is":"是否", "block":"区块", "field":"字段", "conversation":"会话",
    "role":"角色", "tool":"工具", "call":"调用", "arguments":"参数",
    "summary":"摘要", "run":"运行", "provider":"服务商", "error":"错误",
    "mode":"模式", "page":"页面", "function":"函数", "execution":"执行",
    "native":"原生", "runtime":"运行时", "parameter":"参数", "capability":"能力",
    "applicable":"适用条件", "limit":"限制", "material":"物料", "renderer":"渲染",
    "path":"路径", "text":"文本", "alias":"别名", "dependency":"依赖",
    "course":"课程", "chapter":"章节", "video":"视频", "ppt":"课件",
    "duration":"时长", "progress":"进度", "seconds":"秒", "viewed":"观看",
    "file":"文件", "kind":"类型", "hash":"哈希", "row":"行", "count":"数量",
    "message":"消息", "event":"事件", "consumer":"消费者", "request":"请求",
    "business":"业务"
  }
  $json$::jsonb;
begin
  for v_table in
    select classes.oid, namespaces.nspname as schema_name, classes.relname as table_name
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p')
      and nullif(btrim(obj_description(classes.oid, 'pg_class')), '') is null
    order by classes.relname
  loop
    v_table_metadata := v_table_titles -> v_table.table_name;
    if v_table_metadata is null then
      v_table_metadata := jsonb_build_object(
        'title', '数据表（' || v_table.table_name || '）',
        'description', '存储 public.' || v_table.table_name || ' 对应的业务数据。'
      );
    end if;

    select coalesce(jsonb_agg(relation_rows.relation order by
      relation_rows.relation ->> 'table', relation_rows.relation ->> 'type',
      relation_rows.relation ->> 'constraint'), '[]'::jsonb)
    into v_relations
    from (
      select jsonb_build_object(
        'table', related_namespaces.nspname || '.' || related_classes.relname,
        'type', 'references',
        'localColumns', (select jsonb_agg(local_attributes.attname order by keys.ordinality)
          from unnest(constraints.conkey) with ordinality keys(attnum, ordinality)
          join pg_attribute local_attributes on local_attributes.attrelid = constraints.conrelid
            and local_attributes.attnum = keys.attnum),
        'relatedColumns', (select jsonb_agg(related_attributes.attname order by keys.ordinality)
          from unnest(constraints.confkey) with ordinality keys(attnum, ordinality)
          join pg_attribute related_attributes on related_attributes.attrelid = constraints.confrelid
            and related_attributes.attnum = keys.attnum),
        'constraint', constraints.conname,
        'onDelete', case constraints.confdeltype when 'c' then 'CASCADE' when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else 'NO ACTION' end
      ) as relation
      from pg_constraint constraints
      join pg_class related_classes on related_classes.oid = constraints.confrelid
      join pg_namespace related_namespaces on related_namespaces.oid = related_classes.relnamespace
      where constraints.contype = 'f' and constraints.conrelid = v_table.oid
      union all
      select jsonb_build_object(
        'table', related_namespaces.nspname || '.' || related_classes.relname,
        'type', 'referenced_by',
        'localColumns', (select jsonb_agg(local_attributes.attname order by keys.ordinality)
          from unnest(constraints.confkey) with ordinality keys(attnum, ordinality)
          join pg_attribute local_attributes on local_attributes.attrelid = constraints.confrelid
            and local_attributes.attnum = keys.attnum),
        'relatedColumns', (select jsonb_agg(related_attributes.attname order by keys.ordinality)
          from unnest(constraints.conkey) with ordinality keys(attnum, ordinality)
          join pg_attribute related_attributes on related_attributes.attrelid = constraints.conrelid
            and related_attributes.attnum = keys.attnum),
        'constraint', constraints.conname,
        'onDelete', case constraints.confdeltype when 'c' then 'CASCADE' when 'r' then 'RESTRICT'
          when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else 'NO ACTION' end
      ) as relation
      from pg_constraint constraints
      join pg_class related_classes on related_classes.oid = constraints.conrelid
      join pg_namespace related_namespaces on related_namespaces.oid = related_classes.relnamespace
      where constraints.contype = 'f' and constraints.confrelid = v_table.oid
    ) relation_rows;

    v_comment := jsonb_build_object(
      'title', v_table_metadata ->> 'title',
      'description', v_table_metadata ->> 'description',
      'relation', v_relations
    )::text;
    execute format('comment on table %I.%I is %L', v_table.schema_name, v_table.table_name, v_comment);
    v_tables_written := v_tables_written + 1;
  end loop;

  for v_column in
    select namespaces.nspname as schema_name, classes.relname as table_name,
      attributes.attname as column_name, attributes.attnotnull as is_required,
      attributes.attndims, types.typname as udt_name, types.typtype,
      types.typcategory, attributes.attrelid, attributes.attnum,
      exists (select 1 from pg_index indexes where indexes.indrelid = classes.oid
        and indexes.indisprimary and attributes.attnum = any(indexes.indkey)) as is_primary_key,
      exists (select 1 from pg_constraint constraints where constraints.conrelid = classes.oid
        and constraints.contype = 'f' and attributes.attnum = any(constraints.conkey)) as is_foreign_key
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    join pg_attribute attributes on attributes.attrelid = classes.oid
      and attributes.attnum > 0 and not attributes.attisdropped
    join pg_type types on types.oid = attributes.atttypid
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p', 'v', 'm', 'f')
      and nullif(btrim(col_description(classes.oid, attributes.attnum)), '') is null
    order by classes.relname, attributes.attnum
  loop
    v_title := coalesce(
      nullif(v_column_titles ->> (v_column.table_name || '.' || v_column.column_name), ''),
      nullif(v_tokens ->> v_column.column_name, ''),
      (select string_agg(coalesce(v_tokens ->> token.part, initcap(token.part)), '' order by token.ordinality)
        from unnest(string_to_array(v_column.column_name, '_')) with ordinality token(part, ordinality)),
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
    v_align := case when v_type = 'number' then 'right'
      when v_type in ('boolean', 'date', 'datetime', 'time', 'enum') then 'center'
      else 'left' end;
    v_description := case
      when v_column.is_primary_key then '当前记录的唯一标识。'
      when v_column.is_foreign_key then '关联“' || v_title || '”对应记录的唯一标识。'
      when v_type = 'boolean' then '用于标识“' || v_title || '”是否成立。'
      when v_type = 'number' then '记录“' || v_title || '”的数值。'
      when v_type = 'date' then '记录“' || v_title || '”的日期。'
      when v_type in ('datetime', 'time') then '记录“' || v_title || '”的时间。'
      when v_type = 'duration' then '记录“' || v_title || '”的时长。'
      when v_type = 'json' then '以 JSON 结构保存“' || v_title || '”数据。'
      when v_type = 'array' then '以数组形式保存“' || v_title || '”数据。'
      when v_type = 'enum' then '记录“' || v_title || '”的枚举值。'
      else '记录“' || v_title || '”。'
    end;
    v_comment := jsonb_build_object('title', v_title, 'type', v_type,
      'align', v_align, 'description', v_description)::text;
    execute format('comment on column %I.%I.%I is %L', v_column.schema_name,
      v_column.table_name, v_column.column_name, v_comment);
    v_columns_written := v_columns_written + 1;
  end loop;

  select count(*)
  into v_missing_tables
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p')
    and nullif(btrim(obj_description(classes.oid, 'pg_class')), '') is null;

  select count(*)
  into v_missing_columns
  from pg_class classes
  join pg_namespace namespaces on namespaces.oid = classes.relnamespace
  join pg_attribute attributes on attributes.attrelid = classes.oid
    and attributes.attnum > 0 and not attributes.attisdropped
  where namespaces.nspname = 'public'
    and classes.relkind in ('r', 'p', 'v', 'm', 'f')
    and nullif(btrim(col_description(classes.oid, attributes.attnum)), '') is null;

  if v_missing_tables > 0 or v_missing_columns > 0 then
    raise exception 'JSON comments remain missing: % tables, % columns.',
      v_missing_tables, v_missing_columns;
  end if;

  raise notice 'Filled % table and % column JSON comments.', v_tables_written, v_columns_written;
end;
$migration$;
