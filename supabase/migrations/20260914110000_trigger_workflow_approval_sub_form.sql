-- Human approval/review nodes are not task nodes.  Keep their inspector
-- schema limited to approval configuration, represented by one object field.
with approval_schema as (
  select jsonb_build_object(
    'columns', 1,
    'fields', jsonb_build_array(
      jsonb_build_object(
        'field', 'id', 'label', '节点 ID', 'component', 'vxe-input',
        'props', jsonb_build_object('clearable', false, 'disabled', true)
      ),
      jsonb_build_object(
        'field', 'name', 'label', '节点名称', 'component', 'vxe-input',
        'props', jsonb_build_object('clearable', true, 'placeholder', '请输入节点名称'),
        'rules', jsonb_build_array(jsonb_build_object('required', true, 'message', '节点名称不能为空'))
      ),
      jsonb_build_object(
        'field', 'description', 'label', '节点说明', 'component', 'vxe-textarea',
        'props', jsonb_build_object('rows', 3, 'resize', 'vertical', 'placeholder', '说明节点的业务用途')
      ),
      jsonb_build_object(
        'field', 'approval', 'label', '审批配置', 'component', 'lc-sub-form',
        'props', jsonb_build_object(
          'schema', jsonb_build_object(
            'columns', 1,
            'fields', jsonb_build_array(
              jsonb_build_object(
                'field', 'assigneeType', 'label', '处理人类型', 'component', 'vxe-select',
                'props', jsonb_build_object('clearable', false),
                'options', jsonb_build_array(
                  jsonb_build_object('label', '用户', 'value', 'user'),
                  jsonb_build_object('label', '角色', 'value', 'role'),
                  jsonb_build_object('label', '团队', 'value', 'team'),
                  jsonb_build_object('label', '表达式', 'value', 'expression')
                ),
                'rules', jsonb_build_array(jsonb_build_object('required', true, 'message', '处理人类型不能为空'))
              ),
              jsonb_build_object(
                'field', 'assigneeIds', 'label', '处理人标识', 'component', 'vxe-input',
                'props', jsonb_build_object('clearable', true, 'placeholder', '多个标识使用逗号分隔')
              ),
              jsonb_build_object(
                'field', 'timeoutSeconds', 'label', '审批超时秒数', 'component', 'lc-number-input',
                'props', jsonb_build_object('min', 1, 'step', 1, 'controls', true)
              ),
              jsonb_build_object(
                'field', 'onTimeout', 'label', '超时策略', 'component', 'vxe-select',
                'props', jsonb_build_object('clearable', false),
                'options', jsonb_build_array(
                  jsonb_build_object('label', '标记失败', 'value', 'fail'),
                  jsonb_build_object('label', '自动通过', 'value', 'autoApprove'),
                  jsonb_build_object('label', '自动驳回', 'value', 'autoReject'),
                  jsonb_build_object('label', '继续执行', 'value', 'continue')
                )
              ),
              jsonb_build_object(
                'field', 'completionStrategy', 'label', '完成策略', 'component', 'vxe-select',
                'props', jsonb_build_object('clearable', false),
                'options', jsonb_build_array(
                  jsonb_build_object('label', '任一人完成', 'value', 'any'),
                  jsonb_build_object('label', '全部完成', 'value', 'all'),
                  jsonb_build_object('label', '达到比例', 'value', 'ratio')
                )
              ),
              jsonb_build_object(
                'field', 'passRatio', 'label', '通过比例', 'component', 'lc-number-input',
                'props', jsonb_build_object(
                  'min', 0.01, 'max', 1, 'step', 0.01, 'controls', true,
                  'visibleWhen', jsonb_build_object('field', 'completionStrategy', 'equals', 'ratio')
                )
              )
            ),
            'actions', jsonb_build_array()
          )
        )
      ),
      jsonb_build_object(
        'field', 'metadata', 'label', '运行元数据', 'component', 'lc-json-editor',
        'props', jsonb_build_object('dialogTitle', '编辑运行元数据', 'jsonRootType', 'object', 'jsonValueMode', 'parsed', 'placeholder', '打开 JSON 编辑器')
      ),
      jsonb_build_object(
        'field', 'rawConfig', 'label', '完整配置', 'component', 'lc-json-editor',
        'help', '修改后将替换节点的全部 config。',
        'props', jsonb_build_object('dialogTitle', '编辑节点完整配置', 'jsonRootType', 'object', 'jsonValueMode', 'parsed', 'placeholder', '打开 JSON 编辑器')
      )
    ),
    'layout', jsonb_build_array(jsonb_build_object(
      'kind', 'tabs', 'defaultKey', 'basic',
      'tabs', jsonb_build_array(
        jsonb_build_object('key', 'basic', 'label', '基础信息', 'blocks', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'field', 'id'),
          jsonb_build_object('kind', 'field', 'field', 'name'),
          jsonb_build_object('kind', 'field', 'field', 'description')
        )),
        jsonb_build_object('key', 'approval', 'label', '审批设置', 'blocks', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'field', 'approval')
        )),
        jsonb_build_object('key', 'advanced', 'label', '高级配置', 'blocks', jsonb_build_array(
          jsonb_build_object('kind', 'field', 'field', 'metadata'),
          jsonb_build_object('kind', 'field', 'field', 'rawConfig')
        ))
      )
    )),
    'actions', jsonb_build_array()
  ) as schema
)
update public.lowcode_form_definitions definition
set schema = approval_schema.schema,
    updated_at = now()
from approval_schema
where definition.code in ('trigger-workflow.node.manual-approval', 'trigger-workflow.node.human-review');
