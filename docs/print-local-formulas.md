# 本地打印预览简易公式

选中文本节点，在属性表单的文本输入框旁点击“插入公式”，依次选择函数、明细源、字段、全单/本页、小数位。弹窗生成 `{{…}}` 公式并显示示例结果；可切换示例页核对分页统计。点击插入后追加到文本末尾，可通过撤销恢复。COUNT 按明细记录计数，无需选择字段。

本次仅接入本地预览及其浏览器打印链路。服务端预览和 PDF 导出尚未接入。原有字段绑定、命名高级表达式及节点 JavaScript 表达式保持兼容。

“插入公式”通过 `confirmForm({ formCode: 'print-designer.formula' })` 打开，表单字段、布局和静态选项存储于数据库 `lowcode_form_definitions`；明细源、字段、分页选项和示例结果由当前编辑器动态提供。插入后的公式仍作为节点文本随模板保存，不单独创建公式历史记录。部署时执行迁移 `supabase/migrations/20261013100000_print_formula_confirm_form.sql`，或运行 `pnpm --dir api exec tsx scripts/apply-print-formula-confirm-form.ts` 应用并验证表单定义。

| 示例 | 结果含义 |
| --- | --- |
| `{{TOTAL(items.amount)}}` | 当前单据 items 明细的金额合计，SUM 为别名 |
| `{{MAX(items.amount)}}` | 有效数值的最大值 |
| `{{MIN(items.amount)}}` | 有效数值的最小值 |
| `{{AVERAGE(items.amount)}}` | 有效数值的平均值 |
| `{{COUNT(items)}}` | 明细记录数 |
| `{{COUNT(items.amount)}}` | 有效数值数 |
| `{{TOTAL(items.amount, "page") \| fixed:2}}` | 本页小计，固定两位小数 |

默认范围为全单，也可显式使用 `"all"`。物料组件模式的“本页”使用实际分页后的表格记录；明细数据模式的“本页”使用当前明细记录。没有对应本页数据时提示错误，避免将全单总计误作本页小计。多条表头记录各自统计；重复列表节点仍使用所属单据的完整明细计算全单公式。

有限数字和非空的数字字符串参与计算。null、undefined、空串、纯空白、布尔值、非数字字符串、NaN 和 Infinity 不参与数值计算；0 是有效数值。无有效数值时 TOTAL 返回 0，MAX/MIN/AVERAGE 显示为空，即使指定 fixed 也不会把空值变成 0。COUNT(items) 统计记录，包含字段为空的记录。

函数名不区分大小写，字段路径区分大小写。支持嵌套对象字段（例如 items.price.amount）；第一版不支持四则运算、任意函数调用或条件表达式。解析器不执行 JavaScript。错误提示包含节点 ID 和出错公式。新增公式无需保存到表达式库，随节点文本保存到模板。

验证：在仓库根目录运行 `pnpm --dir packages/tldraw-vue test:print-formulas`。浏览器回归使用本地 Edge，可通过 PRINT_TEST_BROWSER 指定 Chromium 路径。
