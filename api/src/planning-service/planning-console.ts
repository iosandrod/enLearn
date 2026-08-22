import { BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PLANNING_CONSOLE_DATASETS = [
  'summary',
  'demands',
  'operationPlans',
  'materials',
  'planResources',
  'resourcePlans',
  'problems',
  'constraints',
  'runs',
  'flow',
  'bom',
  'preflightIssues'
] as const;

export type PlanningConsoleDataset = typeof PLANNING_CONSOLE_DATASETS[number];

export type PlanningConsoleFilters = {
  scenarioId?: string;
  planVersionId?: string;
  itemId?: string;
  resourceId?: string;
  operationId?: string;
  operationStatus?: string;
  demandStatus?: string;
  from?: string;
  to?: string;
};

type PlanningRow = Record<string, unknown>;

type PlanningConsoleVersion = {
  id: string;
  code: string;
  name: string;
  scenario_id?: string;
  run_id?: string;
  status?: string;
  is_current?: boolean;
  version_no?: number;
  horizon_start?: string;
  horizon_end?: string;
  result_summary?: Record<string, unknown>;
  [key: string]: unknown;
};

type PlanningFlowData = {
  nodes: PlanningRow[];
  edges: PlanningRow[];
  lanes: PlanningRow[];
};

const CONSOLE_LIMIT = 1000;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function intervalHours(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value / 3_600;
  const text = readString(value).toLowerCase();
  if (!text) return 0;
  const signed = text.startsWith('-') ? -1 : 1;
  const normalized = text.replace(/^[+-]/, '');
  let seconds = 0;
  let matched = false;

  const dayMatch = normalized.match(/^(\d+(?:\.\d+)?)\s+days?\s*/);
  let timeText = normalized;
  if (dayMatch) {
    seconds += Number(dayMatch[1]) * 86_400;
    timeText = normalized.slice(dayMatch[0].length);
    matched = true;
  }

  const timeMatch = timeText.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (timeMatch) {
    seconds += Number(timeMatch[1]) * 3_600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
    matched = true;
  } else {
    const units: Record<string, number> = {
      day: 86_400,
      days: 86_400,
      hour: 3_600,
      hours: 3_600,
      minute: 60,
      minutes: 60,
      second: 1,
      seconds: 1
    };
    for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(days?|hours?|minutes?|seconds?)/g)) {
      seconds += Number(match[1]) * units[match[2]];
      matched = true;
    }
  }

  return matched && Number.isFinite(seconds) ? signed * seconds / 3_600 : 0;
}

function isRecord(value: unknown): value is PlanningRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIso(value: unknown) {
  const text = readString(value);
  if (!text) return '';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(readString).filter(Boolean))];
}

function rowIndex(rows: PlanningRow[], labelField = 'name') {
  return new Map(
    rows
      .map((row) => [readString(row.id), readString(row[labelField]) || readString(row.id)] as const)
      .filter(([id]) => Boolean(id))
  );
}

function itemLabelIndex(rows: PlanningRow[]) {
  return new Map(
    rows
      .map((row) => [
        readString(row.id),
        readString(row.display_name) || readString(row.name) || readString(row.id)
      ] as const)
      .filter(([id]) => Boolean(id))
  );
}

function applyVersionFilter(query: any, version?: PlanningConsoleVersion) {
  return version?.id
    ? query.eq('plan_version_id', version.id)
    : query.is('plan_version_id', null);
}

function applyWindow(query: any, filters: PlanningConsoleFilters, startField: string, endField?: string) {
  let next = query;
  if (filters.from) next = next.gte(endField ?? startField, filters.from);
  if (filters.to) next = next.lte(startField, filters.to);
  return next;
}

async function selectRows(
  client: SupabaseClient,
  accountId: string,
  table: string,
  select: string,
  configure?: (query: any) => any,
  limit = CONSOLE_LIMIT
) {
  let query: any = client.from(table).select(select).eq('account_id', accountId);
  if (configure) query = configure(query);
  if (limit > 0) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new BadRequestException(error.message);
  return ((data ?? []) as unknown[]).filter(isRecord);
}

async function countRows(
  client: SupabaseClient,
  accountId: string,
  table: string,
  configure?: (query: any) => any
) {
  let query: any = client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  if (configure) query = configure(query);
  const { count, error } = await query;
  if (error) throw new BadRequestException(error.message);
  return count ?? 0;
}

async function selectAllRows(
  client: SupabaseClient,
  accountId: string,
  table: string,
  select: string,
  configure?: (query: any) => any
) {
  const rows: PlanningRow[] = [];
  for (let from = 0; ; from += CONSOLE_LIMIT) {
    let query: any = client
      .from(table)
      .select(select)
      .eq('account_id', accountId);
    if (configure) query = configure(query);
    const { data, error } = await query.range(from, from + CONSOLE_LIMIT - 1);
    if (error) throw new BadRequestException(error.message);
    const page = ((data ?? []) as unknown[]).filter(isRecord);
    rows.push(...page);
    if (page.length < CONSOLE_LIMIT) return rows;
  }
}

async function selectByIds(
  client: SupabaseClient,
  accountId: string,
  table: string,
  ids: string[],
  select = 'id,name'
) {
  if (!ids.length) return [];
  return selectRows(
    client,
    accountId,
    table,
    select,
    (query) => query.in('id', ids),
    Math.min(Math.max(ids.length, 1), CONSOLE_LIMIT)
  );
}

async function resolveVersion(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters
) {
  let query: any = client
    .from('planning_plan_version')
    .select('*')
    .eq('account_id', accountId);

  if (filters.planVersionId) {
    query = query.eq('id', filters.planVersionId);
    if (filters.scenarioId) query = query.eq('scenario_id', filters.scenarioId);
  } else {
    if (filters.scenarioId) query = query.eq('scenario_id', filters.scenarioId);
    query = query
      .in('status', ['published', 'completed', 'running', 'draft'])
      .order('is_current', { ascending: false })
      .order('version_no', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(1);
  if (error) throw new BadRequestException(error.message);
  const version = (data ?? [])[0];
  if (!version && filters.planVersionId) {
    throw new BadRequestException(
      'The selected plan version does not exist in this account or does not belong to the selected scenario.'
    );
  }
  if (!version) return undefined;
  return version as PlanningConsoleVersion;
}

export function parsePlanningConsoleRequest(postData: PlanningRow) {
  const datasetValue = readString(postData.dataset);
  if (!PLANNING_CONSOLE_DATASETS.includes(datasetValue as PlanningConsoleDataset)) {
    throw new BadRequestException(`Unsupported planning console dataset: ${datasetValue || '(empty)'}.`);
  }

  const nestedFilters = isRecord(postData.filters) ? postData.filters : {};
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = readString(postData[key] ?? nestedFilters[key]);
      if (value) return value;
    }
    return undefined;
  };

  return {
    dataset: datasetValue as PlanningConsoleDataset,
    filters: {
      scenarioId: read('scenarioId', 'scenario_id'),
      planVersionId: read('planVersionId', 'plan_version_id'),
      itemId: read('itemId', 'item_id'),
      resourceId: read('resourceId', 'resource_id'),
      operationId: read('operationId', 'operation_id'),
      operationStatus: read('operationStatus', 'operation_status'),
      demandStatus: read('demandStatus', 'demand_status'),
      from: read('from', 'horizonStart', 'horizon_start'),
      to: read('to', 'horizonEnd', 'horizon_end')
    } satisfies PlanningConsoleFilters
  };
}

async function loadOperationPlans(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  let allowedPlanIds: string[] | undefined;
  if (filters.resourceId) {
    const assignments = await selectRows(
      client,
      accountId,
      'planning_operationplanresource',
      'operationplan_id',
      (base) => {
        let query = applyVersionFilter(base, version).eq('resource_id', filters.resourceId);
        return query;
      }
    );
    allowedPlanIds = uniqueStrings(assignments.map((row) => row.operationplan_id));
    if (!allowedPlanIds.length) return [];
  }

  const plans = await selectRows(
    client,
    accountId,
    'planning_operationplan',
    '*',
    (base) => {
      let query = applyVersionFilter(base, version);
      if (filters.itemId) query = query.eq('item_id', filters.itemId);
      if (filters.operationId) query = query.eq('operation_id', filters.operationId);
      if (filters.operationStatus) query = query.eq('status', filters.operationStatus);
      if (allowedPlanIds) query = query.in('id', allowedPlanIds);
      query = applyWindow(query, filters, 'startdate', 'enddate');
      return query.order('startdate', { ascending: true, nullsFirst: false });
    }
  );
  if (!plans.length) return [];

  const planIds = uniqueStrings(plans.map((row) => row.id));
  const [items, operations, locations, demands, assignments] = await Promise.all([
    selectByIds(client, accountId, 'planning_item', uniqueStrings(plans.map((row) => row.item_id)), 'id,name,display_name,uom'),
    selectByIds(client, accountId, 'planning_operation', uniqueStrings(plans.map((row) => row.operation_id)), 'id,name,type'),
    selectByIds(client, accountId, 'planning_location', uniqueStrings(plans.map((row) => row.location_id)), 'id,name'),
    selectByIds(client, accountId, 'planning_demand', uniqueStrings(plans.map((row) => row.demand_id)), 'id,name,due'),
    selectRows(
      client,
      accountId,
      'planning_operationplanresource',
      'operationplan_id,resource_id,quantity,status',
      (query) => applyVersionFilter(query, version).in('operationplan_id', planIds)
    )
  ]);
  const resources = await selectByIds(
    client,
    accountId,
    'planning_resource',
    uniqueStrings(assignments.map((row) => row.resource_id)),
    'id,name'
  );
  const itemNames = itemLabelIndex(items);
  const operationNames = rowIndex(operations);
  const locationNames = rowIndex(locations);
  const demandNames = rowIndex(demands);
  const resourceNames = rowIndex(resources);
  const resourceByPlan = new Map<string, string[]>();
  for (const assignment of assignments) {
    const planId = readString(assignment.operationplan_id);
    const resourceName = resourceNames.get(readString(assignment.resource_id));
    if (!planId || !resourceName) continue;
    resourceByPlan.set(planId, [...(resourceByPlan.get(planId) ?? []), resourceName]);
  }

  const result: PlanningRow[] = plans.map((row) => {
    const start = new Date(readString(row.startdate)).getTime();
    const end = new Date(readString(row.enddate)).getTime();
    const durationHours = Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, (end - start) / 3_600_000)
      : 0;
    const id = readString(row.id);
    return {
      ...row,
      version_code: version?.code ?? 'BASELINE',
      item_name: itemNames.get(readString(row.item_id)) ?? '',
      operation_name: operationNames.get(readString(row.operation_id)) ?? readString(row.name),
      location_name: locationNames.get(readString(row.location_id)) ?? '',
      demand_name: demandNames.get(readString(row.demand_id)) ?? '',
      resource_name: (resourceByPlan.get(id) ?? []).join(' / '),
      duration_hours: Math.round(durationHours * 100) / 100,
      delay_hours: Math.round(intervalHours(row.delay) * 100) / 100
    };
  });
  return result;
}

async function loadDemands(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  let allowedDemandIds: string[] | undefined;
  if (filters.operationId || filters.operationStatus || filters.resourceId) {
    const plans = await loadOperationPlans(client, accountId, filters, version);
    allowedDemandIds = uniqueStrings(plans.map((row) => row.demand_id));
    if (!allowedDemandIds.length) return [];
  }
  if (filters.scenarioId && version?.scenario_id !== filters.scenarioId) return [];
  const demands = await selectRows(
    client,
    accountId,
    'planning_demand',
    '*',
    (base) => {
      let query = base;
      if (filters.itemId) query = query.eq('item_id', filters.itemId);
      if (filters.demandStatus) query = query.eq('status', filters.demandStatus);
      if (allowedDemandIds) query = query.in('id', allowedDemandIds);
      query = applyWindow(query, filters, 'due');
      return query.order('due', { ascending: true });
    }
  );
  if (!demands.length) return [];

  const demandIds = uniqueStrings(demands.map((row) => row.id));
  const [plans, items, locations, customers] = await Promise.all([
    selectRows(
      client,
      accountId,
      'planning_operationplan',
      'id,demand_id,quantity,enddate,status',
      (base) => applyVersionFilter(base, version).in('demand_id', demandIds)
    ),
    selectByIds(client, accountId, 'planning_item', uniqueStrings(demands.map((row) => row.item_id)), 'id,name,display_name,uom'),
    selectByIds(client, accountId, 'planning_location', uniqueStrings(demands.map((row) => row.location_id)), 'id,name'),
    selectByIds(client, accountId, 'planning_customer', uniqueStrings(demands.map((row) => row.customer_id)), 'id,name')
  ]);
  const itemNames = itemLabelIndex(items);
  const locationNames = rowIndex(locations);
  const customerNames = rowIndex(customers);
  const plansByDemand = new Map<string, PlanningRow[]>();
  for (const plan of plans) {
    const demandId = readString(plan.demand_id);
    if (demandId) plansByDemand.set(demandId, [...(plansByDemand.get(demandId) ?? []), plan]);
  }

  return demands.map((row) => {
    const demandPlans = plansByDemand.get(readString(row.id)) ?? [];
    const plannedQuantity = demandPlans.reduce((sum, plan) => sum + readNumber(plan.quantity), 0);
    const deliveryDates = demandPlans.map((plan) => toIso(plan.enddate)).filter(Boolean).sort();
    const versionDeliveryDate = deliveryDates.at(-1) ?? '';
    const dueTime = new Date(readString(row.due)).getTime();
    const deliveryTime = new Date(versionDeliveryDate).getTime();
    const latenessHours = Number.isFinite(dueTime) && Number.isFinite(deliveryTime)
      ? Math.max(0, (deliveryTime - dueTime) / 3_600_000)
      : 0;
    return {
      ...row,
      version_code: version?.code ?? 'BASELINE',
      item_name: itemNames.get(readString(row.item_id)) ?? '',
      location_name: locationNames.get(readString(row.location_id)) ?? '',
      customer_name: customerNames.get(readString(row.customer_id)) ?? '',
      version_planned_quantity: plannedQuantity,
      version_delivery_date: versionDeliveryDate,
      lateness_hours: Math.round(latenessHours * 100) / 100,
      coverage_percent: readNumber(row.quantity) > 0
        ? Math.min(100, Math.round((plannedQuantity / readNumber(row.quantity)) * 10_000) / 100)
        : 0
    };
  });
}

async function loadMaterials(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  const rows = await selectRows(
    client,
    accountId,
    'planning_operationplanmaterial',
    '*',
    (base) => {
      let query = applyVersionFilter(base, version);
      if (filters.itemId) query = query.eq('item_id', filters.itemId);
      query = applyWindow(query, filters, 'flowdate');
      return query.order('flowdate', { ascending: true });
    }
  );
  if (!rows.length) return [];
  let selectedRows = rows;
  if (filters.operationId) {
    const plansForOperation = await selectRows(
      client,
      accountId,
      'planning_operationplan',
      'id',
      (base) => applyVersionFilter(base, version).eq('operation_id', filters.operationId)
    );
    const planIds = new Set(uniqueStrings(plansForOperation.map((row) => row.id)));
    selectedRows = rows.filter((row) => planIds.has(readString(row.operationplan_id)));
    if (!selectedRows.length) return [];
  }
  const [items, locations, plans] = await Promise.all([
    selectByIds(client, accountId, 'planning_item', uniqueStrings(selectedRows.map((row) => row.item_id)), 'id,name,display_name,uom'),
    selectByIds(client, accountId, 'planning_location', uniqueStrings(selectedRows.map((row) => row.location_id)), 'id,name'),
    selectByIds(client, accountId, 'planning_operationplan', uniqueStrings(selectedRows.map((row) => row.operationplan_id)), 'id,reference,operation_id')
  ]);
  const itemNames = itemLabelIndex(items);
  const itemUom = new Map(items.map((row) => [readString(row.id), readString(row.uom)]));
  const locationNames = rowIndex(locations);
  const planNames = rowIndex(plans, 'reference');
  return selectedRows.map((row) => ({
    ...row,
    item_name: itemNames.get(readString(row.item_id)) ?? '',
    item_uom: itemUom.get(readString(row.item_id)) ?? '',
    location_name: locationNames.get(readString(row.location_id)) ?? '',
    operationplan_reference: planNames.get(readString(row.operationplan_id)) ?? '',
    movement_type: readNumber(row.quantity) < 0 ? '消耗' : '产出'
  }));
}

async function loadPlanResources(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  const rows = await selectRows(
    client,
    accountId,
    'planning_operationplanresource',
    '*',
    (base) => {
      let query = applyVersionFilter(base, version);
      if (filters.resourceId) query = query.eq('resource_id', filters.resourceId);
      return query.order('created_at', { ascending: true });
    }
  );
  if (!rows.length) return [];
  const versionPlanIds = uniqueStrings(rows.map((row) => row.operationplan_id));
  const [resources, plans] = await Promise.all([
    selectByIds(client, accountId, 'planning_resource', uniqueStrings(rows.map((row) => row.resource_id)), 'id,name,type,maximum'),
    selectRows(
      client,
      accountId,
      'planning_operationplan',
      'id,reference,startdate,enddate,operation_id,item_id',
      (base) => applyVersionFilter(base, version).in('id', versionPlanIds),
      Math.min(Math.max(versionPlanIds.length, 1), CONSOLE_LIMIT)
    )
  ]);
  const resourceNames = rowIndex(resources);
  const planNames = rowIndex(plans, 'reference');
  const plansById = new Map(plans.map((row) => [readString(row.id), row]));
  return rows.map((row) => {
    const plan = plansById.get(readString(row.operationplan_id));
    return {
      ...row,
      resource_name: resourceNames.get(readString(row.resource_id)) ?? '',
      operationplan_reference: planNames.get(readString(row.operationplan_id)) ?? '',
      startdate: plan?.startdate ?? null,
      enddate: plan?.enddate ?? null,
      operation_id: plan?.operation_id ?? null,
      item_id: plan?.item_id ?? null
    };
  }).filter((row) => {
    if (filters.operationId && readString(row.operation_id) !== filters.operationId) return false;
    if (filters.itemId && readString(row.item_id) !== filters.itemId) return false;
    if (filters.from && toIso(row.enddate) < filters.from) return false;
    if (filters.to && toIso(row.startdate) > filters.to) return false;
    return true;
  });
}

async function loadResourcePlans(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  let allowedResourceIds: string[] | undefined;
  if (filters.itemId || filters.operationId || filters.operationStatus) {
    const plans = await loadOperationPlans(client, accountId, filters, version);
    const planIds = uniqueStrings(plans.map((row) => row.id));
    if (!planIds.length) return [];
    const assignments = await selectRows(
      client,
      accountId,
      'planning_operationplanresource',
      'resource_id',
      (base) => applyVersionFilter(base, version).in('operationplan_id', planIds)
    );
    allowedResourceIds = uniqueStrings(assignments.map((row) => row.resource_id));
    if (!allowedResourceIds.length) return [];
  }
  const rows = await selectAllRows(
    client,
    accountId,
    'planning_resourceplan',
    '*',
    (base) => {
      let query = applyVersionFilter(base, version);
      if (filters.resourceId) query = query.eq('resource_id', filters.resourceId);
      if (allowedResourceIds) query = query.in('resource_id', allowedResourceIds);
      query = applyWindow(query, filters, 'startdate');
      return query.order('startdate', { ascending: true });
    }
  );
  const resources = await selectByIds(
    client,
    accountId,
    'planning_resource',
    uniqueStrings(rows.map((row) => row.resource_id)),
    'id,name,type,maximum'
  );
  const resourceNames = rowIndex(resources);
  const result: PlanningRow[] = rows.map((row) => ({
    ...row,
    resource_name: resourceNames.get(readString(row.resource_id)) ?? '',
    utilization_percent: readNumber(row.available) > 0
      ? Math.round((readNumber(row.load) / readNumber(row.available)) * 10_000) / 100
      : 0,
    overloaded: readNumber(row.free) < 0
  }));
  return result;
}

async function loadProblems(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  return selectRows(
    client,
    accountId,
    'planning_problem',
    '*',
    (base) => applyWindow(
      applyVersionFilter(base, version),
      filters,
      'startdate',
      'enddate'
    ).order('startdate', { ascending: true })
  );
}

async function loadConstraints(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  const rows = await selectRows(
    client,
    accountId,
    'planning_constraint',
    '*',
    (base) => {
      let query = applyVersionFilter(base, version);
      if (filters.itemId) query = query.eq('item_id', filters.itemId);
      return applyWindow(query, filters, 'startdate', 'enddate')
        .order('startdate', { ascending: true });
    }
  );
  const [items, demands] = await Promise.all([
    selectByIds(client, accountId, 'planning_item', uniqueStrings(rows.map((row) => row.item_id)), 'id,name,display_name'),
    selectByIds(client, accountId, 'planning_demand', uniqueStrings(rows.map((row) => row.demand_id)), 'id,name')
  ]);
  const itemNames = itemLabelIndex(items);
  const demandNames = rowIndex(demands);
  return rows.map((row) => ({
    ...row,
    item_name: itemNames.get(readString(row.item_id)) ?? '',
    demand_name: demandNames.get(readString(row.demand_id)) ?? ''
  }));
}

async function loadRuns(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters
) {
  let versionRunId: string | undefined;
  if (filters.planVersionId) {
    const versions = await selectRows(
      client,
      accountId,
      'planning_plan_version',
      'run_id',
      (query) => query.eq('id', filters.planVersionId),
      1
    );
    versionRunId = readString(versions[0]?.run_id);
    if (!versionRunId) return [];
  }
  const rows = await selectRows(
    client,
    accountId,
    'planning_run',
    '*',
    (base) => {
      let query = base;
      if (filters.scenarioId) query = query.eq('scenario_id', filters.scenarioId);
      if (versionRunId) query = query.eq('id', versionRunId);
      query = applyWindow(query, filters, 'submitted');
      return query.order('submitted', { ascending: false });
    },
    300
  );
  const [scenarios, versions] = await Promise.all([
    selectByIds(client, accountId, 'planning_scenario', uniqueStrings(rows.map((row) => row.scenario_id)), 'id,name'),
    selectRows(
      client,
      accountId,
      'planning_plan_version',
      'id,code,name,run_id,status,is_current',
      (query) => query.in('run_id', uniqueStrings(rows.map((row) => row.id))),
      300
    )
  ]);
  const scenarioNames = rowIndex(scenarios);
  const versionByRun = new Map(versions.map((row) => [readString(row.run_id), row]));
  const result: PlanningRow[] = rows.map((row) => {
    const version = versionByRun.get(readString(row.id));
    return {
      ...row,
      scenario_name: scenarioNames.get(readString(row.scenario_id)) ?? '',
      plan_version_id: version?.id ?? null,
      version_code: version?.code ?? '',
      version_status: version?.status ?? ''
    };
  });
  return result;
}

function collectFlowEdges(
  operations: PlanningRow[],
  dependencies: PlanningRow[],
  suboperations: PlanningRow[]
) {
  const operationIds = new Set(operations.map((row) => readString(row.id)).filter(Boolean));
  const edges: PlanningRow[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (source: unknown, target: unknown, relation: string, label: string) => {
    const sourceId = readString(source);
    const targetId = readString(target);
    const key = `${sourceId}:${targetId}:${relation}`;
    if (!sourceId || !targetId || sourceId === targetId || !operationIds.has(sourceId) || !operationIds.has(targetId) || edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: key, source: sourceId, target: targetId, relation, label });
  };

  for (const dependency of dependencies) {
    addEdge(dependency.blockedby_id, dependency.operation_id, 'dependency', '前置约束');
  }

  const byParent = new Map<string, PlanningRow[]>();
  for (const relation of suboperations) {
    const parent = readString(relation.operation_id);
    if (parent) byParent.set(parent, [...(byParent.get(parent) ?? []), relation]);
  }
  for (const [parent, children] of byParent) {
    const ordered = [...children].sort((left, right) => readNumber(left.priority) - readNumber(right.priority));
    if (ordered[0]) addEdge(parent, ordered[0].suboperation_id, 'routing', '首道工序');
    for (let index = 1; index < ordered.length; index += 1) {
      addEdge(ordered[index - 1].suboperation_id, ordered[index].suboperation_id, 'routing', '顺序');
    }
  }

  for (const operation of operations) {
    addEdge(operation.owner_id, operation.id, 'owner', '包含');
  }

  return edges;
}

function orderFlowOperations(
  operationIds: string[],
  operationById: Map<string, PlanningRow>,
  edges: PlanningRow[],
  sourceIndex: Map<string, number>
) {
  const includedIds = new Set(operationIds);
  const indegree = new Map(operationIds.map((id) => [id, 0]));
  const nextById = new Map<string, string[]>();
  for (const edge of edges) {
    const source = readString(edge.source);
    const target = readString(edge.target);
    if (!includedIds.has(source) || !includedIds.has(target)) continue;
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
    nextById.set(source, [...(nextById.get(source) ?? []), target]);
  }
  const compare = (left: string, right: string) => {
    const priorityDifference = readNumber(operationById.get(left)?.priority) -
      readNumber(operationById.get(right)?.priority);
    return priorityDifference || (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0);
  };
  const ready = operationIds.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compare);
  const ordered: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) continue;
    ordered.push(id);
    for (const target of nextById.get(id) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort(compare);
      }
    }
  }
  return [
    ...ordered,
    ...operationIds.filter((id) => !ordered.includes(id)).sort(compare)
  ];
}

function layoutFlowNodes(
  operations: PlanningRow[],
  edges: PlanningRow[],
  suboperations: PlanningRow[]
) {
  const columnStep = 360;
  const laneStep = 196;
  const laneHeight = 184;
  const ids = operations.map((row) => readString(row.id)).filter(Boolean);
  const operationById = new Map(operations.map((row) => [readString(row.id), row]));
  const sourceIndex = new Map(ids.map((id, index) => [id, index]));
  const routeChildren = new Map<string, { id: string; priority: number }[]>();
  const claimedIds = new Set<string>();

  for (const relation of suboperations) {
    const routeId = readString(relation.operation_id);
    const childId = readString(relation.suboperation_id);
    if (!operationById.has(routeId) || !operationById.has(childId)) continue;
    routeChildren.set(routeId, [
      ...(routeChildren.get(routeId) ?? []),
      { id: childId, priority: readNumber(relation.priority) }
    ]);
  }
  for (const operation of operations) {
    const routeId = readString(operation.owner_id);
    const childId = readString(operation.id);
    if (!operationById.has(routeId) || !childId) continue;
    const children = routeChildren.get(routeId) ?? [];
    if (!children.some((entry) => entry.id === childId)) {
      routeChildren.set(routeId, [
        ...children,
        { id: childId, priority: readNumber(operation.priority) }
      ]);
    }
  }

  const routeIds = ids.filter((id) => {
    const operation = operationById.get(id);
    return readString(operation?.type) === 'routing' || (routeChildren.get(id)?.length ?? 0) > 0;
  }).sort((left, right) => {
    const priorityDifference = readNumber(operationById.get(left)?.priority) -
      readNumber(operationById.get(right)?.priority);
    return priorityDifference || (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0);
  });

  const laneEntries: { id: string; label: string; itemName: string; nodeIds: string[]; operationCount: number }[] = [];
  for (const routeId of routeIds) {
    if (claimedIds.has(routeId)) continue;
    const route = operationById.get(routeId);
    if (!route) continue;
    const childIds = [...(routeChildren.get(routeId) ?? [])]
      .sort((left, right) => left.priority - right.priority ||
        (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0))
      .map((entry) => entry.id)
      .filter((id, index, values) => id !== routeId && values.indexOf(id) === index && !claimedIds.has(id));
    const nodeIds = [routeId, ...childIds];
    nodeIds.forEach((id) => claimedIds.add(id));
    laneEntries.push({
      id: `lane:${routeId}`,
      label: readString(route.category) || readString(route.name) || routeId,
      itemName: readString(route.item_name),
      nodeIds,
      operationCount: childIds.length
    });
  }

  const unclaimedIds = ids.filter((id) => !claimedIds.has(id));
  const neighbors = new Map(unclaimedIds.map((id) => [id, new Set<string>()]));
  for (const edge of edges) {
    const source = readString(edge.source);
    const target = readString(edge.target);
    if (!neighbors.has(source) || !neighbors.has(target)) continue;
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const visited = new Set<string>();
  for (const firstId of unclaimedIds) {
    if (visited.has(firstId)) continue;
    const pending = [firstId];
    const componentIds: string[] = [];
    while (pending.length) {
      const id = pending.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      componentIds.push(id);
      pending.push(...(neighbors.get(id) ?? []));
    }
    const orderedIds = orderFlowOperations(componentIds, operationById, edges, sourceIndex);
    const firstOperation = operationById.get(orderedIds[0]);
    laneEntries.push({
      id: `lane:standalone:${orderedIds[0]}`,
      label: readString(firstOperation?.category) || readString(firstOperation?.item_name) || '独立工序',
      itemName: readString(firstOperation?.item_name),
      nodeIds: orderedIds,
      operationCount: orderedIds.length
    });
  }

  const positions = new Map<string, { x: number; y: number }>();
  const nodeMeta = new Map<string, { laneId: string; laneSequence: string | number }>();
  const lanes = laneEntries.map((lane, laneIndex) => {
    const y = 16 + laneIndex * laneStep;
    lane.nodeIds.forEach((id, index) => {
      positions.set(id, { x: 40 + index * columnStep, y: y + 40 });
      nodeMeta.set(id, {
        laneId: lane.id,
        laneSequence: readString(operationById.get(id)?.type) === 'routing'
          ? 'RT'
          : lane.nodeIds
            .slice(0, index + 1)
            .filter((nodeId) => readString(operationById.get(nodeId)?.type) !== 'routing')
            .length
      });
    });
    return {
      ...lane,
      x: 16,
      y,
      width: 316 + Math.max(0, lane.nodeIds.length - 1) * columnStep,
      height: laneHeight
    };
  });
  return { positions, lanes, nodeMeta };
}

export function buildPlanningFlowData(
  operations: PlanningRow[],
  dependencies: PlanningRow[],
  suboperations: PlanningRow[],
  operationMaterials: PlanningRow[] = [],
  operationResources: PlanningRow[] = []
): PlanningFlowData {
  const edges = collectFlowEdges(operations, dependencies, suboperations);
  const { positions, lanes, nodeMeta } = layoutFlowNodes(operations, edges, suboperations);
  const materialsByOperation = new Map<string, PlanningRow[]>();
  const resourcesByOperation = new Map<string, PlanningRow[]>();
  for (const row of operationMaterials) {
    const operationId = readString(row.operation_id);
    if (operationId) materialsByOperation.set(operationId, [...(materialsByOperation.get(operationId) ?? []), row]);
  }
  for (const row of operationResources) {
    const operationId = readString(row.operation_id);
    if (operationId) resourcesByOperation.set(operationId, [...(resourcesByOperation.get(operationId) ?? []), row]);
  }

  return {
    nodes: operations.map((operation) => {
      const id = readString(operation.id);
      const materials = materialsByOperation.get(id) ?? [];
      const resources = resourcesByOperation.get(id) ?? [];
      return {
        id,
        label: readString(operation.name) || id,
        type: readString(operation.type) || 'fixed_time',
        itemId: readString(operation.item_id),
        itemName: readString(operation.item_name),
        locationName: readString(operation.location_name),
        materialSummary: materials
          .slice(0, 3)
          .map((row) => `${readString(row.item_name)} ${readNumber(row.quantity)}`.trim())
          .join(' · '),
        resourceSummary: resources
          .slice(0, 3)
          .map((row) => readString(row.resource_name))
          .filter(Boolean)
          .join(' / '),
        laneId: nodeMeta.get(id)?.laneId ?? '',
        sequence: nodeMeta.get(id)?.laneSequence ?? '',
        position: positions.get(id) ?? { x: 40, y: 36 },
        raw: operation
      };
    }),
    edges,
    lanes
  };
}

async function loadFlow(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters
) {
  const [allOperations, dependencies, suboperations, materials, resources, items, locations] = await Promise.all([
    selectRows(client, accountId, 'planning_operation', '*', (query) => query.order('priority', { ascending: true })),
    selectRows(client, accountId, 'planning_operation_dependency', '*'),
    selectRows(client, accountId, 'planning_suboperation', '*'),
    selectRows(client, accountId, 'planning_operationmaterial', '*'),
    selectRows(client, accountId, 'planning_operationresource', '*'),
    selectRows(client, accountId, 'planning_item', 'id,name,display_name,uom'),
    selectRows(client, accountId, 'planning_location', 'id,name')
  ]);
  const resourceRows = await selectByIds(
    client,
    accountId,
    'planning_resource',
    uniqueStrings(resources.map((row) => row.resource_id)),
    'id,name'
  );
  const itemNames = itemLabelIndex(items);
  const locationNames = rowIndex(locations);
  const resourceNames = rowIndex(resourceRows);
  const enrichedMaterials: PlanningRow[] = materials.map((row) => ({
    ...row,
    item_name: itemNames.get(readString(row.item_id)) ?? ''
  }));
  const enrichedResources: PlanningRow[] = resources.map((row) => ({
    ...row,
    resource_name: resourceNames.get(readString(row.resource_id)) ?? ''
  }));

  let operations: PlanningRow[] = allOperations.map((row) => ({
    ...row,
    item_name: itemNames.get(readString(row.item_id)) ?? '',
    location_name: locationNames.get(readString(row.location_id)) ?? ''
  }));
  if (filters.itemId || filters.resourceId || filters.operationId) {
    const selectedIds = new Set<string>();
    for (const operation of operations) {
      if (filters.operationId && readString(operation.id) === filters.operationId) selectedIds.add(readString(operation.id));
      if (filters.itemId && readString(operation.item_id) === filters.itemId) selectedIds.add(readString(operation.id));
    }
    if (filters.itemId) {
      enrichedMaterials
        .filter((row) => readString(row.item_id) === filters.itemId)
        .forEach((row) => selectedIds.add(readString(row.operation_id)));
    }
    if (filters.resourceId) {
      enrichedResources
        .filter((row) => readString(row.resource_id) === filters.resourceId)
        .forEach((row) => selectedIds.add(readString(row.operation_id)));
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const relation of [...dependencies, ...suboperations]) {
        const source = readString(relation.blockedby_id ?? relation.operation_id);
        const target = readString(relation.suboperation_id ?? relation.operation_id);
        if (selectedIds.has(source) || selectedIds.has(target)) {
          const size = selectedIds.size;
          if (source) selectedIds.add(source);
          if (target) selectedIds.add(target);
          changed = changed || selectedIds.size !== size;
        }
      }
    }
    operations = operations.filter((row) => selectedIds.has(readString(row.id)));
  }
  return buildPlanningFlowData(operations, dependencies, suboperations, enrichedMaterials, enrichedResources);
}

export function buildPlanningBomTree(
  items: PlanningRow[],
  operations: PlanningRow[],
  operationMaterials: PlanningRow[],
  rootItemId?: string,
  suboperations: PlanningRow[] = []
) {
  const itemsById = new Map(items.map((row) => [readString(row.id), row]));
  const operationsById = new Map(operations.map((row) => [readString(row.id), row]));
  const operationsByProduct = new Map<string, PlanningRow[]>();
  const componentsByOperation = new Map<string, PlanningRow[]>();
  const consumedIds = new Set<string>();
  const routeStepsByOperation = new Map<string, PlanningRow[]>();

  for (const relation of suboperations) {
    const operationId = readString(relation.operation_id);
    const suboperation = operationsById.get(readString(relation.suboperation_id));
    if (!operationId || !suboperation) continue;
    routeStepsByOperation.set(operationId, [
      ...(routeStepsByOperation.get(operationId) ?? []),
      { ...suboperation, route_priority: readNumber(relation.priority) }
    ]);
  }
  for (const operation of operations) {
    const ownerId = readString(operation.owner_id);
    if (!ownerId) continue;
    const existing = routeStepsByOperation.get(ownerId) ?? [];
    if (!existing.some((row) => readString(row.id) === readString(operation.id))) {
      routeStepsByOperation.set(ownerId, [...existing, operation]);
    }
  }
  for (const [operationId, steps] of routeStepsByOperation) {
    routeStepsByOperation.set(operationId, [...steps].sort((left, right) =>
      readNumber(left.route_priority ?? left.priority) - readNumber(right.route_priority ?? right.priority)
    ));
  }

  for (const operation of operations) {
    const productId = readString(operation.item_id);
    if (productId) operationsByProduct.set(productId, [...(operationsByProduct.get(productId) ?? []), operation]);
  }
  for (const material of operationMaterials) {
    const operationId = readString(material.operation_id);
    if (!operationId || readNumber(material.quantity) >= 0) continue;
    componentsByOperation.set(operationId, [...(componentsByOperation.get(operationId) ?? []), material]);
    const itemId = readString(material.item_id);
    if (itemId) consumedIds.add(itemId);
  }

  const operationComponents = (operationId: string) => {
    const direct = componentsByOperation.get(operationId) ?? [];
    const routed = (routeStepsByOperation.get(operationId) ?? []).flatMap((step) =>
      componentsByOperation.get(readString(step.id)) ?? []
    );
    return [...direct, ...routed];
  };

  const roots = rootItemId
    ? [rootItemId]
    : [...operationsByProduct.keys()].filter((itemId) => !consumedIds.has(itemId)).slice(0, 40);
  const fallbackRoots = roots.length ? roots : [...operationsByProduct.keys()].slice(0, 40);

  const buildItemNode = (itemId: string, path: string[], quantity?: number, depth = 0): PlanningRow => {
    const item = itemsById.get(itemId) ?? { id: itemId, name: itemId };
    const cycle = path.includes(itemId);
    const nextPath = [...path, itemId];
    const itemOperations = cycle || depth >= 7 ? [] : operationsByProduct.get(itemId) ?? [];
    return {
      id: `${nextPath.join('/')}:item`,
      entityId: itemId,
      entityType: 'item',
      title: readString(item.display_name) || readString(item.name) || itemId,
      subtitle: cycle
        ? '循环引用'
        : [readString(item.name), readString(item.description)].filter(Boolean).join(' · '),
      type: depth === 0 ? 'product' : 'item',
      quantity: typeof quantity === 'number' ? Math.abs(quantity) : undefined,
      uom: readString(item.uom),
      cycle,
      children: itemOperations.map((operation, operationIndex) => {
        const operationId = readString(operation.id);
        const operationType = readString(operation.type);
        return {
          id: `${nextPath.join('/')}:operation:${operationId}:${operationIndex}`,
          entityId: operationId,
          entityType: 'operation',
          operationId,
          title: readString(operation.name) || operationId,
          subtitle: operationType,
          type: operationType === 'routing' ? 'routing' : 'operation',
          children: operationComponents(operationId).map((material, index) =>
            buildItemNode(
              readString(material.item_id),
              [...nextPath, `${operationId}-${index}`],
              readNumber(material.quantity),
              depth + 1
            )
          )
        };
      })
    };
  };

  return fallbackRoots.map((itemId) => buildItemNode(itemId, []));
}

async function loadBom(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters
) {
  const [items, operations, materials, suboperations] = await Promise.all([
    selectRows(client, accountId, 'planning_item', 'id,name,display_name,description,uom'),
    selectRows(client, accountId, 'planning_operation', 'id,name,type,item_id,owner_id,priority'),
    selectRows(client, accountId, 'planning_operationmaterial', 'id,operation_id,item_id,quantity,quantity_fixed,type'),
    selectRows(client, accountId, 'planning_suboperation', 'id,operation_id,suboperation_id,priority')
  ]);
  return buildPlanningBomTree(items, operations, materials, filters.itemId, suboperations);
}

export async function loadPlanningConsoleSummary(
  client: SupabaseClient,
  accountId: string,
  filters: PlanningConsoleFilters,
  version: PlanningConsoleVersion | undefined
) {
  const needsPlanScope = Boolean(filters.resourceId);
  const planScopeRows = needsPlanScope
    ? await selectAllRows(
        client,
        accountId,
        'planning_operationplanresource',
        'operationplan_id',
        (base) => applyVersionFilter(base, version).eq('resource_id', filters.resourceId)
      )
    : [];
  const allowedPlanIds = needsPlanScope
    ? uniqueStrings(planScopeRows.map((row) => row.operationplan_id))
    : undefined;

  const configureOperationPlans = (base: any) => {
    let query = applyVersionFilter(base, version);
    if (filters.itemId) query = query.eq('item_id', filters.itemId);
    if (filters.operationId) query = query.eq('operation_id', filters.operationId);
    if (filters.operationStatus) query = query.eq('status', filters.operationStatus);
    if (allowedPlanIds?.length) query = query.in('id', allowedPlanIds);
    if (allowedPlanIds && !allowedPlanIds.length) query = query.eq('id', SUMMARY_IMPOSSIBLE_ID);
    return applyWindow(query, filters, 'startdate', 'enddate');
  };

  const needsDemandPlanScope = Boolean(filters.operationId || filters.operationStatus || filters.resourceId);
  const needsResourcePlanScope = Boolean(filters.itemId || filters.operationId || filters.operationStatus);
  const filteredPlanRows = needsDemandPlanScope || needsResourcePlanScope
    ? await selectAllRows(
        client,
        accountId,
        'planning_operationplan',
        'id,demand_id',
        configureOperationPlans
      )
    : [];
  const allowedDemandIds = needsDemandPlanScope
    ? uniqueStrings(filteredPlanRows.map((row) => row.demand_id))
    : undefined;
  const filteredPlanIds = needsResourcePlanScope
    ? uniqueStrings(filteredPlanRows.map((row) => row.id))
    : undefined;
  const resourceScopeRows = filteredPlanIds?.length
    ? await selectAllRows(
        client,
        accountId,
        'planning_operationplanresource',
        'resource_id',
        (base) => applyVersionFilter(base, version).in('operationplan_id', filteredPlanIds)
      )
    : [];
  const allowedResourceIds = needsResourcePlanScope
    ? uniqueStrings(resourceScopeRows.map((row) => row.resource_id))
    : undefined;
  const configureDemands = (base: any) => {
    let query = base;
    if (filters.itemId) query = query.eq('item_id', filters.itemId);
    if (filters.demandStatus) query = query.eq('status', filters.demandStatus);
    if (allowedDemandIds?.length) query = query.in('id', allowedDemandIds);
    if (allowedDemandIds && !allowedDemandIds.length) query = query.eq('id', SUMMARY_IMPOSSIBLE_ID);
    return applyWindow(query, filters, 'due');
  };

  const configureProblems = (base: any) => applyWindow(
    applyVersionFilter(base, version),
    filters,
    'startdate',
    'enddate'
  );
  const configureConstraints = (base: any) => {
    let query = applyVersionFilter(base, version);
    if (filters.itemId) query = query.eq('item_id', filters.itemId);
    return applyWindow(query, filters, 'startdate', 'enddate');
  };
  const configureRuns = (base: any) => {
    let query = base;
    if (filters.scenarioId) query = query.eq('scenario_id', filters.scenarioId);
    if (filters.planVersionId && version?.run_id) query = query.eq('id', version.run_id);
    return applyWindow(query, filters, 'submitted');
  };
  const configureActiveRuns = (base: any) => configureRuns(base).in('status', ['queued', 'running']);

  const [
    operationPlanCount,
    demandCount,
    problemCount,
    constraintCount,
    activeRunCount,
    demandRows,
    versionPlanRows,
    overloadedRows,
    latestRuns
  ] = await Promise.all([
    countRows(client, accountId, 'planning_operationplan', configureOperationPlans),
    filters.scenarioId && version?.scenario_id !== filters.scenarioId
      ? Promise.resolve(0)
      : countRows(client, accountId, 'planning_demand', configureDemands),
    countRows(client, accountId, 'planning_problem', configureProblems),
    countRows(client, accountId, 'planning_constraint', configureConstraints),
    countRows(client, accountId, 'planning_run', configureActiveRuns),
    filters.scenarioId && version?.scenario_id !== filters.scenarioId
      ? Promise.resolve([])
      : selectAllRows(client, accountId, 'planning_demand', 'id,due', configureDemands),
    selectAllRows(
      client,
      accountId,
      'planning_operationplan',
      'demand_id,enddate',
      (base) => applyVersionFilter(base, version)
    ),
    selectAllRows(
      client,
      accountId,
      'planning_resourceplan',
      'resource_id',
      (base) => {
        let query = applyVersionFilter(base, version).lt('free', 0);
        if (filters.resourceId) query = query.eq('resource_id', filters.resourceId);
        if (allowedResourceIds?.length) query = query.in('resource_id', allowedResourceIds);
        if (allowedResourceIds && !allowedResourceIds.length) {
          query = query.eq('resource_id', SUMMARY_IMPOSSIBLE_ID);
        }
        return applyWindow(query, filters, 'startdate');
      }
    ),
    selectRows(
      client,
      accountId,
      'planning_run',
      '*',
      (base) => configureRuns(base).order('submitted', { ascending: false }),
      1
    )
  ]);

  const dueByDemand = new Map(
    demandRows.map((row) => [readString(row.id), new Date(readString(row.due)).getTime()])
  );
  const latestDeliveryByDemand = new Map<string, number>();
  for (const row of versionPlanRows) {
    const demandId = readString(row.demand_id);
    const delivery = new Date(readString(row.enddate)).getTime();
    if (!demandId || !dueByDemand.has(demandId) || !Number.isFinite(delivery)) continue;
    latestDeliveryByDemand.set(
      demandId,
      Math.max(latestDeliveryByDemand.get(demandId) ?? Number.NEGATIVE_INFINITY, delivery)
    );
  }
  const lateDemandCount = [...dueByDemand].filter(([demandId, due]) => {
    const delivery = latestDeliveryByDemand.get(demandId);
    return Number.isFinite(due) && typeof delivery === 'number' && delivery > due;
  }).length;
  const latestRun = latestRuns[0] ?? {};
  return {
    versionId: version?.id ?? '',
    versionCode: version?.code ?? 'BASELINE',
    versionName: version?.name ?? '基线数据',
    versionStatus: version?.status ?? 'baseline',
    horizonStart: version?.horizon_start ?? '',
    horizonEnd: version?.horizon_end ?? '',
    operationPlanCount,
    demandCount,
    lateDemandCount,
    problemCount,
    constraintCount,
    activeRunCount,
    overloadedResourceCount: new Set(
      overloadedRows.map((row) => readString(row.resource_id)).filter(Boolean)
    ).size,
    latestRunId: latestRun.id ?? '',
    latestRunName: latestRun.name ?? '',
    latestRunStatus: latestRun.status ?? '',
    latestRunProgress: latestRun.progress ?? 0,
    latestRunMessage: latestRun.message ?? '',
    resultSummary: version?.result_summary ?? {}
  };
}

const SUMMARY_IMPOSSIBLE_ID = '00000000-0000-0000-0000-000000000000';

export async function loadPlanningConsoleDataset(
  client: SupabaseClient,
  accountId: string,
  dataset: PlanningConsoleDataset,
  filters: PlanningConsoleFilters
) {
  if (dataset === 'preflightIssues') {
    throw new BadRequestException('Preflight issues must be loaded through preflightSupplyPlanIssues.');
  }
  const version = await resolveVersion(client, accountId, filters);

  switch (dataset) {
    case 'summary':
      return loadPlanningConsoleSummary(client, accountId, filters, version);
    case 'demands':
      return loadDemands(client, accountId, filters, version);
    case 'operationPlans':
      return loadOperationPlans(client, accountId, filters, version);
    case 'materials':
      return loadMaterials(client, accountId, filters, version);
    case 'planResources':
      return loadPlanResources(client, accountId, filters, version);
    case 'resourcePlans':
      return loadResourcePlans(client, accountId, filters, version);
    case 'problems':
      return loadProblems(client, accountId, filters, version);
    case 'constraints':
      return loadConstraints(client, accountId, filters, version);
    case 'runs':
      return loadRuns(client, accountId, filters);
    case 'flow':
      return loadFlow(client, accountId, filters);
    case 'bom':
      return loadBom(client, accountId, filters);
  }
}
