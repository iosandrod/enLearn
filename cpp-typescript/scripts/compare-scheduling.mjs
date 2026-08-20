import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildComplexScenarios } from "./complex-scenarios.mjs";

const { Client } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const workspaceDirectory = resolve(projectDirectory, "..");
const outputDirectory = resolve(projectDirectory, ".schedule-diff");
const databaseUrl = process.env.FREPPLE_TEST_DATABASE
  ?? "postgresql://postgres:123456@127.0.0.1:5432/frepple";
const dockerImage = process.env.FREPPLE_NATIVE_IMAGE ?? "frepple-source-runtime:9.18-dev";
const scenarioName = process.env.FREPPLE_SCENARIO ?? "all";

const legacySeedScenarios = [
  {
    name: "resource_capacity",
    description: "Finite capacity, material replenishment, priority and one late demand",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [{ name: "end item" }],
      operations: [
        { name: "make end item", type: "fixed_time", duration: 86_400 },
        { name: "delivery end item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [{ name: "end item", item: "end item", producing: "make end item", onhand: 0 }],
      resources: [{ name: "Resource", maximum: 1, maxearly: 345_600 }],
      loads: [{ operation: "make end item", resource: "Resource", quantity: 1 }],
      flows: [
        { type: "start", operation: "delivery end item", buffer: "end item", quantity: -1 },
        { type: "end", operation: "make end item", buffer: "end item", quantity: 1 },
      ],
      demands: [
        { name: "order 1", item: "end item", operation: "delivery end item", quantity: 10, due: "2009-01-20T00:00:00", priority: 1 },
        { name: "order 2", item: "end item", operation: "delivery end item", quantity: 10, due: "2009-01-20T00:00:00", priority: 2 },
        { name: "order 3", item: "end item", operation: "delivery end item", quantity: 10, due: "2009-01-17T12:00:00", priority: 3 },
        { name: "order 4", item: "end item", operation: "delivery end item", quantity: 10, due: "2009-01-20T00:00:00", priority: 4 },
        { name: "order 5", item: "end item", operation: "delivery end item", quantity: 10, due: "2009-01-20T00:00:00", priority: 5 },
      ],
    },
  },
  {
    name: "material_chain",
    description: "Three-level material chain with finite raw-material inventory and recursive replenishment",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [
        { name: "raw material" },
        { name: "component" },
        { name: "finished item" },
      ],
      operations: [
        { name: "make component", type: "fixed_time", duration: 172_800 },
        { name: "make finished item", type: "fixed_time", duration: 86_400 },
        { name: "delivery finished item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "raw material", item: "raw material", onhand: 30 },
        { name: "component", item: "component", producing: "make component", onhand: 0 },
        { name: "finished item", item: "finished item", producing: "make finished item", onhand: 0 },
      ],
      resources: [],
      loads: [],
      flows: [
        { type: "start", operation: "delivery finished item", buffer: "finished item", quantity: -1 },
        { type: "end", operation: "make finished item", buffer: "finished item", quantity: 1 },
        { type: "start", operation: "make finished item", buffer: "component", quantity: -1 },
        { type: "end", operation: "make component", buffer: "component", quantity: 1 },
        { type: "start", operation: "make component", buffer: "raw material", quantity: -2 },
      ],
      demands: [
        {
          name: "chain order", item: "finished item", operation: "delivery finished item",
          quantity: 10, due: "2009-01-20T00:00:00", priority: 1,
        },
      ],
    },
  },
  {
    name: "alternate_resource",
    description: "Priority ordered alternate loads choose a second resource when the preferred resource is full",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [{ name: "alternate item" }],
      operations: [
        { name: "make alternate item", type: "fixed_time", duration: 86_400 },
        { name: "delivery alternate item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "alternate item", item: "alternate item", producing: "make alternate item", onhand: 0 },
      ],
      resources: [
        { name: "Resource A", maximum: 1, maxearly: 0 },
        { name: "Resource B", maximum: 1, maxearly: 0 },
      ],
      loads: [
        {
          operation: "make alternate item", resource: "Resource A", quantity: 1,
          name: "machine", priority: 1, search: "PRIORITY",
        },
        {
          operation: "make alternate item", resource: "Resource B", quantity: 1,
          name: "machine", priority: 2, search: "PRIORITY",
        },
      ],
      flows: [
        { type: "start", operation: "delivery alternate item", buffer: "alternate item", quantity: -1 },
        { type: "end", operation: "make alternate item", buffer: "alternate item", quantity: 1 },
      ],
      demands: [
        {
          name: "alternate order 1", item: "alternate item", operation: "delivery alternate item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 1,
        },
        {
          name: "alternate order 2", item: "alternate item", operation: "delivery alternate item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 2,
        },
      ],
    },
  },
  {
    name: "alternate_flow",
    description: "Priority ordered alternate consuming flows switch material after preferred inventory is exhausted",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [
        { name: "component A" },
        { name: "component B" },
        { name: "flow item" },
      ],
      operations: [
        { name: "make flow item", type: "fixed_time", duration: 86_400 },
        { name: "delivery flow item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "component A", item: "component A", onhand: 1 },
        { name: "component B", item: "component B", onhand: 2 },
        { name: "flow item", item: "flow item", producing: "make flow item", onhand: 0 },
      ],
      resources: [],
      loads: [],
      flows: [
        { type: "start", operation: "delivery flow item", buffer: "flow item", quantity: -1 },
        { type: "end", operation: "make flow item", buffer: "flow item", quantity: 1 },
        {
          type: "start", operation: "make flow item", buffer: "component A", quantity: -1,
          name: "component", priority: 1,
        },
        {
          type: "start", operation: "make flow item", buffer: "component B", quantity: -1,
          name: "component", priority: 2,
        },
      ],
      demands: [
        {
          name: "flow order 1", item: "flow item", operation: "delivery flow item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 1,
        },
        {
          name: "flow order 2", item: "flow item", operation: "delivery flow item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 2,
        },
      ],
    },
  },
  {
    name: "routing",
    description: "Two sequential fixed-time routing steps with material produced by the final step",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [{ name: "routed item" }],
      operations: [
        { name: "routing step 1", type: "fixed_time", duration: 172_800 },
        { name: "routing step 2", type: "fixed_time", duration: 86_400 },
        {
          name: "make routed item", type: "routing",
          suboperations: [
            { operation: "routing step 1", priority: 1 },
            { operation: "routing step 2", priority: 2 },
          ],
        },
        { name: "delivery routed item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "routed item", item: "routed item", producing: "make routed item", onhand: 0 },
      ],
      resources: [],
      loads: [],
      flows: [
        { type: "start", operation: "delivery routed item", buffer: "routed item", quantity: -1 },
        { type: "end", operation: "routing step 2", buffer: "routed item", quantity: 1 },
      ],
      demands: [
        {
          name: "routing order", item: "routed item", operation: "delivery routed item",
          quantity: 10, due: "2009-01-20T00:00:00", priority: 1,
        },
      ],
    },
  },
  {
    name: "alternate_operation",
    description: "Priority alternate operation rolls back an infeasible preferred process and selects the fallback process",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [
        { name: "alternate process item" },
        { name: "preferred component" },
        { name: "fallback component" },
      ],
      operations: [
        { name: "preferred process", type: "fixed_time", duration: 172_800 },
        { name: "fallback process", type: "fixed_time", duration: 86_400 },
        {
          name: "make alternate process item", type: "alternate", search: "PRIORITY",
          suboperations: [
            { operation: "preferred process", priority: 1 },
            { operation: "fallback process", priority: 2 },
          ],
        },
        { name: "delivery alternate process item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "alternate process item", item: "alternate process item", producing: "make alternate process item", onhand: 0 },
        { name: "preferred component", item: "preferred component", onhand: 0 },
        { name: "fallback component", item: "fallback component", onhand: 1 },
      ],
      resources: [],
      loads: [],
      flows: [
        { type: "start", operation: "delivery alternate process item", buffer: "alternate process item", quantity: -1 },
        { type: "end", operation: "preferred process", buffer: "alternate process item", quantity: 1 },
        { type: "start", operation: "preferred process", buffer: "preferred component", quantity: -1 },
        { type: "end", operation: "fallback process", buffer: "alternate process item", quantity: 1 },
        { type: "start", operation: "fallback process", buffer: "fallback component", quantity: -1 },
      ],
      demands: [
        {
          name: "alternate process order", item: "alternate process item",
          operation: "delivery alternate process item", quantity: 1,
          due: "2009-01-20T00:00:00", priority: 1,
        },
      ],
    },
  },
  {
    name: "skills",
    description: "A resource pool assigns work only to qualified members and honors resource-skill priority",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [{ name: "skilled item" }],
      operations: [
        { name: "make skilled item", type: "fixed_time", duration: 86_400 },
        { name: "delivery skilled item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "skilled item", item: "skilled item", producing: "make skilled item", onhand: 0 },
      ],
      resources: [
        { name: "operator pool", maximum: 1, maxearly: 0 },
        { name: "operator A", owner: "operator pool", maximum: 1, maxearly: 0, efficiency: 100 },
        { name: "operator B", owner: "operator pool", maximum: 1, maxearly: 0, efficiency: 100 },
        { name: "operator unqualified", owner: "operator pool", maximum: 1, maxearly: 0, efficiency: 200 },
      ],
      skills: [{ name: "assembly qualification" }],
      resourceSkills: [
        { resource: "operator A", skill: "assembly qualification", priority: 2 },
        { resource: "operator B", skill: "assembly qualification", priority: 1 },
      ],
      loads: [
        {
          operation: "make skilled item", resource: "operator pool", quantity: 1,
          skill: "assembly qualification", search: "PRIORITY",
        },
      ],
      flows: [
        { type: "start", operation: "delivery skilled item", buffer: "skilled item", quantity: -1 },
        { type: "end", operation: "make skilled item", buffer: "skilled item", quantity: 1 },
      ],
      demands: [
        {
          name: "skilled order", item: "skilled item", operation: "delivery skilled item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 1,
        },
      ],
    },
  },
  {
    name: "setup_transition",
    description: "Two differently configured orders share one resource and include setup-matrix transition time",
    model: {
      current: "2009-01-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: 86_400 },
      items: [{ name: "red item" }, { name: "blue item" }],
      operations: [
        { name: "make red item", type: "fixed_time", duration: 86_400 },
        { name: "make blue item", type: "fixed_time", duration: 86_400 },
        { name: "delivery red item", type: "fixed_time", duration: 86_400 },
        { name: "delivery blue item", type: "fixed_time", duration: 86_400 },
      ],
      buffers: [
        { name: "red item", item: "red item", producing: "make red item", onhand: 0 },
        { name: "blue item", item: "blue item", producing: "make blue item", onhand: 0 },
      ],
      setupMatrices: [
        {
          name: "color changeover",
          rules: [
            { priority: 1, from: "green", to: "red", duration: 172_800, cost: 10 },
            { priority: 2, from: "red", to: "blue", duration: 86_400, cost: 20 },
            { priority: 3, from: "green", to: "blue", duration: 259_200, cost: 30 },
            { priority: 4, from: "blue", to: "red", duration: 86_400, cost: 20 },
            { priority: 99, from: ".*", to: ".*", duration: 43_200, cost: 50 },
          ],
        },
      ],
      resources: [
        {
          name: "painting line", maximum: 1, maxearly: 2_592_000,
          setupMatrix: "color changeover", setup: "green",
        },
      ],
      loads: [
        { operation: "make red item", resource: "painting line", quantity: 1, setup: "red" },
        { operation: "make blue item", resource: "painting line", quantity: 1, setup: "blue" },
      ],
      flows: [
        { type: "start", operation: "delivery red item", buffer: "red item", quantity: -1 },
        { type: "end", operation: "make red item", buffer: "red item", quantity: 1 },
        { type: "start", operation: "delivery blue item", buffer: "blue item", quantity: -1 },
        { type: "end", operation: "make blue item", buffer: "blue item", quantity: 1 },
      ],
      demands: [
        {
          name: "red order", item: "red item", operation: "delivery red item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 1,
        },
        {
          name: "blue order", item: "blue item", operation: "delivery blue item",
          quantity: 1, due: "2009-01-20T00:00:00", priority: 2,
        },
      ],
    },
  },
];
const seedScenarios = buildComplexScenarios();

function fail(message, result) {
  const details = [result?.stdout, result?.stderr].filter(Boolean).join("\n").trim();
  throw new Error(details ? `${message}\n${details}` : message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    encoding: "utf8",
    env: { ...process.env, TZ: "EST" },
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} exited with status ${result.status}`, result);
  return result;
}

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function durationXml(seconds) {
  assert.ok(Number.isFinite(seconds) && seconds >= 0, `Invalid duration ${seconds}`);
  if (seconds === 0) return "PT0S";
  const days = Math.floor(seconds / 86_400);
  let remaining = seconds - days * 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining -= hours * 3_600;
  const minutes = Math.floor(remaining / 60);
  remaining -= minutes * 60;
  return `P${days ? `${days}D` : ""}${hours || minutes || remaining ? "T" : ""}`
    + `${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${remaining ? `${remaining}S` : ""}`;
}

async function prepareDatabase() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("create schema if not exists codex_schedule_diff");
    await client.query(`
      create table if not exists codex_schedule_diff.scenario (
        name text primary key,
        description text not null,
        model jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
    await client.query(`
      create table if not exists codex_schedule_diff.run_result (
        scenario_name text not null references codex_schedule_diff.scenario(name),
        engine text not null check (engine in ('native', 'typescript')),
        result jsonb not null,
        created_at timestamptz not null default now(),
        primary key (scenario_name, engine)
      )
    `);
    await client.query(`
      create table if not exists codex_schedule_diff.comparison (
        scenario_name text primary key references codex_schedule_diff.scenario(name),
        identical boolean not null,
        difference jsonb not null,
        compared_at timestamptz not null default now()
      )
    `);
    await client.query("truncate table codex_schedule_diff.comparison, codex_schedule_diff.run_result, codex_schedule_diff.scenario");
    for (const scenario of seedScenarios) {
      await client.query(`
        insert into codex_schedule_diff.scenario(name, description, model)
        values ($1, $2, $3::jsonb)
        on conflict (name) do update set
          description = excluded.description,
          model = excluded.model,
          updated_at = now()
      `, [scenario.name, scenario.description, JSON.stringify(scenario.model)]);
    }
    const requestedNames = scenarioName === "all"
      ? seedScenarios.map((scenario) => scenario.name)
      : [scenarioName];
    const selected = await client.query(
      "select name, description, model from codex_schedule_diff.scenario where name = any($1::text[])",
      [requestedNames],
    );
    const selectedByName = new Map(selected.rows.map((scenario) => [scenario.name, scenario]));
    const seedByName = new Map(seedScenarios.map((scenario) => [scenario.name, scenario]));
    const scenarios = requestedNames.map((name) => {
      const stored = selectedByName.get(name);
      const seed = seedByName.get(name);
      return stored && seed ? { ...seed, ...stored, model: stored.model } : stored;
    });
    const missingName = requestedNames.find((name, index) => !scenarios[index]);
    if (missingName) throw new Error(`Scenario '${missingName}' wasn't found`);
    return { client, scenarios };
  } catch (error) {
    await client.end();
    throw error;
  }
}

function nativeExporter(containerResultPath, model) {
  const explicitReferences = (model.operationPlans ?? [])
    .map((operationPlan) => operationPlan.reference).filter((reference) => reference !== undefined);
  const dependencyQuantities = Object.fromEntries((model.dependencies ?? []).map((dependency) => [
    `${dependency.operation}\u0000${dependency.blockedBy}`, dependency.quantity ?? 1,
  ]));
  return `import datetime, frepple, json\n`
    + `frepple.solver_mrp(**${"{solver_json}"}).solve()\n`
    + `def stamp(value):\n`
    + `    return value.strftime("%Y-%m-%dT%H:%M:%S")\n`
    + `def name(value):\n`
    + `    return getattr(value, "name", None) if value is not None else None\n`
    + `def metric(value):\n`
    + `    value = round(float(value), 9)\n`
    + `    return 0.0 if abs(value) < 0.000000001 else value\n`
    + `def number_key(value):\n`
    + `    return ("%.9f" % metric(value)).rstrip("0").rstrip(".") or "0"\n`
    + `explicit_references = set(${JSON.stringify(explicitReferences)})\n`
    + `dependency_quantities = ${JSON.stringify(dependencyQuantities)}\n`
    + `plan_rows = []\n`
    + `all_buffers = list(frepple.buffers())\n`
    + `all_resources = list(frepple.resources())\n`
    + `for operationplan in frepple.operationplans():\n`
    + `    materials = []\n`
    + `    for buffer in all_buffers:\n`
    + `        for flowplan in buffer.flowplans:\n`
    + `            if flowplan.operationplan == operationplan:\n`
    + `                materials.append({"buffer": buffer.name, "date": stamp(flowplan.date), "quantity": metric(flowplan.quantity)})\n`
    + `    resources = []\n`
    + `    for resource in all_resources:\n`
    + `        if any(loadplan.operationplan == operationplan for loadplan in resource.loadplans):\n`
    + `            resources.append(resource.name)\n`
    + `    owner = getattr(operationplan, "owner", None)\n`
    + `    productive_seconds = max(0.0, (operationplan.end - operationplan.start).total_seconds() - operationplan.unavailable)\n`
    + `    operation_cost = metric(operationplan.operation.cost * operationplan.quantity)\n`
    + `    resource_cost = metric(operationplan.quantity * sum(resource.cost for resource in all_resources if resource.name in resources) * productive_seconds / 3600.0)\n`
    + `    setup_cost = metric(getattr(getattr(operationplan, "rule", None), "cost", 0))\n`
    + `    plan_rows.append((operationplan, {\n`
    + `        "operation": operationplan.operation.name,\n`
    + `        "demand": name(getattr(operationplan, "demand", None)),\n`
    + `        "quantity": metric(operationplan.quantity),\n`
    + `        "quantityCompleted": metric(getattr(operationplan, "quantity_completed", 0)),\n`
    + `        "start": stamp(operationplan.start),\n`
    + `        "end": stamp(operationplan.end),\n`
    + `        "ownerOperation": name(getattr(owner, "operation", None)),\n`
    + `        "batch": getattr(operationplan, "batch", "") or "",\n`
    + `        "orderType": getattr(operationplan, "ordertype", "") or "",\n`
    + `        "status": operationplan.status,\n`
    + `        "feasible": bool(operationplan.feasible),\n`
    + `        "setupSeconds": operationplan.setup,\n`
    + `        "setupEnd": stamp(operationplan.setupend),\n`
    + `        "resources": sorted(resources),\n`
    + `        "materials": sorted(materials, key=lambda value: (value["date"], value["buffer"], value["quantity"])),\n`
    + `        "operationCost": operation_cost,\n`
    + `        "resourceCost": resource_cost,\n`
    + `        "setupCost": setup_cost,\n`
    + `        "totalCost": metric(operation_cost + resource_cost),\n`
    + `        "setupPenalty": setup_cost,\n`
    + `    }))\n`
    + `plan_rows.sort(key=lambda pair: (pair[1]["operation"], pair[1]["start"], pair[1]["end"], pair[1]["demand"] or "", pair[1]["quantity"], pair[1]["batch"], pair[1]["orderType"]))\n`
    + `plan_keys = {}\n`
    + `key_counts = {}\n`
    + `plans = []\n`
    + `for operationplan, row in plan_rows:\n`
    + `    reference = str(getattr(operationplan, "reference", "") or "")\n`
    + `    seed = "|".join((row["operation"], row["start"], row["end"], row["demand"] or "", number_key(row["quantity"]), row["batch"], row["orderType"], row["ownerOperation"] or ""))\n`
    + `    key_counts[seed] = key_counts.get(seed, 0) + 1\n`
    + `    plan_key = "ref:" + reference if reference in explicit_references else "auto:" + seed + "#" + str(key_counts[seed])\n`
    + `    plan_keys[id(operationplan)] = plan_key\n`
    + `    row["planKey"] = plan_key\n`
    + `    row["reference"] = reference if reference in explicit_references else plan_key\n`
    + `    plans.append(row)\n`
    + `deliveries = []\n`
    + `for demand in frepple.demands():\n`
    + `    for operationplan in demand.operationplans:\n`
    + `        deliveries.append({"demand": demand.name, "quantity": metric(operationplan.quantity), "end": stamp(operationplan.end), "batch": getattr(operationplan, "batch", "") or "", "orderType": getattr(operationplan, "ordertype", "") or "", "operationPlanKey": plan_keys.get(id(operationplan))})\n`
    + `deliveries.sort(key=lambda value: (value["demand"], value["end"], value["quantity"], value["batch"], value["orderType"]))\n`
    + `dependencies = []\n`
    + `seen_dependencies = set()\n`
    + `for operationplan in frepple.operationplans():\n`
    + `    for dependency in getattr(operationplan, "blockedby", []):\n`
    + `        if id(dependency) in seen_dependencies: continue\n`
    + `        seen_dependencies.add(id(dependency))\n`
    + `        first = dependency.first\n`
    + `        second = dependency.second\n`
    + `        ratio = dependency_quantities.get(second.operation.name + "\\u0000" + first.operation.name, 1)\n`
    + `        dependencies.append({"first": plan_keys.get(id(first)), "second": plan_keys.get(id(second)), "quantity": metric(min(first.quantity, second.quantity * ratio)), "operation": second.operation.name, "blockedBy": first.operation.name})\n`
    + `dependencies.sort(key=lambda value: (value["second"] or "", value["first"] or "", value["operation"], value["blockedBy"], value["quantity"]))\n`
    + `problems = []\n`
    + `for problem in frepple.problems():\n`
    + `    owner = getattr(problem, "owner", None)\n`
    + `    owner_key = plan_keys.get(id(owner)) if owner is not None else None\n`
    + `    problems.append({"name": problem.name, "description": problem.description, "start": stamp(problem.start), "end": stamp(problem.end), "entity": problem.entity, "owner": owner_key or name(owner), "feasible": bool(problem.feasible)})\n`
    + `problems.sort(key=lambda value: (value["owner"] or "", value["name"], value["start"], value["end"], value["description"]))\n`
    + `inventory_profiles = []\n`
    + `for buffer in all_buffers:\n`
    + `    for flowplan in buffer.flowplans:\n`
    + `        operationplan = getattr(flowplan, "operationplan", None)\n`
    + `        inventory_profiles.append({"buffer": buffer.name, "bufferBatch": getattr(buffer, "batch", "") or "", "date": stamp(flowplan.date), "quantity": metric(flowplan.quantity), "onhand": metric(flowplan.onhand), "operationPlanKey": plan_keys.get(id(operationplan)) if operationplan is not None else None, "orderType": getattr(operationplan, "ordertype", "") if operationplan is not None else None})\n`
    + `inventory_profiles.sort(key=lambda value: (value["buffer"], value["bufferBatch"], value["date"], value["quantity"], value["operationPlanKey"] or "", value["onhand"]))\n`
    + `boundaries = sorted(set([frepple.settings.current] + [value for operationplan, row in plan_rows for value in (operationplan.start, operationplan.end)]))\n`
    + `if len(boundaries) < 2: boundaries.append(boundaries[0] + datetime.timedelta(days=1))\n`
    + `resource_plans = []\n`
    + `for resource in all_resources:\n`
    + `    for bucket in resource.plan(boundaries):\n`
    + `        values = [metric(bucket[field]) for field in ("available", "load", "unavailable", "setup", "free", "load_confirmed")]\n`
    + `        if not any(values): continue\n`
    + `        available, load, unavailable, setup, free, load_confirmed = values\n`
    + `        resource_plans.append({"resource": resource.name, "start": stamp(bucket["start"]), "end": stamp(bucket["end"]), "available": available, "load": load, "unavailable": unavailable, "setup": setup, "free": free, "loadConfirmed": load_confirmed, "utilization": metric((load + setup) / available) if available else metric(load + setup)})\n`
    + `resource_plans.sort(key=lambda value: (value["resource"], value["start"], value["end"]))\n`
    + `cost_summary = {"operationCost": metric(sum(value["operationCost"] for value in plans)), "resourceCost": metric(sum(value["resourceCost"] for value in plans)), "setupCost": metric(sum(value["setupCost"] for value in plans)), "totalCost": metric(sum(value["totalCost"] for value in plans)), "setupPenalty": metric(sum(value["setupPenalty"] for value in plans))}\n`
    + `with open(${JSON.stringify(containerResultPath)}, "w", encoding="utf-8") as output:\n`
    + `    json.dump({"operationPlans": plans, "deliveries": deliveries, "dependencies": dependencies, "problems": problems, "inventoryProfiles": inventory_profiles, "resourcePlans": resource_plans, "costSummary": cost_summary}, output, indent=2, sort_keys=True)\n`;
}

function generateNativeXml(model, exporterContainerPath) {
  const calendarXml = (model.calendars ?? []).map((calendar) => `
    <calendar name="${xmlEscape(calendar.name)}">
      <default>${calendar.default ?? 0}</default>
      <buckets>${(calendar.buckets ?? []).map((bucket) => `
        <bucket${bucket.start ? ` start="${bucket.start}"` : ""}${bucket.end ? ` end="${bucket.end}"` : ""}
          value="${bucket.value ?? 0}"${bucket.priority !== undefined ? ` priority="${bucket.priority}"` : ""}
          ${bucket.days !== undefined ? ` days="${bucket.days}"` : ""}${bucket.startTime !== undefined ? ` starttime="${durationXml(bucket.startTime)}"` : ""}
          ${bucket.endTime !== undefined ? ` endtime="${durationXml(bucket.endTime)}"` : ""} />`).join("")}
      </buckets>
    </calendar>`).join("");
  const locationXml = (model.locations ?? []).map((location) => `
    <location name="${xmlEscape(location.name)}">
      ${location.owner ? `<owner name="${xmlEscape(location.owner)}" />` : ""}
      ${location.available ? `<available name="${xmlEscape(location.available)}" />` : ""}
    </location>`).join("");
  const supplierXml = (model.suppliers ?? []).map((supplier) => `
    <supplier name="${xmlEscape(supplier.name)}">
      ${supplier.owner ? `<owner name="${xmlEscape(supplier.owner)}" />` : ""}
    </supplier>`).join("");
  const itemXml = model.items.map((item) => {
    const itemSuppliers = (model.itemSuppliers ?? []).filter((association) => association.item === item.name);
    const itemDistributions = (model.itemDistributions ?? []).filter((association) => association.item === item.name);
    return `
    <item name="${xmlEscape(item.name)}"${item.type === "mto" ? " xsi:type=\"item_mto\"" : ""}>
      ${item.owner ? `<owner name="${xmlEscape(item.owner)}" />` : ""}
      ${item.cost !== undefined ? `<cost>${item.cost}</cost>` : ""}
      ${itemSuppliers.length ? `<itemsuppliers>${itemSuppliers.map((association) => `
        <itemsupplier>
          <supplier name="${xmlEscape(association.supplier)}" />
          ${association.location ? `<location name="${xmlEscape(association.location)}" />` : ""}
          ${association.resource ? `<resource name="${xmlEscape(association.resource)}" />` : ""}
          ${association.resourceQuantity !== undefined ? `<resource_qty>${association.resourceQuantity}</resource_qty>` : ""}
          ${association.leadtime !== undefined ? `<leadtime>${durationXml(association.leadtime)}</leadtime>` : ""}
          ${association.hardSafetyLeadtime !== undefined ? `<hard_safety_leadtime>${durationXml(association.hardSafetyLeadtime)}</hard_safety_leadtime>` : ""}
          ${association.extraSafetyLeadtime !== undefined ? `<extra_safety_leadtime>${durationXml(association.extraSafetyLeadtime)}</extra_safety_leadtime>` : ""}
          ${association.sizeMinimum !== undefined ? `<size_minimum>${association.sizeMinimum}</size_minimum>` : ""}
          ${association.sizeMultiple !== undefined ? `<size_multiple>${association.sizeMultiple}</size_multiple>` : ""}
          ${association.sizeMaximum !== undefined ? `<size_maximum>${association.sizeMaximum}</size_maximum>` : ""}
          ${association.cost !== undefined ? `<cost>${association.cost}</cost>` : ""}
          ${association.priority !== undefined ? `<priority>${association.priority}</priority>` : ""}
          ${association.effectiveStart ? `<effective_start>${association.effectiveStart}</effective_start>` : ""}
          ${association.effectiveEnd ? `<effective_end>${association.effectiveEnd}</effective_end>` : ""}
        </itemsupplier>`).join("")}</itemsuppliers>` : ""}
      ${itemDistributions.length ? `<itemdistributions>${itemDistributions.map((association) => `
        <itemdistribution>
          <origin name="${xmlEscape(association.origin)}" />
          ${association.destination ? `<destination name="${xmlEscape(association.destination)}" />` : ""}
          ${association.resource ? `<resource name="${xmlEscape(association.resource)}" />` : ""}
          ${association.resourceQuantity !== undefined ? `<resource_qty>${association.resourceQuantity}</resource_qty>` : ""}
          ${association.leadtime !== undefined ? `<leadtime>${durationXml(association.leadtime)}</leadtime>` : ""}
          ${association.sizeMinimum !== undefined ? `<size_minimum>${association.sizeMinimum}</size_minimum>` : ""}
          ${association.sizeMultiple !== undefined ? `<size_multiple>${association.sizeMultiple}</size_multiple>` : ""}
          ${association.cost !== undefined ? `<cost>${association.cost}</cost>` : ""}
          ${association.priority !== undefined ? `<priority>${association.priority}</priority>` : ""}
          ${association.effectiveStart ? `<effective_start>${association.effectiveStart}</effective_start>` : ""}
          ${association.effectiveEnd ? `<effective_end>${association.effectiveEnd}</effective_end>` : ""}
        </itemdistribution>`).join("")}</itemdistributions>` : ""}
    </item>`;
  }).join("");
  const operationXml = model.operations.map((operation) => {
    const operationType = operation.type === "routing" ? "operation_routing"
      : operation.type === "alternate" ? "operation_alternate"
        : operation.type === "split" ? "operation_split"
          : operation.type === "time_per" ? "operation_time_per" : "operation_fixed_time";
    const duration = operation.type === "fixed_time" || operation.type === "time_per"
      ? `<duration>${durationXml(operation.duration)}</duration>` : "";
    const suboperations = operation.suboperations?.length ? `
      <suboperations>${operation.suboperations.map((suboperation) => `
        <suboperation>
          <operation name="${xmlEscape(suboperation.operation)}" />
          <priority>${suboperation.priority ?? 1}</priority>
          ${suboperation.effectiveStart ? `<effective_start>${suboperation.effectiveStart}</effective_start>` : ""}
          ${suboperation.effectiveEnd ? `<effective_end>${suboperation.effectiveEnd}</effective_end>` : ""}
        </suboperation>`).join("")}
      </suboperations>` : "";
    const dependencies = (model.dependencies ?? []).filter((dependency) =>
      dependency.operation === operation.name);
    const dependencyXml = dependencies.length ? `
      <dependencies>${dependencies.map((dependency) => `
        <dependency>
          <blockedby name="${xmlEscape(dependency.blockedBy)}" />
          <quantity>${dependency.quantity ?? 1}</quantity>
          ${dependency.safetyLeadtime !== undefined ? `<safety_leadtime>${durationXml(dependency.safetyLeadtime)}</safety_leadtime>` : ""}
          ${dependency.hardSafetyLeadtime !== undefined ? `<hard_safety_leadtime>${durationXml(dependency.hardSafetyLeadtime)}</hard_safety_leadtime>` : ""}
        </dependency>`).join("")}
      </dependencies>` : "";
    return `
    <operation name="${xmlEscape(operation.name)}" xsi:type="${operationType}"${operation.search ? ` search="${xmlEscape(operation.search)}"` : ""}>
      ${operation.item ? `<item name="${xmlEscape(operation.item)}" />` : ""}
      ${operation.location ? `<location name="${xmlEscape(operation.location)}" />` : ""}
      ${operation.available ? `<available name="${xmlEscape(operation.available)}" />` : ""}
      ${duration}
      ${operation.posttime !== undefined ? `<posttime>${durationXml(operation.posttime)}</posttime>` : ""}
      ${operation.hardPosttime !== undefined ? `<hard_posttime>${operation.hardPosttime ? "true" : "false"}</hard_posttime>` : ""}
      ${operation.batchWindow !== undefined ? `<batchwindow>${durationXml(operation.batchWindow)}</batchwindow>` : ""}
      ${operation.sizeMinimum !== undefined ? `<size_minimum>${operation.sizeMinimum}</size_minimum>` : ""}
      ${operation.sizeMultiple !== undefined ? `<size_multiple>${operation.sizeMultiple}</size_multiple>` : ""}
      ${operation.sizeMaximum !== undefined ? `<size_maximum>${operation.sizeMaximum}</size_maximum>` : ""}
      ${operation.cost !== undefined ? `<cost>${operation.cost}</cost>` : ""}
      ${suboperations}
      ${dependencyXml}
      ${operation.type === "time_per" ? `<duration_per>${durationXml(operation.durationPer)}</duration_per>` : ""}
    </operation>`;
  }).join("");
  const bufferXml = model.buffers.map((buffer) => `
    <buffer name="${xmlEscape(buffer.name)}">
      ${buffer.producing ? `<producing name="${xmlEscape(buffer.producing)}" />` : ""}
      <item name="${xmlEscape(buffer.item)}" />
      ${buffer.location ? `<location name="${xmlEscape(buffer.location)}" />` : ""}
      ${buffer.batch !== undefined ? `<batch>${xmlEscape(buffer.batch)}</batch>` : ""}
      ${buffer.minimum !== undefined ? `<minimum>${buffer.minimum}</minimum>` : ""}
      ${buffer.maximum !== undefined ? `<maximum>${buffer.maximum}</maximum>` : ""}
      ${buffer.minimumCalendar ? `<minimum_calendar name="${xmlEscape(buffer.minimumCalendar)}" />` : ""}
      ${buffer.maximumCalendar ? `<maximum_calendar name="${xmlEscape(buffer.maximumCalendar)}" />` : ""}
      <onhand>${buffer.onhand ?? 0}</onhand>
    </buffer>`).join("");
  const setupMatrixXml = (model.setupMatrices ?? []).map((matrix) => `
    <setupmatrix name="${xmlEscape(matrix.name)}">
      <rules>${matrix.rules.map((rule) => `
        <rule priority="${rule.priority}" fromsetup="${xmlEscape(rule.from)}" tosetup="${xmlEscape(rule.to)}"
          duration="${durationXml(rule.duration)}" cost="${rule.cost ?? 0}" />`).join("")}
      </rules>
    </setupmatrix>`).join("");
  const resourceXml = model.resources.map((resource) => `
    <resource name="${xmlEscape(resource.name)}"${resource.type === "buckets" ? " xsi:type=\"resource_buckets\"" : ""}>
      ${resource.owner ? `<owner name="${xmlEscape(resource.owner)}" />` : ""}
      <maximum>${resource.maximum}</maximum>
      <maxearly>${durationXml(resource.maxearly)}</maxearly>
      ${resource.cost !== undefined ? `<cost>${resource.cost}</cost>` : ""}
      ${resource.location ? `<location name="${xmlEscape(resource.location)}" />` : ""}
      ${resource.available ? `<available name="${xmlEscape(resource.available)}" />` : ""}
      ${resource.maximumCalendar ? `<maximum_calendar name="${xmlEscape(resource.maximumCalendar)}" />` : ""}
      ${resource.efficiency !== undefined ? `<efficiency>${resource.efficiency}</efficiency>` : ""}
      ${resource.setupMatrix ? `<setupmatrix name="${xmlEscape(resource.setupMatrix)}" />` : ""}
      ${resource.setup !== undefined ? `<setup>${xmlEscape(resource.setup)}</setup>` : ""}
    </resource>`).join("");
  const loadXml = model.loads.map((load) => `
    <load${load.type ? ` xsi:type="load_${load.type}"` : ""}>
      <operation name="${xmlEscape(load.operation)}" />
      <resource name="${xmlEscape(load.resource)}" />
      <quantity>${load.quantity}</quantity>
      ${load.offset !== undefined ? `<offset>${load.type === "bucketized_percentage" ? load.offset : durationXml(load.offset)}</offset>` : ""}
      ${load.name ? `<name>${xmlEscape(load.name)}</name>` : ""}
      ${load.priority !== undefined ? `<priority>${load.priority}</priority>` : ""}
      ${load.search ? `<search>${xmlEscape(load.search)}</search>` : ""}
      ${load.skill ? `<skill name="${xmlEscape(load.skill)}" />` : ""}
      ${load.setup !== undefined ? `<setup>${xmlEscape(load.setup)}</setup>` : ""}
    </load>`).join("");
  const skillXml = (model.skills ?? []).map((skill) => `
    <skill name="${xmlEscape(skill.name)}">
      <resourceskills>${(model.resourceSkills ?? []).filter((entry) => entry.skill === skill.name).map((entry) => `
        <resourceskill>
          <resource name="${xmlEscape(entry.resource)}" />
          <priority>${entry.priority ?? 1}</priority>
        </resourceskill>`).join("")}
      </resourceskills>
    </skill>`).join("");
  const flowXml = model.flows.map((flow) => `
    <flow xsi:type="flow_${flow.type}">
      <operation name="${xmlEscape(flow.operation)}" />
      <buffer name="${xmlEscape(flow.buffer)}" />
      <quantity>${flow.quantity}</quantity>
      ${flow.quantityFixed !== undefined ? `<quantity_fixed>${flow.quantityFixed}</quantity_fixed>` : ""}
      ${flow.name ? `<name>${xmlEscape(flow.name)}</name>` : ""}
      ${flow.priority !== undefined ? `<priority>${flow.priority}</priority>` : ""}
      ${flow.transferBatch !== undefined ? `<transferbatch>${flow.transferBatch}</transferbatch>` : ""}
    </flow>`).join("");
  const standaloneDemandXml = model.demands.filter((demand) => !demand.group).map((demand) => `
    <demand name="${xmlEscape(demand.name)}">
      <quantity>${demand.quantity}</quantity><due>${demand.due}</due><priority>${demand.priority}</priority>
      <item name="${xmlEscape(demand.item)}" /><operation name="${xmlEscape(demand.operation)}" />
      ${demand.location ? `<location name="${xmlEscape(demand.location)}" />` : ""}
      ${demand.status !== undefined ? `<status>${xmlEscape(demand.status)}</status>` : ""}
      ${demand.maxLateness !== undefined ? `<maxlateness>${durationXml(demand.maxLateness)}</maxlateness>` : ""}
      ${demand.minShipment !== undefined ? `<minshipment>${demand.minShipment}</minshipment>` : ""}
      ${demand.batch !== undefined ? `<batch>${xmlEscape(demand.batch)}</batch>` : ""}
    </demand>`).join("");
  const demandGroupXml = (model.demandGroups ?? []).map((group) => `
    <demand name="${xmlEscape(group.name)}" xsi:type="demand_group">
      ${group.status !== undefined ? `<status>${xmlEscape(group.status)}</status>` : ""}
      <members>${model.demands.filter((demand) => demand.group === group.name).map((demand) => `
        <demand name="${xmlEscape(demand.name)}">
          <quantity>${demand.quantity}</quantity><due>${demand.due}</due><priority>${demand.priority}</priority>
          <item name="${xmlEscape(demand.item)}" /><operation name="${xmlEscape(demand.operation)}" />
          ${demand.location ? `<location name="${xmlEscape(demand.location)}" />` : ""}
          ${demand.status !== undefined ? `<status>${xmlEscape(demand.status)}</status>` : ""}
          ${demand.maxLateness !== undefined ? `<maxlateness>${durationXml(demand.maxLateness)}</maxlateness>` : ""}
          ${demand.minShipment !== undefined ? `<minshipment>${demand.minShipment}</minshipment>` : ""}
          ${demand.batch !== undefined ? `<batch>${xmlEscape(demand.batch)}</batch>` : ""}
        </demand>`).join("")}
      </members>
      <policy>${xmlEscape(group.policy)}</policy>
    </demand>`).join("");
  const operationPlanXml = (model.operationPlans ?? []).map((operationPlan) => `
    <operationplan ordertype="${xmlEscape(operationPlan.orderType ?? "MO")}" reference="${xmlEscape(operationPlan.reference)}"
      quantity="${operationPlan.quantity}"${operationPlan.start ? ` start="${operationPlan.start}"` : ""}${operationPlan.end ? ` end="${operationPlan.end}"` : ""}
      status="${xmlEscape(operationPlan.status ?? "proposed")}">
      <operation name="${xmlEscape(operationPlan.operation)}" />
      ${operationPlan.batch !== undefined ? `<batch>${xmlEscape(operationPlan.batch)}</batch>` : ""}
      ${operationPlan.quantityCompleted !== undefined ? `<quantity_completed>${operationPlan.quantityCompleted}</quantity_completed>` : ""}
      ${(operationPlan.assignedResources ?? []).length ? `<resources>${operationPlan.assignedResources.map((resource) => `<resource name="${xmlEscape(resource)}" />`).join("")}</resources>` : ""}
    </operationplan>`).join("");
  const solverFields = {
    plantype: model.solver.plantype,
    constraints: model.solver.constraints,
    loglevel: process.env.FREPPLE_NATIVE_TRACE === "1" ? 2 : 0,
    lazydelay: model.solver.lazyDelay,
    // The native metadata key is camel-cased.  Passing the lower-case
    // spelling silently creates a Python property and leaves the solver's
    // erasePreviousFirst setting at its default value of true.
    erasePreviousFirst: model.solver.erasePreviousFirst ?? true,
  };
  if (model.solver.minimumDelay !== undefined) solverFields.minimumdelay = model.solver.minimumDelay;
  if (model.solver.administrativeLeadTime !== undefined) {
    solverFields.administrativeleadtime = model.solver.administrativeLeadTime;
  }
  if (model.solver.rotateResources !== undefined) solverFields.rotateresources = model.solver.rotateResources;
  if (model.solver.algorithm !== undefined) solverFields.algorithm = model.solver.algorithm;
  if (model.solver.iterationMax !== undefined) solverFields.iterationmax = model.solver.iterationMax;
  if (model.solver.resourceIterationMax !== undefined) solverFields.resourceiterationmax = model.solver.resourceIterationMax;
  if (model.solver.iterationThreshold !== undefined) solverFields.iterationthreshold = model.solver.iterationThreshold;
  if (model.solver.iterationAccuracy !== undefined) solverFields.iterationaccuracy = model.solver.iterationAccuracy;
  const pythonSolverFields = JSON.stringify(solverFields)
    .replaceAll("true", "True").replaceAll("false", "False").replaceAll("null", "None");
  const distributionMaximums = (model.itemDistributions ?? [])
    .filter((association) => association.sizeMaximum !== undefined)
    .map((association) => ({
      item: association.item,
      origin: association.origin ?? null,
      destination: association.destination ?? null,
      sizeMaximum: association.sizeMaximum,
    }));
  const setupOverrides = (model.operationPlans ?? [])
    .filter((operationPlan) => operationPlan.setupOverride !== undefined)
    .map((operationPlan) => ({ reference: operationPlan.reference, seconds: operationPlan.setupOverride }));
  const distributionFixups = distributionMaximums.length
    ? `distribution_maximums = ${JSON.stringify(distributionMaximums)}\n`
      + `for item in frepple.items():\n`
      + `    for association in item.itemdistributions:\n`
      + `        for fields in distribution_maximums:\n`
      + `            if association.item.name == fields["item"] and getattr(association.origin, "name", None) == fields["origin"] and getattr(association.destination, "name", None) == fields["destination"]:\n`
      + `                association.size_maximum = fields["sizeMaximum"]\n`
      + `                break\n`
    : "";
  const setupOverrideFixups = setupOverrides.length
    ? `setup_overrides = ${JSON.stringify(setupOverrides)}\n`
      + `for operationplan in frepple.operationplans():\n`
      + `    for fields in setup_overrides:\n`
      + `        if operationplan.reference == fields["reference"]:\n`
      + `            operationplan.setupoverride = fields["seconds"]\n`
      + `            break\n`
    : "";
  const mergeFixup = model.plan?.allowMergingOperationPlans !== undefined
    ? `frepple.settings.allow_merging_operationplans = ${model.plan.allowMergingOperationPlans ? "True" : "False"}\n`
    : "";
  const planFixups = (model.plan?.autoFence !== undefined
    ? `frepple.settings.autofence = ${Number(model.plan.autoFence)}\n` : "")
    + (model.plan?.shortageTolerance !== undefined
      ? `frepple.settings.shortage_tolerance = ${Number(model.plan.shortageTolerance)}\n` : "");
  const nativeModelFixups = distributionFixups + setupOverrideFixups + mergeFixup + planFixups;
  const exporter = nativeExporter(exporterContainerPath, model)
    .replace("{solver_json}", pythonSolverFields);
  return `<?xml version="1.0" encoding="UTF-8" ?>
<plan xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <current>${model.current}</current>
  <calendars>${calendarXml}
  </calendars>
  <locations>${locationXml}
  </locations>
  <suppliers>${supplierXml}
  </suppliers>
  <items>${itemXml}
  </items>
  <operations>${operationXml}
  </operations>
  <buffers>${bufferXml}
  </buffers>
  <setupmatrices>${setupMatrixXml}
  </setupmatrices>
  <resources>${resourceXml}
  </resources>
  <loads>${loadXml}
  </loads>
  <skills>${skillXml}
  </skills>
  <flows>${flowXml}
  </flows>
  <demands>${standaloneDemandXml}${demandGroupXml}
  </demands>
  <operationplans>${operationPlanXml}
  </operationplans>
<?python
${nativeModelFixups}${exporter}?>
</plan>
`;
}

async function runNative(model, name) {
  const inputPath = resolve(outputDirectory, `${name}.native.xml`);
  const resultPath = resolve(outputDirectory, `${name}.native.json`);
  const workspaceInputPath = inputPath.slice(workspaceDirectory.length).replaceAll("\\", "/");
  const workspaceResultPath = resultPath.slice(workspaceDirectory.length).replaceAll("\\", "/");
  const containerInputPath = `/workspace${workspaceInputPath}`;
  const containerResultPath = `/workspace${workspaceResultPath}`;
  await writeFile(inputPath, generateNativeXml(model, containerResultPath), "utf8");
  const nativeRun = run("docker", [
    "run", "--rm", "--add-host", "host.docker.internal:host-gateway",
    "-v", `${workspaceDirectory}:/workspace`, "-w", "/workspace",
    "-e", "LD_LIBRARY_PATH=/workspace/bin", "-e", "FREPPLE_HOME=/workspace/bin", "-e", "TZ=EST",
    "--entrypoint", "/workspace/bin/frepple", dockerImage, "-validate", containerInputPath,
  ]);
  if (process.env.FREPPLE_NATIVE_TRACE === "1") {
    if (nativeRun.stdout) process.stderr.write(nativeRun.stdout);
    if (nativeRun.stderr) process.stderr.write(nativeRun.stderr);
  }
  return JSON.parse(await readFile(resultPath, "utf8"));
}

async function runTypescript(model, name) {
  const modelPath = resolve(outputDirectory, `${name}.model.json`);
  const resultPath = resolve(outputDirectory, `${name}.typescript.json`);
  await writeFile(modelPath, JSON.stringify(model, null, 2), "utf8");
  const result = run(process.execPath, [fileURLToPath(import.meta.url), "--typescript-worker", modelPath, resultPath]);
  if (process.env.FREPPLE_TS_TRACE === "1" && result.stderr) process.stderr.write(result.stderr);
  return JSON.parse(await readFile(resultPath, "utf8"));
}

function firstDifference(left, right, path = "$", differences = []) {
  if (Object.is(left, right)) return differences;
  if (typeof left !== typeof right || left === null || right === null) {
    differences.push({ path, native: left, typescript: right });
    return differences;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      differences.push({ path, native: left, typescript: right });
      return differences;
    }
    if (left.length !== right.length) differences.push({ path: `${path}.length`, native: left.length, typescript: right.length });
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      firstDifference(left[index], right[index], `${path}[${index}]`, differences);
      if (differences.length >= 100) break;
    }
    return differences;
  }
  if (typeof left === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      firstDifference(left[key], right[key], `${path}.${key}`, differences);
      if (differences.length >= 100) break;
    }
    return differences;
  }
  differences.push({ path, native: left, typescript: right });
  return differences;
}

async function recordResults(client, name, nativeResult, typescriptResult, differences) {
  await client.query("begin");
  try {
    for (const [engine, result] of [["native", nativeResult], ["typescript", typescriptResult]]) {
      await client.query(`
        insert into codex_schedule_diff.run_result(scenario_name, engine, result)
        values ($1, $2, $3::jsonb)
        on conflict (scenario_name, engine) do update set result = excluded.result, created_at = now()
      `, [name, engine, JSON.stringify(result)]);
    }
    await client.query(`
      insert into codex_schedule_diff.comparison(scenario_name, identical, difference)
      values ($1, $2, $3::jsonb)
      on conflict (scenario_name) do update set
        identical = excluded.identical, difference = excluded.difference, compared_at = now()
    `, [name, differences.length === 0, JSON.stringify(differences)]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function typescriptWorker(modelPath, resultPath) {
  const model = JSON.parse(await readFile(modelPath, "utf8"));
  // Buffer is the stable root of the model's circular ESM graph. Loading it first
  // prevents operation -> operationplan -> flowplan -> buffer -> itemdistribution
  // from evaluating OperationItemDistribution before OperationFixedTime exists.
  const bufferModule = await import("../dist/model/buffer.js");
  const [
    { Date: PlanningDate }, { Plan }, { CalendarDefault, CalendarBucket }, { ItemMTS, ItemMTO }, { LocationDefault }, { SupplierDefault },
    { ItemSupplier }, { ItemDistribution },
    { OperationFixedTime, OperationTimePer, OperationRouting, OperationAlternate, OperationSplit }, { SubOperation },
    { BufferDefault }, { ResourceDefault, ResourceBuckets }, { SkillDefault }, { ResourceSkillDefault },
    { SetupMatrixDefault, SetupMatrixRuleDefault },
    { LoadDefault, LoadBucketizedPercentage, LoadBucketizedFromStart, LoadBucketizedFromEnd }, { FlowStart, FlowEnd, FlowTransferBatch },
    { DemandDefault, DemandGroup }, { OperationPlan }, { OperationDependency, OperationPlanDependency }, { Problem }, { SolverCreate },
  ] = [
    await import("../dist/utils/date.js"), await import("../dist/model/plan.js"), await import("../dist/model/calendar.js"),
    await import("../dist/model/item.js"), await import("../dist/model/location.js"), await import("../dist/model/supplier.js"),
    await import("../dist/model/itemsupplier.js"), await import("../dist/model/itemdistribution.js"), await import("../dist/model/operation.js"),
    await import("../dist/model/suboperation.js"), bufferModule, await import("../dist/model/resource.js"),
    await import("../dist/model/skill.js"), await import("../dist/model/resourceskill.js"), await import("../dist/model/setupmatrix.js"),
    await import("../dist/model/load.js"), await import("../dist/model/flow.js"), await import("../dist/model/demand.js"),
    await import("../dist/model/operationplan.js"), await import("../dist/model/operationdependency.js"), await import("../dist/model/problem.js"),
    await import("../dist/solver/solverplan.js"),
  ];
  Plan.instance().setCurrent(model.current);
  if (model.plan?.autoFence !== undefined) {
    Plan.instance().setAutoFence(model.plan.autoFence);
  }
  if (model.plan?.shortageTolerance !== undefined) {
    Plan.instance().setShortageTolerance(model.plan.shortageTolerance);
  }
  if (model.plan?.allowMergingOperationPlans !== undefined) {
    Plan.instance().setAllowMergingOperationPlans(model.plan.allowMergingOperationPlans);
  }
  const calendars = new Map((model.calendars ?? []).map((fields) => {
    const calendar = new CalendarDefault(fields.name);
    calendar.setDefault(fields.default ?? 0);
    return [fields.name, calendar];
  }));
  for (const fields of model.calendars ?? []) {
    const calendar = calendars.get(fields.name) ?? null;
    for (const bucketFields of fields.buckets ?? []) {
      const bucket = new CalendarBucket();
      if (bucketFields.start) bucket.setStart(bucketFields.start);
      if (bucketFields.end) bucket.setEnd(bucketFields.end);
      bucket.setValue(bucketFields.value ?? 0);
      if (bucketFields.priority !== undefined) bucket.setPriority(bucketFields.priority);
      if (bucketFields.days !== undefined) bucket.setDays(bucketFields.days);
      if (bucketFields.startTime !== undefined) bucket.setStartTime(bucketFields.startTime);
      if (bucketFields.endTime !== undefined) bucket.setEndTime(bucketFields.endTime);
      bucket.setCalendar(calendar);
    }
  }
  const locations = new Map((model.locations ?? []).map((fields) => [fields.name, new LocationDefault(fields.name)]));
  for (const fields of model.locations ?? []) {
    if (fields.owner) locations.get(fields.name)?.setOwner(locations.get(fields.owner) ?? null);
    if (fields.available) locations.get(fields.name)?.setAvailable(calendars.get(fields.available) ?? null);
  }
  const suppliers = new Map((model.suppliers ?? []).map((fields) => [fields.name, new SupplierDefault(fields.name)]));
  for (const fields of model.suppliers ?? []) {
    if (fields.owner) suppliers.get(fields.name)?.setOwner(suppliers.get(fields.owner) ?? null);
  }
  const items = new Map(model.items.map((fields) => [
    fields.name, fields.type === "mto" ? new ItemMTO(fields.name) : new ItemMTS(fields.name),
  ]));
  for (const fields of model.items) {
    if (fields.owner) items.get(fields.name)?.setOwner(items.get(fields.owner) ?? null);
    if (fields.cost !== undefined) items.get(fields.name)?.setCost(fields.cost);
  }
  const operations = new Map();
  for (const fields of model.operations) {
    const operation = fields.type === "routing" ? new OperationRouting(fields.name)
      : fields.type === "alternate" ? new OperationAlternate(fields.name)
        : fields.type === "split" ? new OperationSplit(fields.name)
          : fields.type === "time_per" ? new OperationTimePer(fields.name)
            : new OperationFixedTime(fields.name);
    if (fields.type === "fixed_time") operation.setDuration(fields.duration);
    if (fields.type === "time_per") {
      operation.setDuration(fields.duration);
      operation.setDurationPer(fields.durationPer);
    }
    if (fields.item) operation.setItem(items.get(fields.item) ?? null);
    if (fields.location) operation.setLocation(locations.get(fields.location) ?? null);
    if (fields.available) operation.setAvailable(calendars.get(fields.available) ?? null);
    if (fields.search) operation.setSearch(fields.search);
    if (fields.posttime !== undefined) operation.setPostTime(fields.posttime);
    if (operation instanceof OperationRouting && fields.hardPosttime !== undefined) {
      operation.setHardPostTime(fields.hardPosttime);
    }
    if (fields.batchWindow !== undefined) operation.setBatchWindow(fields.batchWindow);
    if (fields.sizeMinimum !== undefined) operation.setSizeMinimum(fields.sizeMinimum);
    if (fields.sizeMultiple !== undefined) operation.setSizeMultiple(fields.sizeMultiple);
    if (fields.sizeMaximum !== undefined) operation.setSizeMaximum(fields.sizeMaximum);
    if (fields.cost !== undefined) operation.setCost(fields.cost);
    operations.set(fields.name, operation);
  }
  for (const fields of model.dependencies ?? []) {
    const dependency = new OperationDependency(
      operations.get(fields.operation) ?? null,
      operations.get(fields.blockedBy) ?? null,
      fields.quantity ?? 1,
    );
    if (fields.safetyLeadtime !== undefined) dependency.setSafetyLeadtime(fields.safetyLeadtime);
    if (fields.hardSafetyLeadtime !== undefined) dependency.setHardSafetyLeadtime(fields.hardSafetyLeadtime);
  }
  for (const fields of model.operations) {
    const owner = operations.get(fields.name) ?? null;
    for (const suboperation of fields.suboperations ?? []) {
      const association = new SubOperation(
        operations.get(suboperation.operation) ?? null, owner, suboperation.priority ?? 1,
      );
      if (suboperation.effectiveStart) association.setEffectiveStart(suboperation.effectiveStart);
      if (suboperation.effectiveEnd) association.setEffectiveEnd(suboperation.effectiveEnd);
    }
  }
  const buffers = new Map();
  for (const fields of model.buffers) {
    const buffer = new BufferDefault(fields.name);
    buffer.setItem(items.get(fields.item) ?? null);
    if (fields.location) buffer.setLocation(locations.get(fields.location) ?? null);
    if (fields.batch !== undefined) buffer.setBatch(fields.batch);
    if (fields.minimum !== undefined) buffer.setMinimum(fields.minimum);
    if (fields.maximum !== undefined) buffer.setMaximum(fields.maximum);
    if (fields.minimumCalendar) buffer.setMinimumCalendar(calendars.get(fields.minimumCalendar) ?? null);
    if (fields.maximumCalendar) buffer.setMaximumCalendar(calendars.get(fields.maximumCalendar) ?? null);
    buffer.setOnHand(fields.onhand ?? 0);
    buffers.set(fields.name, buffer);
  }
  const setupMatrices = new Map();
  for (const fields of model.setupMatrices ?? []) {
    const matrix = new SetupMatrixDefault(fields.name);
    setupMatrices.set(fields.name, matrix);
    for (const rule of fields.rules) {
      new SetupMatrixRuleDefault(
        matrix, rule.from, rule.to, rule.duration, rule.cost ?? 0, rule.priority,
      );
    }
  }
  const resources = new Map();
  for (const fields of model.resources) {
    const resource = fields.type === "buckets" ? new ResourceBuckets(fields.name) : new ResourceDefault(fields.name);
    resource.setMaximum(fields.maximum);
    resource.setMaxEarly(fields.maxearly);
    if (fields.cost !== undefined) resource.setCost(fields.cost);
    if (fields.location) resource.setLocation(locations.get(fields.location) ?? null);
    if (fields.available) resource.setAvailable(calendars.get(fields.available) ?? null);
    if (fields.maximumCalendar) resource.setMaximumCalendar(calendars.get(fields.maximumCalendar) ?? null);
    if (fields.efficiency !== undefined) resource.setEfficiency(fields.efficiency);
    if (fields.setupMatrix) resource.setSetupMatrix(setupMatrices.get(fields.setupMatrix) ?? null);
    if (fields.setup !== undefined) resource.setSetup(fields.setup);
    resources.set(fields.name, resource);
  }
  for (const fields of model.resources) {
    if (fields.owner) resources.get(fields.name)?.setOwner(resources.get(fields.owner) ?? null);
  }
  for (const fields of model.itemSuppliers ?? []) {
    const association = new ItemSupplier(
      suppliers.get(fields.supplier) ?? null,
      items.get(fields.item) ?? null,
      fields.priority ?? 1,
    );
    if (fields.location) association.setLocation(locations.get(fields.location) ?? null);
    if (fields.resource) association.setResource(resources.get(fields.resource) ?? null);
    if (fields.resourceQuantity !== undefined) association.setResourceQuantity(fields.resourceQuantity);
    if (fields.leadtime !== undefined) association.setLeadTime(fields.leadtime);
    if (fields.hardSafetyLeadtime !== undefined) association.setHardSafetyLeadTime(fields.hardSafetyLeadtime);
    if (fields.extraSafetyLeadtime !== undefined) association.setExtraSafetyLeadTime(fields.extraSafetyLeadtime);
    if (fields.sizeMinimum !== undefined) association.setSizeMinimum(fields.sizeMinimum);
    if (fields.sizeMultiple !== undefined) association.setSizeMultiple(fields.sizeMultiple);
    if (fields.sizeMaximum !== undefined) association.setSizeMaximum(fields.sizeMaximum);
    if (fields.cost !== undefined) association.setCost(fields.cost);
    if (fields.effectiveStart) association.setEffectiveStart(fields.effectiveStart);
    if (fields.effectiveEnd) association.setEffectiveEnd(fields.effectiveEnd);
  }
  for (const fields of model.itemDistributions ?? []) {
    const association = new ItemDistribution(
      items.get(fields.item) ?? null,
      locations.get(fields.origin) ?? null,
      fields.destination ? locations.get(fields.destination) ?? null : null,
      fields.priority ?? 1,
    );
    if (fields.resource) association.setResource(resources.get(fields.resource) ?? null);
    if (fields.resourceQuantity !== undefined) association.setResourceQuantity(fields.resourceQuantity);
    if (fields.leadtime !== undefined) association.setLeadTime(fields.leadtime);
    if (fields.sizeMinimum !== undefined) association.setSizeMinimum(fields.sizeMinimum);
    if (fields.sizeMultiple !== undefined) association.setSizeMultiple(fields.sizeMultiple);
    if (fields.sizeMaximum !== undefined) association.setSizeMaximum(fields.sizeMaximum);
    if (fields.cost !== undefined) association.setCost(fields.cost);
    if (fields.effectiveStart) association.setEffectiveStart(fields.effectiveStart);
    if (fields.effectiveEnd) association.setEffectiveEnd(fields.effectiveEnd);
  }
  for (const fields of model.buffers) {
    if (fields.producing) buffers.get(fields.name)?.setProducingOperation(operations.get(fields.producing) ?? null);
  }
  const skills = new Map((model.skills ?? []).map((fields) => [fields.name, new SkillDefault(fields.name)]));
  for (const fields of model.resourceSkills ?? []) {
    new ResourceSkillDefault(
      skills.get(fields.skill) ?? null,
      resources.get(fields.resource) ?? null,
      fields.priority ?? 1,
    );
  }
  for (const fields of model.loads) {
    const Constructor = fields.type === "bucketized_percentage" ? LoadBucketizedPercentage
      : fields.type === "bucketized_from_start" ? LoadBucketizedFromStart
        : fields.type === "bucketized_from_end" ? LoadBucketizedFromEnd : LoadDefault;
    const load = new Constructor(
      operations.get(fields.operation) ?? null,
      resources.get(fields.resource) ?? null,
      fields.quantity,
    );
    if (fields.offset !== undefined) load.setOffset(fields.offset);
    if (fields.name) load.setName(fields.name);
    if (fields.priority !== undefined) load.setPriority(fields.priority);
    if (fields.search) load.setSearch(fields.search);
    if (fields.skill) load.setSkill(skills.get(fields.skill) ?? null);
    if (fields.setup !== undefined) load.setSetupString(fields.setup);
  }
  for (const fields of model.flows) {
    const Constructor = fields.type === "start" ? FlowStart
      : fields.type === "transfer_batch" ? FlowTransferBatch : FlowEnd;
    const flow = new Constructor(
      operations.get(fields.operation) ?? null,
      buffers.get(fields.buffer) ?? null,
      fields.quantity,
    );
    if (fields.name) flow.setName(fields.name);
    if (fields.quantityFixed !== undefined) flow.setQuantityFixed(fields.quantityFixed);
    if (fields.priority !== undefined) flow.setPriority(fields.priority);
    if (fields.transferBatch !== undefined) flow.setTransferBatch(fields.transferBatch);
  }
  const demandGroups = new Map();
  for (const fields of model.demandGroups ?? []) {
    const group = new DemandGroup(fields.name);
    group.setPolicyString(fields.policy);
    if (fields.status !== undefined) group.setStatus(fields.status);
    demandGroups.set(fields.name, group);
  }
  for (const fields of model.demands) {
    const demand = new DemandDefault(fields.name);
    demand.setItem(items.get(fields.item) ?? null);
    demand.setOperation(operations.get(fields.operation) ?? null);
    if (fields.location) demand.setLocation(locations.get(fields.location) ?? null);
    demand.setQuantity(fields.quantity);
    demand.setDue(fields.due);
    demand.setPriority(fields.priority);
    if (fields.status !== undefined) demand.setStatus(fields.status);
    if (fields.maxLateness !== undefined) demand.setMaxLateness(fields.maxLateness);
    if (fields.minShipment !== undefined) demand.setMinShipment(fields.minShipment);
    if (fields.batch !== undefined) demand.setBatch(fields.batch);
    if (fields.group !== undefined) demand.setOwner(demandGroups.get(fields.group) ?? null);
  }
  const importedOperationPlans = new Map();
  for (const fields of model.operationPlans ?? []) {
    const operation = operations.get(fields.operation) ?? null;
    if (!operation) throw new Error(`Unknown operation '${fields.operation}' on operationplan '${fields.reference}'`);
    const operationPlan = new OperationPlan(operation);
    if (fields.batch !== undefined) operationPlan.setBatch(fields.batch);
    if (fields.reference !== undefined) operationPlan.setReference(fields.reference);
    if (fields.quantityCompleted !== undefined) operationPlan.setQuantityCompletedRaw(fields.quantityCompleted);
    operationPlan.setOperationPlanParameters(
      fields.quantity,
      fields.start ?? PlanningDate.infinitePast,
      fields.end ?? PlanningDate.infinitePast,
      true,
      true,
      false,
    );
    if (fields.status !== undefined) operationPlan.setStatus(fields.status, true, true);
    const assignedResources = (fields.assignedResources ?? []).map((name) => resources.get(name)).filter(Boolean);
    if (fields.status === "approved" || (fields.status === "confirmed" && fields.quantityCompleted)) {
      operationPlan.createFlowLoads(assignedResources);
      operationPlan.setOperationPlanParameters(
        fields.quantity,
        fields.start ?? operationPlan.getStart(),
        PlanningDate.infinitePast,
        false,
        true,
        false,
        true,
      );
    } else {
      operationPlan.setStartAndEnd(
        fields.start ?? operationPlan.getStart(),
        fields.end ?? operationPlan.getEnd(),
      );
      operationPlan.setQuantityRaw(fields.quantity);
    }
    operationPlan.createFlowLoads(assignedResources);
    if (fields.setupOverride !== undefined) operationPlan.setSetupOverride(fields.setupOverride);
    operationPlan.activate(false, Boolean(fields.start));
    importedOperationPlans.set(fields.reference, operationPlan);
  }
  for (const fields of model.operationPlans ?? []) {
    if (!fields.owner) continue;
    importedOperationPlans.get(fields.reference)?.setOwner(importedOperationPlans.get(fields.owner) ?? null, true);
  }
  for (const fields of model.operationPlanDependencies ?? []) {
    const first = importedOperationPlans.get(fields.first);
    const second = importedOperationPlans.get(fields.second);
    if (!first || !second) throw new Error(`Unknown operationplan dependency '${fields.first}' -> '${fields.second}'`);
    const dependency = (operations.get(fields.secondOperation ?? second.getOperation()?.getName())?.getDependencies() ?? [])
      .find((candidate) => candidate.getBlockedBy() === first.getOperation()) ?? null;
    new OperationPlanDependency(first, second, dependency);
  }
  for (const operationPlan of importedOperationPlans.values()) operationPlan.matchDependencies();
  const solver = new SolverCreate({
    constraints: model.solver.constraints,
    planType: model.solver.plantype,
    lazyDelay: model.solver.lazyDelay,
    minimumDelay: model.solver.minimumDelay ?? 0,
    administrativeLeadTime: model.solver.administrativeLeadTime ?? 0,
    rotateResources: model.solver.rotateResources ?? true,
    algorithm: model.solver.algorithm ?? "heuristic",
    iterationMax: model.solver.iterationMax ?? 0,
    resourceIterationMax: model.solver.resourceIterationMax ?? 500,
    iterationThreshold: model.solver.iterationThreshold ?? 1,
    iterationAccuracy: model.solver.iterationAccuracy ?? 0.01,
    erasePreviousFirst: model.solver.erasePreviousFirst ?? true,
  });
  solver.solve();
  const metric = (value) => {
    const rounded = Math.round(Number(value) * 1_000_000_000) / 1_000_000_000;
    return Math.abs(rounded) < 1e-9 ? 0 : rounded;
  };
  const compareText = (left, right) => {
    const first = String(left ?? "");
    const second = String(right ?? "");
    return first < second ? -1 : first > second ? 1 : 0;
  };
  const named = (value) => {
    if (!value || typeof value !== "object") return null;
    const getName = Reflect.get(value, "getName");
    return typeof getName === "function" ? String(Reflect.apply(getName, value, [])) : null;
  };
  const explicitReferences = new Set((model.operationPlans ?? [])
    .map((fields) => fields.reference).filter((reference) => reference !== undefined));
  const operationPlanRows = OperationPlan.all().map((operationPlan) => {
    const assignedResources = [...new Set([...operationPlan.getLoadPlans()]
      .map((loadPlan) => loadPlan.getResource()).filter(Boolean))];
    const productiveSeconds = Math.max(0, operationPlan.getEnd().subtract(operationPlan.getStart()).seconds
      - operationPlan.getUnavailable().seconds);
    const operationCost = metric((operationPlan.getOperation()?.getCost() ?? 0) * operationPlan.getQuantity());
    const resourceCost = metric(operationPlan.getQuantity()
      * assignedResources.reduce((sum, resource) => sum + resource.getCost(), 0) * productiveSeconds / 3_600);
    const setupCost = metric(operationPlan.getSetupCost());
    return { operationPlan, row: {
      operation: operationPlan.getOperation()?.getName() ?? null,
      demand: operationPlan.getDemand()?.getName() ?? null,
      quantity: metric(operationPlan.getQuantity()),
      quantityCompleted: metric(operationPlan.getQuantityCompleted()),
      start: operationPlan.getStart().toString(),
      end: operationPlan.getEnd().toString(),
      ownerOperation: operationPlan.getOwner()?.getOperation()?.getName() ?? null,
      batch: operationPlan.getBatch(),
      orderType: operationPlan.getOrderType(),
      status: operationPlan.getStatus(),
      feasible: operationPlan.getFeasible(),
      setupSeconds: operationPlan.getSetup().seconds,
      setupEnd: operationPlan.getSetupEnd().toString(),
      resources: assignedResources.map((resource) => resource.getName()).sort(),
      materials: [...operationPlan.getFlowPlans()].map((flowPlan) => ({
        buffer: flowPlan.getBuffer()?.getName() ?? null,
        date: flowPlan.getDate().toString(),
        quantity: metric(flowPlan.getQuantity()),
      })).sort((left, right) => compareText(left.date, right.date)
        || compareText(left.buffer, right.buffer) || left.quantity - right.quantity),
      operationCost,
      resourceCost,
      setupCost,
      totalCost: metric(operationCost + resourceCost),
      setupPenalty: setupCost,
    } };
  }).sort((left, right) => compareText(left.row.operation, right.row.operation)
    || compareText(left.row.start, right.row.start)
    || compareText(left.row.end, right.row.end)
    || compareText(left.row.demand, right.row.demand)
    || left.row.quantity - right.row.quantity
    || compareText(left.row.batch, right.row.batch)
    || compareText(left.row.orderType, right.row.orderType));
  const planKeys = new Map();
  const keyCounts = new Map();
  const operationPlans = operationPlanRows.map(({ operationPlan, row }) => {
    const reference = operationPlan.getReference();
    const seed = [row.operation, row.start, row.end, row.demand ?? "", row.quantity,
      row.batch, row.orderType, row.ownerOperation ?? ""].join("|");
    const occurrence = (keyCounts.get(seed) ?? 0) + 1;
    keyCounts.set(seed, occurrence);
    const planKey = explicitReferences.has(reference) ? `ref:${reference}` : `auto:${seed}#${occurrence}`;
    planKeys.set(operationPlan, planKey);
    return { ...row, planKey, reference: explicitReferences.has(reference) ? reference : planKey };
  });
  const deliveries = model.demands.flatMap((fields) => {
    const demand = DemandDefault.find(fields.name);
    return (demand?.getDelivery() ?? []).map((operationPlan) => ({
      demand: fields.name,
      quantity: metric(operationPlan.getQuantity()),
      end: operationPlan.getEnd().toString(),
      batch: operationPlan.getBatch(),
      orderType: operationPlan.getOrderType(),
      operationPlanKey: planKeys.get(operationPlan) ?? null,
    }));
  }).sort((left, right) => compareText(left.demand, right.demand)
    || compareText(left.end, right.end) || left.quantity - right.quantity
    || compareText(left.batch, right.batch) || compareText(left.orderType, right.orderType));
  const seenDependencies = new Set();
  const dependencies = OperationPlan.all().flatMap((operationPlan) => [...operationPlan.getDependencies()]
    .filter((dependency) => dependency instanceof OperationPlanDependency && dependency.getSecond() === operationPlan)
    .filter((dependency) => {
      if (seenDependencies.has(dependency)) return false;
      seenDependencies.add(dependency);
      return true;
    })
    .map((dependency) => ({
      first: planKeys.get(dependency.getFirst()) ?? null,
      second: planKeys.get(dependency.getSecond()) ?? null,
      quantity: metric(dependency.getQuantity()),
      operation: dependency.getSecond()?.getOperation()?.getName() ?? null,
      blockedBy: dependency.getFirst()?.getOperation()?.getName() ?? null,
    }))).sort((left, right) => compareText(left.second, right.second)
      || compareText(left.first, right.first)
      || compareText(left.operation, right.operation)
      || compareText(left.blockedBy, right.blockedBy)
      || left.quantity - right.quantity);
  const problems = Problem.all().map((problem) => {
    const owner = problem.getOwner();
    return {
      name: problem.getName(),
      description: problem.getDescription(),
      start: problem.getStart().toString(),
      end: problem.getEnd().toString(),
      entity: problem.getEntity(),
      owner: owner instanceof OperationPlan ? planKeys.get(owner) ?? null : named(owner),
      feasible: problem.isFeasible(),
    };
  }).sort((left, right) => compareText(left.owner, right.owner)
    || compareText(left.name, right.name) || compareText(left.start, right.start)
    || compareText(left.end, right.end) || compareText(left.description, right.description));
  const inventoryProfiles = BufferDefault.all().flatMap((buffer) => [...buffer.getFlowPlanIterator()].map((flowPlan) => {
    const operationPlan = flowPlan.getOperationPlan();
    return {
      buffer: buffer.getName(),
      bufferBatch: buffer.getBatch(),
      date: flowPlan.getDate().toString(),
      quantity: metric(flowPlan.getQuantity()),
      onhand: metric(flowPlan.getOnhand()),
      operationPlanKey: operationPlan instanceof OperationPlan ? planKeys.get(operationPlan) ?? null : null,
      orderType: operationPlan instanceof OperationPlan ? operationPlan.getOrderType() : null,
    };
  })).sort((left, right) => compareText(left.buffer, right.buffer)
    || compareText(left.bufferBatch, right.bufferBatch) || compareText(left.date, right.date)
    || left.quantity - right.quantity || compareText(left.operationPlanKey, right.operationPlanKey)
    || left.onhand - right.onhand);
  const boundaries = [...new Map([new PlanningDate(model.current), ...OperationPlan.all().flatMap((operationPlan) => [
    operationPlan.getStart(), operationPlan.getEnd(),
  ])].map((date) => [date.toString(), date])).values()].sort((left, right) => left.compare(right));
  if (boundaries.length < 2) boundaries.push(boundaries[0].add(86_400));
  const resourcePlans = ResourceDefault.all().flatMap((resource) => [...resource.plan(boundaries)]
    .map((bucket) => {
      const available = metric(bucket.available);
      const load = metric(bucket.load);
      const unavailable = metric(bucket.unavailable);
      const setup = metric(bucket.setup);
      const free = metric(bucket.free);
      const loadConfirmed = metric(bucket.load_confirmed);
      return {
        resource: resource.getName(), start: bucket.start.toString(), end: bucket.end.toString(),
        available, load, unavailable, setup, free, loadConfirmed,
        utilization: metric(available ? (load + setup) / available : load + setup),
      };
    }).filter((bucket) => [bucket.available, bucket.load, bucket.unavailable, bucket.setup, bucket.free, bucket.loadConfirmed]
      .some((value) => value !== 0))).sort((left, right) => compareText(left.resource, right.resource)
        || compareText(left.start, right.start) || compareText(left.end, right.end));
  const costSummary = operationPlans.reduce((summary, operationPlan) => ({
    operationCost: metric(summary.operationCost + operationPlan.operationCost),
    resourceCost: metric(summary.resourceCost + operationPlan.resourceCost),
    setupCost: metric(summary.setupCost + operationPlan.setupCost),
    totalCost: metric(summary.totalCost + operationPlan.totalCost),
    setupPenalty: metric(summary.setupPenalty + operationPlan.setupPenalty),
  }), { operationCost: 0, resourceCost: 0, setupCost: 0, totalCost: 0, setupPenalty: 0 });
  await writeFile(resultPath, JSON.stringify({
    operationPlans, deliveries, dependencies, problems, inventoryProfiles, resourcePlans, costSummary,
  }, null, 2), "utf8");
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const { client, scenarios } = await prepareDatabase();
  try {
    run(process.execPath, [resolve(projectDirectory, "node_modules/typescript/bin/tsc"),
      "-p", "tsconfig.json", "--pretty", "false"]);
    const summaries = [];
    for (const scenario of scenarios) {
      const nativeResult = await runNative(scenario.model, scenario.name);
      const typescriptResult = await runTypescript(scenario.model, scenario.name);
      const differences = firstDifference(nativeResult, typescriptResult);
      await recordResults(client, scenario.name, nativeResult, typescriptResult, differences);
      summaries.push({
        scenario: scenario.name,
        industry: scenario.industry,
        description: scenario.description,
        coverage: scenario.coverage,
        solver: scenario.model.solver,
        input: {
          demands: scenario.model.demands.length,
          items: scenario.model.items.length,
          buffers: scenario.model.buffers.length,
          operations: scenario.model.operations.length,
          resources: scenario.model.resources.length,
          loads: scenario.model.loads.length,
          flows: scenario.model.flows.length,
          skills: (scenario.model.skills ?? []).length,
          setupMatrices: (scenario.model.setupMatrices ?? []).length,
        },
        identical: differences.length === 0,
        nativeOperationPlans: nativeResult.operationPlans.length,
        typescriptOperationPlans: typescriptResult.operationPlans.length,
        nativeDeliveries: nativeResult.deliveries.length,
        typescriptDeliveries: typescriptResult.deliveries.length,
        differenceCount: differences.length,
        firstDifferences: differences.slice(0, 20),
        databaseSchema: "codex_schedule_diff",
      });
    }
    const output = scenarioName === "all" ? summaries : summaries[0];
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (summaries.some((summary) => !summary.identical)) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

if (process.argv[2] === "--typescript-worker") {
  await typescriptWorker(resolve(process.argv[3]), resolve(process.argv[4]));
} else {
  await main();
}
