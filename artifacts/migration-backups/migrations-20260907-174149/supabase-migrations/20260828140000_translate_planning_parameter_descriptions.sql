begin;

update public.planning_parameter as parameter
set description = translations.description
from (
  values
    ('currentdate', '当前计划日期。可填写 now 或日期时间值。'),
    ('last_currentdate', '上次完成计划运行的日期。'),
    ('plan.administrativeLeadtime', '管理提前期，单位为天。'),
    ('plan.minimumdelay', '最小交付日期增量，单位为秒。'),
    ('plan.loglevel', '计划日志详细级别。'),
    ('plan.rotateResources', '在备用资源之间分配需求。'),
    ('plan.individualPoolResources', '将资源池数量解释为单个成员。'),
    ('plan.move_approved_early', '控制已批准订单的提前重排。'),
    ('plan.autoFenceOperations', '等待已确认补给的天数。'),
    ('plan.deliveryDuration', '最终发货持续时间，单位为工作小时。'),
    ('plan.fixBrokenSupplyPath', '为中断的供应路径创建备用来源。'),
    ('plan.solver', '求解器选择：heuristic 或 heuristic_2。'),
    ('plan.iterationmax', '求解器最大迭代次数。'),
    ('plan.resourceiterationmax', '资源搜索最大迭代次数。'),
    ('forecast.calendar', '预测时间桶日历。'),
    ('forecast.Horizon_future', '预测未来范围，单位为天。'),
    ('forecast.Horizon_history', '预测历史范围，单位为天。'),
    ('forecast.populateForecastTable', '填充缺失的预测组合。'),
    ('forecast.runnetting', '将销售订单与预测进行净额计算。')
) as translations(name, description)
where parameter.name = translations.name
  and parameter.source = 'frepple-default';

commit;
