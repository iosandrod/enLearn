import { defineComponent as Ce, computed as W, openBlock as m, createElementBlock as b, normalizeStyle as te, normalizeClass as P, createBlock as Te, unref as F, createCommentVNode as _, createElementVNode as n, toDisplayString as k, ref as D, watch as ue, nextTick as de, Fragment as C, renderList as j, createVNode as xe, withCtx as ot, normalizeProps as at, guardReactiveProps as rt, createStaticVNode as it, withDirectives as Ae, vModelText as lt, vModelSelect as st } from "vue";
import { Handle as $e, Position as ne, MarkerType as We, ConnectionLineType as Re, useVueFlow as ut, VueFlow as dt } from "@vue-flow/core";
const ct = { class: "trigger-flow-node__icon" }, gt = { class: "trigger-flow-node__copy" }, pt = { class: "trigger-flow-node__category" }, ft = /* @__PURE__ */ Ce({
  __name: "TriggerFlowNode",
  props: {
    data: {},
    selected: { type: Boolean, default: !1 },
    connectable: { type: [Boolean, Number, String, Function], default: !0 }
  },
  setup(e) {
    const o = e, i = W(() => ({
      workflowType: o.data?.workflowType ?? "task",
      label: o.data?.label ?? "Task",
      category: o.data?.category ?? "task",
      description: o.data?.description ?? "",
      icon: o.data?.icon ?? "TASK",
      accent: o.data?.accent ?? "#4f46e5",
      accentSoft: o.data?.accentSoft ?? "#eef2ff",
      accentBorder: o.data?.accentBorder ?? "#c7d2fe",
      summary: o.data?.summary ?? "Not configured",
      isEntry: o.data?.isEntry ?? !1,
      isEnd: o.data?.isEnd ?? !1
    }));
    return (s, p) => (m(), b("article", {
      class: P(["trigger-flow-node", {
        "trigger-flow-node--selected": e.selected,
        "trigger-flow-node--event": i.value.isEntry || i.value.isEnd
      }]),
      style: te({
        "--node-accent": i.value.accent,
        "--node-soft": i.value.accentSoft,
        "--node-border": i.value.accentBorder
      })
    }, [
      i.value.isEntry ? _("", !0) : (m(), Te(F($e), {
        key: 0,
        id: "in",
        type: "target",
        position: F(ne).Top,
        connectable: e.connectable
      }, null, 8, ["position", "connectable"])),
      n("span", ct, k(i.value.icon), 1),
      n("span", gt, [
        n("strong", null, k(i.value.label), 1),
        n("small", null, k(i.value.summary), 1)
      ]),
      n("span", pt, k(i.value.category), 1),
      i.value.isEnd ? _("", !0) : (m(), Te(F($e), {
        key: 1,
        id: "out",
        type: "source",
        position: F(ne).Bottom,
        connectable: e.connectable
      }, null, 8, ["position", "connectable"]))
    ], 6));
  }
}), qe = (e, o) => {
  const i = e.__vccOpts || e;
  for (const [s, p] of o)
    i[s] = p;
  return i;
}, vt = /* @__PURE__ */ qe(ft, [["__scopeId", "data-v-183df408"]]), De = [
  x("start", "Start", "trigger", "Entry point for a manually triggered run.", "▶", "#16a34a", ["approval", "dataSync", "aiAgent", "custom"], !1, !0, 1, 1),
  x("schedule", "Schedule", "trigger", "Trigger.dev cron or scheduled task entry.", "CRON", "#0f766e", ["dataSync", "aiAgent", "custom"], !1, !0, 1, 1),
  x("webhook", "Webhook", "trigger", "HTTP event entry for external systems.", "HTTP", "#2563eb", ["approval", "dataSync", "aiAgent", "custom"], !1, !0, 1, 1),
  x("manualApproval", "Approval", "human", "Human approval step using triggerAndWait semantics.", "OK", "#7c3aed", ["approval", "custom"], !0, !0, 1, 1),
  x("condition", "Condition", "control", "Route by payload, output, or expression.", "IF", "#d97706", ["approval", "dataSync", "aiAgent", "custom"], !0, !0, 2),
  x("parallel", "Parallel", "control", "Fan out multiple task branches.", "||", "#dc2626", ["approval", "dataSync", "aiAgent", "custom"], !0, !0, 2),
  x("task", "Task", "task", "Trigger.dev task execution.", "TASK", "#4f46e5", ["approval", "dataSync", "aiAgent", "custom"], !0, !0, 1, 1),
  x("triggerAndWait", "Trigger & Wait", "task", "Call another task and wait for completion.", "WAIT", "#0891b2", ["approval", "dataSync", "aiAgent", "custom"], !0, !0, 1, 1),
  x("batchTrigger", "Batch", "task", "Fan out batchTriggerAndWait style work.", "BATCH", "#be123c", ["dataSync", "aiAgent", "custom"], !0, !0, 1, 1),
  x("wait", "Wait", "control", "Wait for duration, date, or token.", "⏱", "#db2777", ["approval", "dataSync", "aiAgent", "custom"], !0, !0, 1, 1),
  x("dataSource", "Source", "data", "Read from a database, API, file, or SaaS connector.", "SRC", "#0284c7", ["dataSync", "custom"], !0, !0, 1, 1),
  x("transform", "Transform", "data", "Map, clean, enrich, or filter records.", "MAP", "#65a30d", ["dataSync", "aiAgent", "custom"], !0, !0, 1, 1),
  x("dataSink", "Sink", "data", "Write results to a destination connector.", "DST", "#c2410c", ["dataSync", "custom"], !0, !0, 1, 1),
  x("agent", "Agent", "ai", "AI agent reasoning loop task.", "AI", "#9333ea", ["aiAgent", "custom"], !0, !0, 1, 1),
  x("tool", "Tool", "ai", "Callable agent tool backed by a Trigger.dev task.", "TOOL", "#2563eb", ["aiAgent", "custom"], !0, !0, 1, 1),
  x("memory", "Memory", "ai", "Read or write agent memory/context.", "MEM", "#0d9488", ["aiAgent", "custom"], !0, !0, 1, 1),
  x("humanReview", "Review", "human", "Human review for AI outputs or risky actions.", "REV", "#a21caf", ["aiAgent", "approval", "custom"], !0, !0, 1, 1),
  x("end", "End", "terminal", "Terminal completion node.", "END", "#475569", ["approval", "dataSync", "aiAgent", "custom"], !0, !1, 0, 0)
], Me = new Map(De.map((e) => [e.type, e]));
function ge(e) {
  return Me.get(e);
}
function yt(e) {
  return Me.has(e);
}
function mt(e) {
  return De.filter((o) => o.allowedKinds.includes(e) && o.type !== "start" && o.type !== "end");
}
function x(e, o, i, s, p, u, y, c, r, v, g) {
  return {
    type: e,
    label: o,
    category: i,
    description: s,
    icon: p,
    accent: u,
    accentSoft: Ie(u, 0.92),
    accentBorder: Ie(u, 0.72),
    allowedKinds: y,
    allowIncoming: c,
    allowOutgoing: r,
    ...v !== void 0 ? { minOutgoing: v } : {},
    ...g !== void 0 ? { maxOutgoing: g } : {}
  };
}
function Ie(e, o) {
  const i = e.replace("#", ""), s = Number.parseInt(i, 16), p = s >> 16, u = s >> 8 & 255, y = s & 255, c = (r) => Math.round(r + (255 - r) * o);
  return `rgb(${c(p)}, ${c(u)}, ${c(y)})`;
}
const bt = "trigger-workflow-node";
function Ee(e) {
  return e.nodes.map((o, i) => ({
    id: o.id,
    label: o.name,
    position: o.position ?? { x: 380, y: 40 + i * 150 },
    type: bt,
    data: St(o),
    draggable: !pe(o.type) && o.type !== "end",
    deletable: !pe(o.type) && o.type !== "end",
    selectable: !0,
    connectable: !0,
    sourcePosition: ne.Bottom,
    targetPosition: ne.Top
  }));
}
function _e(e) {
  return e.edges.map((o) => ({
    id: o.id,
    source: o.source,
    target: o.target,
    sourceHandle: "out",
    targetHandle: "in",
    label: o.name,
    type: Re.SmoothStep,
    markerEnd: We.ArrowClosed,
    animated: !!o.condition,
    style: {
      stroke: o.condition ? "#d97706" : "#64748b",
      strokeWidth: 2
    },
    labelStyle: {
      fill: "#475569",
      fontSize: 11,
      fontWeight: 700
    },
    labelBgStyle: {
      fill: "#ffffff",
      stroke: "#dbe4f0",
      strokeWidth: 1
    },
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 5,
    data: {
      condition: o.condition
    }
  }));
}
function kt(e, o, i) {
  const s = new Map(e.nodes.map((u) => [u.id, u])), p = new Map(e.edges.map((u) => [u.id, u]));
  return {
    ...e,
    nodes: o.map((u) => ({
      ...s.get(u.id) ?? {},
      id: u.id,
      type: u.data.workflowType,
      name: ce(u.label) || u.data.label,
      position: {
        x: u.position.x,
        y: u.position.y
      }
    })),
    edges: i.map((u) => ({
      ...p.get(u.id) ?? {},
      id: u.id,
      source: u.source,
      target: u.target,
      ...ce(u.label) ? { name: ce(u.label) } : {},
      ...u.data?.condition ? { condition: u.data.condition } : {}
    }))
  };
}
function wt(e, o) {
  return {
    id: o,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "out",
    targetHandle: e.targetHandle ?? "in",
    type: Re.SmoothStep,
    markerEnd: We.ArrowClosed,
    style: {
      stroke: "#64748b",
      strokeWidth: 2
    }
  };
}
function ht(e, o) {
  const i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map();
  e.forEach((r) => {
    i.set(r.id, []), s.set(r.id, 0);
  }), o.forEach((r) => {
    i.set(r.source, [...i.get(r.source) ?? [], r.target]), s.set(r.target, (s.get(r.target) ?? 0) + 1);
  });
  const p = e.filter((r) => r.data.isEntry).map((r) => r.id), u = p.length ? [...p] : e.filter((r) => (s.get(r.id) ?? 0) === 0).map((r) => r.id), y = new Map(u.map((r) => [r, 0]));
  for (; u.length; ) {
    const r = u.shift();
    if (!r) continue;
    const v = y.get(r) ?? 0;
    for (const g of i.get(r) ?? []) {
      const E = v + 1;
      (y.get(g) ?? -1) < E && (y.set(g, E), u.push(g));
    }
  }
  const c = /* @__PURE__ */ new Map();
  return e.forEach((r) => {
    const v = y.get(r.id) ?? c.size;
    c.set(v, [...c.get(v) ?? [], r]);
  }), e.map((r) => {
    const v = y.get(r.id) ?? 0, g = c.get(v) ?? [r], E = g.findIndex((V) => V.id === r.id), R = 310, z = 380 - (g.length - 1) * R / 2;
    return {
      ...r,
      position: {
        x: z + E * R,
        y: 40 + v * 160
      }
    };
  });
}
function St(e) {
  const o = ge(e.type);
  return {
    workflowType: e.type,
    label: e.name,
    category: o?.category ?? "custom",
    description: e.description ?? o?.description ?? "",
    icon: o?.icon ?? "TASK",
    accent: o?.accent ?? "#334155",
    accentSoft: o?.accentSoft ?? "#f8fafc",
    accentBorder: o?.accentBorder ?? "#cbd5e1",
    summary: Tt(e),
    isEntry: pe(e.type),
    isEnd: e.type === "end"
  };
}
function Tt(e) {
  const o = e.config;
  return e.type === "schedule" ? `${o?.schedule?.cron ?? "cron"} · ${o?.schedule?.timezone ?? "UTC"}` : e.type === "webhook" ? `${o?.webhook?.method ?? "POST"} ${o?.webhook?.path ?? "/"}` : e.type === "manualApproval" || e.type === "humanReview" ? `${o?.approval?.assigneeType ?? "assignee"} · ${o?.approval?.onTimeout ?? "fail"}` : e.type === "wait" ? `${o?.wait?.mode ?? "duration"} · ${o?.wait?.duration ?? o?.wait?.tokenKey ?? ""}` : e.type === "agent" ? `${o?.ai?.provider ?? "AI"} · ${o?.ai?.model ?? "model"}` : e.type === "dataSource" || e.type === "dataSink" ? `${o?.data?.connector ?? "connector"} · ${o?.data?.operation ?? "sync"}` : e.type === "condition" ? "Conditional routing" : e.type === "parallel" ? "Parallel fan-out" : o?.task?.id ?? e.description ?? "Not configured";
}
function pe(e) {
  return e === "start" || e === "schedule" || e === "webhook";
}
function ce(e) {
  return typeof e == "string" ? e.trim() : "";
}
const J = 1;
function L(e) {
  const o = M(e) ? e : {}, i = It(o.kind), s = Array.isArray(o.nodes) ? o.nodes.filter(M).map((u, y) => At(u, y)) : [], p = Array.isArray(o.edges) ? o.edges.filter(M).map((u, y) => $t(u, y)) : [];
  return {
    schemaVersion: typeof o.schemaVersion == "number" ? o.schemaVersion : J,
    ...I(o.id) ? { id: I(o.id) } : {},
    code: I(o.code, `${i}_workflow`),
    name: I(o.name, Et(i)),
    ...I(o.description) ? { description: I(o.description) } : {},
    kind: i,
    ...M(o.triggerDev) ? { triggerDev: o.triggerDev } : {},
    nodes: s,
    edges: p,
    ...Array.isArray(o.variables) ? { variables: o.variables } : {},
    ...M(o.settings) ? { settings: o.settings } : {}
  };
}
function xt(e) {
  return L(JSON.parse(JSON.stringify(e)));
}
function M(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e);
}
function At(e, o) {
  const i = I(e.type, "task");
  return {
    id: I(e.id, `${i}_${o + 1}`),
    type: i,
    name: I(e.name, i),
    ...I(e.description) ? { description: I(e.description) } : {},
    ...M(e.position) && typeof e.position.x == "number" && typeof e.position.y == "number" ? {
      position: {
        x: e.position.x,
        y: e.position.y
      }
    } : {},
    ...M(e.config) ? { config: e.config } : {}
  };
}
function $t(e, o) {
  return {
    id: I(e.id, `edge_${o + 1}`),
    source: I(e.source),
    target: I(e.target),
    ...I(e.name) ? { name: I(e.name) } : {},
    ...M(e.condition) ? { condition: e.condition } : {}
  };
}
function It(e) {
  return e === "approval" || e === "dataSync" || e === "aiAgent" || e === "custom" ? e : "custom";
}
function I(e, o = "") {
  return typeof e == "string" && e.trim() ? e.trim() : o;
}
function Et(e) {
  return e === "approval" ? "Approval workflow" : e === "dataSync" ? "Data sync workflow" : e === "aiAgent" ? "AI agent workflow" : "Trigger workflow";
}
class _t extends Error {
  constructor(o) {
    super(o.map((i) => `${i.path}: ${i.message}`).join(`
`)), this.issues = o, this.name = "TriggerWorkflowValidationError";
  }
  issues;
}
function fe(e) {
  const o = [], i = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Set();
  e.schemaVersion !== J && f(o, "error", "schemaVersion", `Unsupported schema version ${e.schemaVersion}.`), e.code.trim() || f(o, "error", "code", "Workflow code is required."), e.name.trim() || f(o, "error", "name", "Workflow name is required."), e.nodes.length || f(o, "error", "nodes", "Workflow requires nodes."), e.nodes.forEach((r, v) => {
    const g = `nodes.${v}`;
    r.id.trim() ? i.has(r.id) ? f(o, "error", `${g}.id`, `Duplicate node ID "${r.id}".`) : i.add(r.id) : f(o, "error", `${g}.id`, "Node ID is required."), yt(r.type) || f(o, "error", `${g}.type`, `Unsupported node type "${r.type}".`), r.name.trim() || f(o, "error", `${g}.name`, "Node name is required."), Ct(r, o, g);
  });
  const p = e.nodes.filter((r) => r.type === "start" || r.type === "schedule" || r.type === "webhook"), u = e.nodes.filter((r) => r.type === "end");
  p.length !== 1 && f(o, "error", "nodes", "Workflow requires exactly one entry node."), u.length || f(o, "error", "nodes", "Workflow requires at least one end node."), e.edges.forEach((r, v) => {
    const g = `edges.${v}`;
    r.id.trim() ? s.has(r.id) ? f(o, "error", `${g}.id`, `Duplicate edge ID "${r.id}".`) : s.add(r.id) : f(o, "error", `${g}.id`, "Edge ID is required."), i.has(r.source) || f(o, "error", `${g}.source`, `Source node "${r.source}" does not exist.`), i.has(r.target) || f(o, "error", `${g}.target`, `Target node "${r.target}" does not exist.`), r.source === r.target && f(o, "error", g, "Self-loop edges are not supported."), r.condition?.type === "field" && !r.condition.field.trim() && f(o, "error", `${g}.condition.field`, "Field condition requires a field."), r.condition?.type === "expression" && !r.condition.expression.trim() && f(o, "error", `${g}.condition.expression`, "Expression condition requires an expression.");
  });
  const y = Ne(e, "target"), c = Ne(e, "source");
  if (e.nodes.forEach((r, v) => {
    const g = `nodes.${v}`, E = r.type === "start" || r.type === "schedule" || r.type === "webhook";
    !E && (y.get(r.id) ?? 0) === 0 && f(o, "error", g, "Node requires an incoming edge."), r.type !== "end" && (c.get(r.id) ?? 0) === 0 && f(o, "error", g, "Node requires an outgoing edge."), r.type === "condition" && (c.get(r.id) ?? 0) < 2 && f(o, "error", g, "Condition requires at least two branches."), r.type === "parallel" && (c.get(r.id) ?? 0) < 2 && f(o, "error", g, "Parallel requires at least two branches."), !E && r.type !== "end" && r.type !== "condition" && r.type !== "parallel" && (c.get(r.id) ?? 0) > 1 && f(o, "error", g, `${r.type} supports one outgoing edge.`);
  }), p.length === 1) {
    const r = Wt(e, p[0].id);
    e.nodes.forEach((v, g) => {
      r.has(v.id) || f(o, "error", `nodes.${g}`, `Node "${v.id}" is unreachable.`);
    });
  }
  return o;
}
function Nt(e) {
  const o = fe(e), i = o.filter((s) => s.level === "error");
  if (i.length) throw new _t(i);
  return o;
}
function Ct(e, o, i) {
  const s = e.config ?? {}, p = s.task;
  if (["task", "triggerAndWait", "batchTrigger", "tool"].includes(e.type) && !p?.id?.trim() && f(o, "error", `${i}.config.task.id`, `${e.type} requires a Trigger.dev task ID.`), p?.timeoutSeconds !== void 0 && (!Number.isInteger(p.timeoutSeconds) || p.timeoutSeconds < 1) && f(o, "error", `${i}.config.task.timeoutSeconds`, "Task timeout must be a positive integer."), p?.queue?.concurrencyLimit !== void 0 && (!Number.isInteger(p.queue.concurrencyLimit) || p.queue.concurrencyLimit < 1) && f(o, "error", `${i}.config.task.queue.concurrencyLimit`, "Queue concurrency must be a positive integer."), e.type === "schedule" && (s.schedule?.cron?.trim() || f(o, "error", `${i}.config.schedule.cron`, "Schedule requires a cron expression."), s.schedule?.timezone?.trim() || f(o, "warning", `${i}.config.schedule.timezone`, "Schedule should define a timezone.")), (e.type === "manualApproval" || e.type === "humanReview") && (s.approval?.assigneeType || f(o, "error", `${i}.config.approval.assigneeType`, "Human step requires an assignee type.")), e.type === "wait") {
    const u = s.wait;
    u?.mode || f(o, "error", `${i}.config.wait.mode`, "Wait node requires a mode."), u?.mode === "duration" && !u.duration?.trim() && f(o, "error", `${i}.config.wait.duration`, "Duration wait requires an ISO duration."), u?.mode === "until" && (!u.until || Number.isNaN(new Date(u.until).getTime())) && f(o, "error", `${i}.config.wait.until`, "Until wait requires a valid datetime."), u?.mode === "token" && !u.tokenKey?.trim() && f(o, "error", `${i}.config.wait.tokenKey`, "Token wait requires a token key.");
  }
  ["dataSource", "dataSink"].includes(e.type) && !s.data?.connector?.trim() && f(o, "error", `${i}.config.data.connector`, `${e.type} requires a connector.`), e.type === "agent" && (s.ai?.model?.trim() || f(o, "error", `${i}.config.ai.model`, "Agent requires a model."), s.ai?.prompt?.trim() || f(o, "warning", `${i}.config.ai.prompt`, "Agent should define a prompt.")), e.type === "transform" && !s.expression?.trim() && !M(s.data?.mapping) && f(o, "warning", `${i}.config`, "Transform should define an expression or mapping.");
}
function f(e, o, i, s) {
  e.push({ level: o, path: i, message: s });
}
function Ne(e, o) {
  const i = /* @__PURE__ */ new Map();
  return e.edges.forEach((s) => i.set(s[o], (i.get(s[o]) ?? 0) + 1)), i;
}
function Wt(e, o) {
  const i = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Map();
  e.edges.forEach((u) => s.set(u.source, [...s.get(u.source) ?? [], u.target]));
  const p = [o];
  for (; p.length; ) {
    const u = p.pop();
    !u || i.has(u) || (i.add(u), p.push(...s.get(u) ?? []));
  }
  return i;
}
function Rt(e) {
  Nt(e);
  const o = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map();
  e.nodes.forEach((c) => {
    o.set(c.id, []), i.set(c.id, []);
  }), e.edges.forEach((c) => {
    o.set(c.target, [...o.get(c.target) ?? [], c.source]), i.set(c.source, [...i.get(c.source) ?? [], c.target]);
  });
  const s = e.nodes.find((c) => c.type === "start" || c.type === "schedule" || c.type === "webhook");
  if (!s)
    throw new Error("Trigger workflow requires an entry node.");
  const p = e.nodes.map((c) => {
    const r = e.edges.filter((v) => v.source === c.id);
    return qt(c, o.get(c.id) ?? [], r);
  }), u = Array.from(
    new Set(
      p.map((c) => c.task?.id).filter((c) => !!c)
    )
  ), y = e.nodes.find((c) => c.type === "schedule");
  return {
    workflowId: e.id ?? e.code,
    workflowCode: e.code,
    workflowName: e.name,
    kind: e.kind,
    entryNodeId: s.id,
    operations: p,
    taskIds: u,
    ...y?.config?.schedule?.cron ? {
      schedule: {
        nodeId: y.id,
        cron: y.config.schedule.cron,
        ...y.config.schedule.timezone ? { timezone: y.config.schedule.timezone } : {},
        ...y.config.schedule.externalId ? { externalId: y.config.schedule.externalId } : {}
      }
    } : {}
  };
}
function qt(e, o, i) {
  const s = {
    id: `op_${e.id}`,
    nodeId: e.id,
    label: e.name,
    dependsOn: o,
    next: i.map((p) => p.target),
    options: e.config?.metadata ?? {}
  };
  switch (e.type) {
    case "start":
      return { ...s, type: "entry" };
    case "schedule":
      return { ...s, type: "schedule", options: e.config?.schedule ?? {} };
    case "webhook":
      return { ...s, type: "webhook", options: e.config?.webhook ?? {} };
    case "manualApproval":
    case "humanReview":
      return { ...s, type: "human.approval", task: e.config?.task, options: e.config?.approval ?? {} };
    case "condition":
      return { ...s, type: "condition", options: { branches: i } };
    case "parallel":
      return { ...s, type: "parallel", options: { branches: i.map((p) => p.target) } };
    case "triggerAndWait":
      return { ...s, type: "task.triggerAndWait", task: e.config?.task };
    case "batchTrigger":
      return { ...s, type: "task.batchTriggerAndWait", task: e.config?.task, options: e.config?.data ?? {} };
    case "wait":
      return Dt(e, s);
    case "dataSource":
    case "dataSink":
      return { ...s, type: "data.connector", task: e.config?.task, options: e.config?.data ?? {} };
    case "agent":
      return { ...s, type: "ai.agent", task: e.config?.task, options: e.config?.ai ?? {} };
    case "tool":
      return { ...s, type: "task.triggerAndWait", task: e.config?.task, options: { aiTool: !0 } };
    case "memory":
    case "transform":
    case "task":
      return { ...s, type: "task.trigger", task: e.config?.task, options: e.config ?? {} };
    case "end":
      return { ...s, type: "complete" };
    default:
      return { ...s, type: "task.trigger", task: e.config?.task, options: e.config ?? {} };
  }
}
function Dt(e, o) {
  const i = e.config?.wait;
  return i?.mode === "until" ? { ...o, type: "wait.until", options: i } : i?.mode === "token" ? { ...o, type: "wait.forToken", options: i } : { ...o, type: "wait.for", options: i ?? {} };
}
function ve() {
  return L({
    schemaVersion: J,
    code: "expense_approval_trigger",
    name: "Expense Approval Trigger Workflow",
    kind: "approval",
    nodes: [
      S("webhook", "webhook", "Expense submitted", 380, 40, {
        webhook: { path: "/expenses/submitted", method: "POST" }
      }),
      S("task", "validate_expense", "Validate expense", 380, 190, {
        task: { id: "expense.validate", retry: { maxAttempts: 3 }, idempotencyKey: "{{payload.expenseId}}:validate" }
      }),
      S("condition", "amount_condition", "Amount condition", 380, 340),
      S("manualApproval", "manager_approval", "Manager approval", 190, 510, {
        task: { id: "approval.manager.wait" },
        approval: { assigneeType: "role", assigneeIds: ["manager"], timeoutSeconds: 86400, onTimeout: "autoReject" }
      }),
      S("manualApproval", "finance_approval", "Finance approval", 570, 510, {
        task: { id: "approval.finance.wait" },
        approval: { assigneeType: "role", assigneeIds: ["finance"], timeoutSeconds: 172800, onTimeout: "autoReject" }
      }),
      S("task", "sync_status", "Sync approval result", 380, 690, {
        task: { id: "expense.syncApprovalStatus", retry: { maxAttempts: 5 } }
      }),
      S("end", "end", "Completed", 380, 850)
    ],
    edges: [
      T("webhook", "validate_expense"),
      T("validate_expense", "amount_condition"),
      T("amount_condition", "manager_approval", "Under limit", { type: "field", field: "amount", operator: "lt", value: 5e3 }),
      T("amount_condition", "finance_approval", "High value", { type: "field", field: "amount", operator: "gte", value: 5e3 }),
      T("manager_approval", "sync_status"),
      T("finance_approval", "sync_status"),
      T("sync_status", "end")
    ]
  });
}
function Oe() {
  return L({
    schemaVersion: J,
    code: "daily_crm_sync",
    name: "Daily CRM Data Sync",
    kind: "dataSync",
    nodes: [
      S("schedule", "schedule", "Every morning", 380, 40, {
        schedule: { cron: "0 8 * * *", timezone: "Asia/Shanghai", externalId: "daily-crm-sync" }
      }),
      S("dataSource", "extract_crm", "Extract CRM records", 380, 190, {
        task: { id: "crm.extract", queue: { name: "crm-sync", concurrencyLimit: 2 } },
        data: { connector: "salesforce", operation: "extract", source: "accounts", batchSize: 500 }
      }),
      S("transform", "normalize_records", "Normalize records", 380, 340, {
        task: { id: "crm.normalize" },
        data: { mapping: { externalId: "Id", name: "Name", owner: "Owner.Email" } }
      }),
      S("batchTrigger", "upsert_batches", "Upsert batches", 380, 490, {
        task: { id: "warehouse.upsertBatch", retry: { maxAttempts: 5 } },
        data: { connector: "postgres", operation: "upsert", target: "crm_accounts", batchSize: 1e3 }
      }),
      S("dataSink", "write_audit", "Write sync audit", 380, 640, {
        task: { id: "sync.writeAudit" },
        data: { connector: "postgres", operation: "load", target: "sync_runs" }
      }),
      S("end", "end", "Synced", 380, 790)
    ],
    edges: [
      T("schedule", "extract_crm"),
      T("extract_crm", "normalize_records"),
      T("normalize_records", "upsert_batches"),
      T("upsert_batches", "write_audit"),
      T("write_audit", "end")
    ]
  });
}
function Ve() {
  return L({
    schemaVersion: J,
    code: "support_agent_triage",
    name: "Support AI Agent Triage",
    kind: "aiAgent",
    nodes: [
      S("webhook", "ticket_created", "Ticket created", 380, 40, {
        webhook: { path: "/support/tickets", method: "POST" }
      }),
      S("memory", "load_context", "Load customer context", 380, 190, {
        task: { id: "agent.memory.load" },
        ai: { memoryKey: "{{payload.customerId}}" }
      }),
      S("agent", "triage_agent", "Triage agent", 380, 340, {
        task: { id: "agent.support.triage", queue: { name: "ai-agent", concurrencyLimit: 4 } },
        ai: {
          provider: "openai",
          model: "gpt-4.1",
          prompt: "Classify urgency, summarize the issue, and decide the next action.",
          tools: ["search_docs", "create_reply"],
          maxTurns: 6,
          requireHumanReview: !0
        }
      }),
      S("parallel", "tool_parallel", "Run agent tools", 380, 490),
      S("tool", "search_docs", "Search knowledge base", 180, 650, {
        task: { id: "agent.tool.searchDocs" },
        ai: { tools: ["search_docs"] }
      }),
      S("tool", "draft_reply", "Draft reply", 580, 650, {
        task: { id: "agent.tool.draftReply" },
        ai: { tools: ["create_reply"] }
      }),
      S("humanReview", "review_reply", "Human review", 380, 830, {
        task: { id: "agent.review.wait" },
        approval: { assigneeType: "team", assigneeIds: ["support-leads"], timeoutSeconds: 3600, onTimeout: "continue" }
      }),
      S("task", "send_reply", "Send reply", 380, 990, {
        task: { id: "support.sendReply", idempotencyKey: "{{payload.ticketId}}:reply" }
      }),
      S("end", "end", "Resolved", 380, 1150)
    ],
    edges: [
      T("ticket_created", "load_context"),
      T("load_context", "triage_agent"),
      T("triage_agent", "tool_parallel"),
      T("tool_parallel", "search_docs"),
      T("tool_parallel", "draft_reply"),
      T("search_docs", "review_reply"),
      T("draft_reply", "review_reply"),
      T("review_reply", "send_reply"),
      T("send_reply", "end")
    ]
  });
}
const ro = {
  approval: ve,
  dataSync: Oe,
  aiAgent: Ve
};
function S(e, o, i, s, p, u) {
  return {
    id: o,
    type: e,
    name: i,
    position: { x: s, y: p },
    ...u ? { config: u } : {}
  };
}
function T(e, o, i, s) {
  return {
    id: `edge_${e}_${o}`,
    source: e,
    target: o,
    ...i ? { name: i } : {},
    ...s ? { condition: s } : {}
  };
}
const Mt = { class: "trigger-editor__header" }, Ot = { class: "trigger-editor__identity" }, Vt = ["value", "disabled"], zt = ["value", "disabled"], Bt = {
  class: "trigger-editor__kind",
  role: "tablist",
  "aria-label": "Workflow type"
}, Pt = ["disabled", "onClick"], Ft = { class: "trigger-editor__actions" }, Lt = ["disabled"], Ht = { class: "trigger-editor__workspace" }, Kt = { class: "trigger-editor__palette" }, Ut = { class: "trigger-editor__side-head" }, jt = { class: "trigger-editor__templates" }, Jt = ["disabled"], Gt = ["disabled"], Qt = ["disabled"], Yt = { class: "trigger-editor__side-head trigger-editor__side-head--nodes" }, Xt = { class: "trigger-editor__palette-list" }, Zt = ["disabled", "title", "onClick"], en = { class: "trigger-editor__canvas" }, tn = { class: "trigger-editor__canvas-status" }, nn = { class: "trigger-editor__inspector" }, on = { class: "trigger-editor__tabs" }, an = {
  key: 0,
  class: "trigger-editor__compiled"
}, rn = ["value"], ln = {
  key: 1,
  class: "trigger-editor__form"
}, sn = { class: "trigger-editor__selected" }, un = ["value", "disabled"], dn = ["value", "disabled"], cn = ["value", "disabled"], gn = ["value", "disabled"], pn = ["value", "disabled"], fn = ["value", "disabled"], vn = ["value", "disabled"], yn = ["value", "disabled"], mn = { class: "trigger-editor__field-grid" }, bn = ["value", "disabled"], kn = ["value", "disabled"], wn = ["value", "disabled"], hn = ["value", "disabled"], Sn = ["value", "disabled"], Tn = ["value", "disabled"], xn = ["value", "disabled"], An = { key: 0 }, $n = ["value", "disabled"], In = { key: 1 }, En = ["value", "disabled"], _n = { key: 2 }, Nn = ["value", "disabled"], Cn = ["value", "disabled"], Wn = ["value", "disabled"], Rn = ["value", "disabled"], qn = ["value", "disabled"], Dn = { class: "trigger-editor__field-grid" }, Mn = ["value", "disabled"], On = ["value", "disabled"], Vn = ["value", "disabled"], zn = ["disabled"], Bn = {
  key: 7,
  class: "trigger-editor__error"
}, Pn = { class: "trigger-editor__form-actions" }, Fn = ["disabled"], Ln = ["disabled"], Hn = {
  key: 2,
  class: "trigger-editor__form"
}, Kn = { class: "trigger-editor__selected trigger-editor__selected--edge" }, Un = ["value", "disabled"], jn = ["disabled"], Jn = ["value", "disabled"], Gn = ["value", "disabled"], Qn = ["value", "disabled"], Yn = { key: 1 }, Xn = ["value", "disabled"], Zn = ["disabled"], eo = {
  key: 3,
  class: "trigger-editor__issues"
}, to = { class: "trigger-editor__side-head" }, no = /* @__PURE__ */ Ce({
  __name: "TriggerWorkflowEditor",
  props: {
    modelValue: {},
    readonly: { type: Boolean, default: !1 },
    height: { default: "760px" }
  },
  emits: ["update:modelValue", "change", "validation", "compile", "export"],
  setup(e, { emit: o }) {
    const i = e, s = o, p = [
      { value: "approval", label: "审批流" },
      { value: "dataSync", label: "数据同步" },
      { value: "aiAgent", label: "AI Agent" },
      { value: "custom", label: "自定义" }
    ], u = `trigger-workflow-editor-${Math.random().toString(36).slice(2)}`, { fitView: y } = ut(u), c = ve(), r = D(L(i.modelValue ?? c)), v = D(Ee(r.value)), g = D(_e(r.value)), E = D(null), R = D(null), q = D("config"), z = D("{}"), V = D(""), oe = D(!1);
    let G = 0;
    const ye = W(() => mt(r.value.kind)), d = W(() => r.value.nodes.find((l) => l.id === E.value)), A = W(() => r.value.edges.find((l) => l.id === R.value)), Q = W(() => fe(r.value)), H = W(() => Q.value.filter((l) => l.level === "error").length), ae = W(() => {
      if (!H.value)
        try {
          return Rt(r.value);
        } catch {
          return;
        }
    }), ze = W(
      () => JSON.stringify(ae.value ?? { errors: Q.value }, null, 2)
    ), K = W(
      () => d.value ? ge(d.value.type) : void 0
    ), Be = W(() => ({ "--trigger-editor-height": i.height })), me = W({
      get: () => A.value?.condition?.type ?? "always",
      set: (l) => Ge(l)
    });
    ue(
      () => i.modelValue,
      (l) => {
        l && be(l);
      },
      { deep: !0 }
    ), ue(
      [v, g],
      () => {
        if (oe.value) return;
        const l = kt(r.value, v.value, g.value);
        r.value = l, Y(l);
      },
      { deep: !0 }
    ), ue(
      d,
      (l) => {
        z.value = JSON.stringify(l?.config ?? {}, null, 2), V.value = "";
      },
      { immediate: !0 }
    );
    function Y(l) {
      s("update:modelValue", l), s("change", l), s("validation", fe(l));
    }
    function be(l) {
      oe.value = !0, r.value = L(l), v.value = Ee(r.value), g.value = _e(r.value), de(() => {
        oe.value = !1;
      });
    }
    function B(l) {
      be(l), Y(r.value), de(() => y({ padding: 0.18, duration: 180 }));
    }
    function Pe(l) {
      i.readonly || (r.value = { ...r.value, kind: l }, Y(r.value));
    }
    function re(l) {
      if (i.readonly) return;
      const t = l === "approval" ? ve : l === "dataSync" ? Oe : Ve;
      E.value = null, R.value = null, B(t());
    }
    function Fe(l) {
      E.value = l.node.id, R.value = null, q.value = "config";
    }
    function Le(l) {
      R.value = l.edge.id, E.value = null, q.value = "config";
    }
    function He() {
      E.value = null, R.value = null;
    }
    function Ke(l) {
      if (i.readonly) return;
      const t = ge(l);
      if (!t) return;
      G += 1;
      const a = `${l}_${Date.now().toString(36)}_${G}`, h = d.value, N = v.value.find((ee) => ee.id === h?.id), $ = Ze(l, a, t.label, {
        x: N?.position.x ?? 380,
        y: (N?.position.y ?? 40) + 160
      }), se = [...r.value.nodes, $];
      let O = [...r.value.edges];
      if (t.allowIncoming && h && h.type !== "end") {
        const ee = O.filter((U) => U.source === h.id), tt = h.type === "condition" || h.type === "parallel";
        if (ee.length && !tt) {
          const U = ee[0];
          O = O.filter((nt) => nt.id !== U.id), O.push(
            { id: Z(h.id, a), source: h.id, target: a },
            { ...U, id: Z(a, U.target), source: a }
          );
        } else
          O.push({ id: Z(h.id, a), source: h.id, target: a });
      }
      E.value = a, B({
        ...r.value,
        nodes: se,
        edges: O
      });
    }
    function Ue(l) {
      i.readonly || !l.source || !l.target || g.value.some((t) => t.source === l.source && t.target === l.target) || (g.value = [
        ...g.value,
        wt(l, Z(l.source, l.target))
      ]);
    }
    function ke() {
      if (i.readonly) return;
      if (A.value) {
        B({
          ...r.value,
          edges: r.value.edges.filter((t) => t.id !== A.value?.id)
        }), R.value = null;
        return;
      }
      const l = d.value;
      !l || l.type === "start" || l.type === "schedule" || l.type === "webhook" || l.type === "end" || (B({
        ...r.value,
        nodes: r.value.nodes.filter((t) => t.id !== l.id),
        edges: r.value.edges.filter((t) => t.source !== l.id && t.target !== l.id)
      }), E.value = null);
    }
    function we(l, t) {
      if (i.readonly) return;
      const a = t.target.value;
      r.value = { ...r.value, [l]: a }, Y(r.value);
    }
    function he(l, t) {
      const a = d.value;
      if (!a || i.readonly) return;
      const h = t.target.value;
      ie({ ...a, [l]: h });
    }
    function w(l, t) {
      const a = d.value;
      if (!a || i.readonly) return;
      const h = et(a.config ?? {});
      let N = h;
      l.forEach(($, se) => {
        if (se === l.length - 1) {
          N[$] = t;
          return;
        }
        const O = N[$];
        Se(O) || (N[$] = {}), N = N[$];
      }), ie({ ...a, config: h });
    }
    function je() {
      const l = d.value;
      if (!(!l || i.readonly))
        try {
          const t = JSON.parse(z.value);
          if (!Se(t)) throw new Error("Config must be a JSON object.");
          V.value = "", ie({ ...l, config: t });
        } catch (t) {
          V.value = t instanceof Error ? t.message : String(t);
        }
    }
    function ie(l) {
      B({
        ...r.value,
        nodes: r.value.nodes.map((t) => t.id === l.id ? l : t)
      });
    }
    function Je(l) {
      const t = A.value;
      if (!t || i.readonly) return;
      const a = l.target.value;
      le({ ...t, name: a });
    }
    function Ge(l) {
      const t = A.value;
      if (!t || i.readonly) return;
      le(l === "always" ? { ...t, condition: void 0 } : { ...t, condition: l === "field" ? { type: "field", field: "", operator: "eq", value: "" } : l === "expression" ? { type: "expression", expression: "" } : { type: "always" } });
    }
    function X(l, t) {
      const a = A.value;
      if (!a || i.readonly) return;
      const h = a.condition ?? { type: "always" };
      le({
        ...a,
        condition: {
          ...h,
          [l]: t
        }
      });
    }
    function le(l) {
      B({
        ...r.value,
        edges: r.value.edges.map((t) => t.id === l.id ? l : t)
      });
    }
    function Qe() {
      v.value = ht(v.value, g.value), de(() => y({ padding: 0.18, duration: 220 }));
    }
    function Ye() {
      ae.value && (s("compile", ae.value), q.value = "compiled");
    }
    function Xe() {
      s("export", xt(r.value));
    }
    function Ze(l, t, a, h) {
      const N = `${r.value.code}.${t}`, $ = { id: t, type: l, name: a, position: h };
      return l === "task" || l === "triggerAndWait" || l === "batchTrigger" || l === "tool" ? { ...$, config: { task: { id: N, retry: { maxAttempts: 3 } } } } : l === "manualApproval" || l === "humanReview" ? {
        ...$,
        config: {
          task: { id: N },
          approval: { assigneeType: "role", assigneeIds: [], timeoutSeconds: 86400, onTimeout: "fail" }
        }
      } : l === "wait" ? { ...$, config: { wait: { mode: "duration", duration: "PT1H" } } } : l === "dataSource" || l === "dataSink" ? { ...$, config: { task: { id: N }, data: { connector: "http", operation: "sync" } } } : l === "transform" || l === "memory" ? { ...$, config: { task: { id: N }, expression: "" } } : l === "agent" ? { ...$, config: { task: { id: N }, ai: { provider: "openai", model: "gpt-4.1", prompt: "", maxTurns: 6 } } } : l === "schedule" ? { ...$, config: { schedule: { cron: "0 8 * * *", timezone: "Asia/Shanghai" } } } : l === "webhook" ? { ...$, config: { webhook: { path: "/", method: "POST" } } } : $;
    }
    function Z(l, t) {
      return G += 1, `edge_${l}_${t}_${G}`;
    }
    function et(l) {
      return JSON.parse(JSON.stringify(l));
    }
    function Se(l) {
      return typeof l == "object" && l !== null && !Array.isArray(l);
    }
    return (l, t) => (m(), b("section", {
      class: "trigger-editor",
      style: te(Be.value)
    }, [
      n("header", Mt, [
        n("div", Ot, [
          n("input", {
            class: "trigger-editor__title",
            value: r.value.name,
            disabled: e.readonly,
            "aria-label": "Workflow name",
            onInput: t[0] || (t[0] = (a) => we("name", a))
          }, null, 40, Vt),
          n("input", {
            class: "trigger-editor__code",
            value: r.value.code,
            disabled: e.readonly,
            "aria-label": "Workflow code",
            onInput: t[1] || (t[1] = (a) => we("code", a))
          }, null, 40, zt)
        ]),
        n("div", Bt, [
          (m(), b(C, null, j(p, (a) => n("button", {
            key: a.value,
            type: "button",
            class: P({ "trigger-editor__kind-button--active": r.value.kind === a.value }),
            disabled: e.readonly,
            onClick: (h) => Pe(a.value)
          }, k(a.label), 11, Pt)), 64))
        ]),
        n("div", Ft, [
          n("button", {
            type: "button",
            title: "Auto layout",
            onClick: Qe
          }, "Layout"),
          n("button", {
            type: "button",
            title: "Fit workflow",
            onClick: t[2] || (t[2] = (a) => F(y)({ padding: 0.18, duration: 180 }))
          }, "Fit"),
          n("button", {
            type: "button",
            title: "Export workflow",
            onClick: Xe
          }, "Export"),
          n("button", {
            type: "button",
            class: "trigger-editor__primary",
            disabled: !!H.value,
            onClick: Ye
          }, " Compile ", 8, Lt)
        ])
      ]),
      n("div", Ht, [
        n("aside", Kt, [
          n("div", Ut, [
            t[41] || (t[41] = n("strong", null, "Templates", -1)),
            n("span", null, k(r.value.kind), 1)
          ]),
          n("div", jt, [
            n("button", {
              type: "button",
              disabled: e.readonly,
              onClick: t[3] || (t[3] = (a) => re("approval"))
            }, "审批", 8, Jt),
            n("button", {
              type: "button",
              disabled: e.readonly,
              onClick: t[4] || (t[4] = (a) => re("dataSync"))
            }, "同步", 8, Gt),
            n("button", {
              type: "button",
              disabled: e.readonly,
              onClick: t[5] || (t[5] = (a) => re("aiAgent"))
            }, "Agent", 8, Qt)
          ]),
          n("div", Yt, [
            t[42] || (t[42] = n("strong", null, "Nodes", -1)),
            n("span", null, k(ye.value.length), 1)
          ]),
          n("div", Xt, [
            (m(!0), b(C, null, j(ye.value, (a) => (m(), b("button", {
              key: a.type,
              type: "button",
              class: "trigger-editor__palette-item",
              style: te({
                "--palette-accent": a.accent,
                "--palette-soft": a.accentSoft,
                "--palette-border": a.accentBorder
              }),
              disabled: e.readonly,
              title: a.description,
              onClick: (h) => Ke(a.type)
            }, [
              n("span", null, k(a.icon), 1),
              n("strong", null, k(a.label), 1),
              n("small", null, k(a.category), 1)
            ], 12, Zt))), 128))
          ])
        ]),
        n("main", en, [
          n("div", tn, [
            n("span", {
              class: P([{ "trigger-editor__status-dot--error": H.value }, "trigger-editor__status-dot"])
            }, null, 2),
            n("strong", null, k(H.value ? `${H.value} errors` : "Ready"), 1),
            n("span", null, k(r.value.nodes.length) + " nodes · " + k(r.value.edges.length) + " edges", 1)
          ]),
          xe(F(dt), {
            id: u,
            nodes: v.value,
            "onUpdate:nodes": t[6] || (t[6] = (a) => v.value = a),
            edges: g.value,
            "onUpdate:edges": t[7] || (t[7] = (a) => g.value = a),
            class: "trigger-editor__flow",
            "nodes-draggable": !e.readonly,
            "nodes-connectable": !e.readonly,
            "elements-selectable": !0,
            "delete-key-code": null,
            "fit-view-on-init": "",
            onConnect: Ue,
            onNodeClick: Fe,
            onEdgeClick: Le,
            onPaneClick: He
          }, {
            "node-trigger-workflow-node": ot((a) => [
              xe(vt, at(rt(a)), null, 16)
            ]),
            _: 1
          }, 8, ["nodes", "edges", "nodes-draggable", "nodes-connectable"])
        ]),
        n("aside", nn, [
          n("div", on, [
            n("button", {
              type: "button",
              class: P({ "trigger-editor__tab--active": q.value === "config" }),
              onClick: t[8] || (t[8] = (a) => q.value = "config")
            }, " Config ", 2),
            n("button", {
              type: "button",
              class: P({ "trigger-editor__tab--active": q.value === "compiled" }),
              onClick: t[9] || (t[9] = (a) => q.value = "compiled")
            }, " Plan ", 2)
          ]),
          q.value === "compiled" ? (m(), b("div", an, [
            n("textarea", {
              readonly: "",
              value: ze.value
            }, null, 8, rn)
          ])) : d.value ? (m(), b("div", ln, [
            n("div", sn, [
              n("span", {
                style: te({
                  "--selected-accent": K.value?.accent,
                  "--selected-soft": K.value?.accentSoft,
                  "--selected-border": K.value?.accentBorder
                })
              }, k(K.value?.icon), 5),
              n("div", null, [
                n("strong", null, k(d.value.name), 1),
                n("small", null, k(K.value?.category), 1)
              ])
            ]),
            n("label", null, [
              t[43] || (t[43] = n("span", null, "Name", -1)),
              n("input", {
                value: d.value.name,
                disabled: e.readonly,
                onInput: t[10] || (t[10] = (a) => he("name", a))
              }, null, 40, un)
            ]),
            n("label", null, [
              t[44] || (t[44] = n("span", null, "Description", -1)),
              n("textarea", {
                value: d.value.description,
                disabled: e.readonly,
                onInput: t[11] || (t[11] = (a) => he("description", a))
              }, null, 40, dn)
            ]),
            d.value.type === "schedule" ? (m(), b(C, { key: 0 }, [
              n("label", null, [
                t[45] || (t[45] = n("span", null, "Cron", -1)),
                n("input", {
                  value: d.value.config?.schedule?.cron,
                  disabled: e.readonly,
                  onInput: t[12] || (t[12] = (a) => w(["schedule", "cron"], a.target.value))
                }, null, 40, cn)
              ]),
              n("label", null, [
                t[46] || (t[46] = n("span", null, "Timezone", -1)),
                n("input", {
                  value: d.value.config?.schedule?.timezone,
                  disabled: e.readonly,
                  onInput: t[13] || (t[13] = (a) => w(["schedule", "timezone"], a.target.value))
                }, null, 40, gn)
              ])
            ], 64)) : _("", !0),
            d.value.type === "webhook" ? (m(), b(C, { key: 1 }, [
              n("label", null, [
                t[47] || (t[47] = n("span", null, "Path", -1)),
                n("input", {
                  value: d.value.config?.webhook?.path,
                  disabled: e.readonly,
                  onInput: t[14] || (t[14] = (a) => w(["webhook", "path"], a.target.value))
                }, null, 40, pn)
              ]),
              n("label", null, [
                t[48] || (t[48] = n("span", null, "Method", -1)),
                n("select", {
                  value: d.value.config?.webhook?.method ?? "POST",
                  disabled: e.readonly,
                  onChange: t[15] || (t[15] = (a) => w(["webhook", "method"], a.target.value))
                }, [
                  (m(), b(C, null, j(["GET", "POST", "PUT", "PATCH", "DELETE"], (a) => n("option", { key: a }, k(a), 1)), 64))
                ], 40, fn)
              ])
            ], 64)) : _("", !0),
            ["task", "triggerAndWait", "batchTrigger", "tool", "agent", "dataSource", "dataSink", "manualApproval", "humanReview", "transform", "memory"].includes(d.value.type) ? (m(), b(C, { key: 2 }, [
              n("label", null, [
                t[49] || (t[49] = n("span", null, "Task ID", -1)),
                n("input", {
                  value: d.value.config?.task?.id,
                  disabled: e.readonly,
                  onInput: t[16] || (t[16] = (a) => w(["task", "id"], a.target.value))
                }, null, 40, vn)
              ]),
              n("label", null, [
                t[50] || (t[50] = n("span", null, "Queue", -1)),
                n("input", {
                  value: d.value.config?.task?.queue?.name,
                  disabled: e.readonly,
                  onInput: t[17] || (t[17] = (a) => w(["task", "queue", "name"], a.target.value))
                }, null, 40, yn)
              ]),
              n("div", mn, [
                n("label", null, [
                  t[51] || (t[51] = n("span", null, "Concurrency", -1)),
                  n("input", {
                    type: "number",
                    min: "1",
                    value: d.value.config?.task?.queue?.concurrencyLimit,
                    disabled: e.readonly,
                    onInput: t[18] || (t[18] = (a) => w(["task", "queue", "concurrencyLimit"], Number(a.target.value) || void 0))
                  }, null, 40, bn)
                ]),
                n("label", null, [
                  t[52] || (t[52] = n("span", null, "Attempts", -1)),
                  n("input", {
                    type: "number",
                    min: "0",
                    value: d.value.config?.task?.retry?.maxAttempts,
                    disabled: e.readonly,
                    onInput: t[19] || (t[19] = (a) => w(["task", "retry", "maxAttempts"], Number(a.target.value) || 0))
                  }, null, 40, kn)
                ])
              ]),
              n("label", null, [
                t[53] || (t[53] = n("span", null, "Idempotency key", -1)),
                n("input", {
                  value: d.value.config?.task?.idempotencyKey,
                  disabled: e.readonly,
                  onInput: t[20] || (t[20] = (a) => w(["task", "idempotencyKey"], a.target.value))
                }, null, 40, wn)
              ])
            ], 64)) : _("", !0),
            d.value.type === "manualApproval" || d.value.type === "humanReview" ? (m(), b(C, { key: 3 }, [
              n("label", null, [
                t[55] || (t[55] = n("span", null, "Assignee type", -1)),
                n("select", {
                  value: d.value.config?.approval?.assigneeType ?? "role",
                  disabled: e.readonly,
                  onChange: t[21] || (t[21] = (a) => w(["approval", "assigneeType"], a.target.value))
                }, [...t[54] || (t[54] = [
                  n("option", { value: "user" }, "User", -1),
                  n("option", { value: "role" }, "Role", -1),
                  n("option", { value: "team" }, "Team", -1),
                  n("option", { value: "expression" }, "Expression", -1)
                ])], 40, hn)
              ]),
              n("label", null, [
                t[56] || (t[56] = n("span", null, "Assignee IDs", -1)),
                n("input", {
                  value: d.value.config?.approval?.assigneeIds?.join(", "),
                  disabled: e.readonly,
                  onInput: t[22] || (t[22] = (a) => w(["approval", "assigneeIds"], a.target.value.split(",").map((h) => h.trim()).filter(Boolean)))
                }, null, 40, Sn)
              ]),
              n("label", null, [
                t[58] || (t[58] = n("span", null, "On timeout", -1)),
                n("select", {
                  value: d.value.config?.approval?.onTimeout ?? "fail",
                  disabled: e.readonly,
                  onChange: t[23] || (t[23] = (a) => w(["approval", "onTimeout"], a.target.value))
                }, [...t[57] || (t[57] = [
                  n("option", { value: "fail" }, "Fail", -1),
                  n("option", { value: "autoApprove" }, "Auto approve", -1),
                  n("option", { value: "autoReject" }, "Auto reject", -1),
                  n("option", { value: "continue" }, "Continue", -1)
                ])], 40, Tn)
              ])
            ], 64)) : _("", !0),
            d.value.type === "wait" ? (m(), b(C, { key: 4 }, [
              n("label", null, [
                t[60] || (t[60] = n("span", null, "Mode", -1)),
                n("select", {
                  value: d.value.config?.wait?.mode ?? "duration",
                  disabled: e.readonly,
                  onChange: t[24] || (t[24] = (a) => w(["wait", "mode"], a.target.value))
                }, [...t[59] || (t[59] = [
                  n("option", { value: "duration" }, "Duration", -1),
                  n("option", { value: "until" }, "Until", -1),
                  n("option", { value: "token" }, "Token", -1)
                ])], 40, xn)
              ]),
              d.value.config?.wait?.mode !== "token" && d.value.config?.wait?.mode !== "until" ? (m(), b("label", An, [
                t[61] || (t[61] = n("span", null, "Duration", -1)),
                n("input", {
                  value: d.value.config?.wait?.duration,
                  disabled: e.readonly,
                  onInput: t[25] || (t[25] = (a) => w(["wait", "duration"], a.target.value))
                }, null, 40, $n)
              ])) : _("", !0),
              d.value.config?.wait?.mode === "until" ? (m(), b("label", In, [
                t[62] || (t[62] = n("span", null, "Until", -1)),
                n("input", {
                  type: "datetime-local",
                  value: d.value.config?.wait?.until,
                  disabled: e.readonly,
                  onInput: t[26] || (t[26] = (a) => w(["wait", "until"], a.target.value))
                }, null, 40, En)
              ])) : _("", !0),
              d.value.config?.wait?.mode === "token" ? (m(), b("label", _n, [
                t[63] || (t[63] = n("span", null, "Token key", -1)),
                n("input", {
                  value: d.value.config?.wait?.tokenKey,
                  disabled: e.readonly,
                  onInput: t[27] || (t[27] = (a) => w(["wait", "tokenKey"], a.target.value))
                }, null, 40, Nn)
              ])) : _("", !0)
            ], 64)) : _("", !0),
            d.value.type === "dataSource" || d.value.type === "dataSink" || d.value.type === "batchTrigger" ? (m(), b(C, { key: 5 }, [
              n("label", null, [
                t[64] || (t[64] = n("span", null, "Connector", -1)),
                n("input", {
                  value: d.value.config?.data?.connector,
                  disabled: e.readonly,
                  onInput: t[28] || (t[28] = (a) => w(["data", "connector"], a.target.value))
                }, null, 40, Cn)
              ]),
              n("label", null, [
                t[66] || (t[66] = n("span", null, "Operation", -1)),
                n("select", {
                  value: d.value.config?.data?.operation ?? "sync",
                  disabled: e.readonly,
                  onChange: t[29] || (t[29] = (a) => w(["data", "operation"], a.target.value))
                }, [...t[65] || (t[65] = [
                  it('<option value="extract" data-v-6ab76f3f>Extract</option><option value="load" data-v-6ab76f3f>Load</option><option value="sync" data-v-6ab76f3f>Sync</option><option value="query" data-v-6ab76f3f>Query</option><option value="upsert" data-v-6ab76f3f>Upsert</option>', 5)
                ])], 40, Wn)
              ]),
              n("label", null, [
                t[67] || (t[67] = n("span", null, "Source", -1)),
                n("input", {
                  value: d.value.config?.data?.source,
                  disabled: e.readonly,
                  onInput: t[30] || (t[30] = (a) => w(["data", "source"], a.target.value))
                }, null, 40, Rn)
              ]),
              n("label", null, [
                t[68] || (t[68] = n("span", null, "Target", -1)),
                n("input", {
                  value: d.value.config?.data?.target,
                  disabled: e.readonly,
                  onInput: t[31] || (t[31] = (a) => w(["data", "target"], a.target.value))
                }, null, 40, qn)
              ])
            ], 64)) : _("", !0),
            d.value.type === "agent" ? (m(), b(C, { key: 6 }, [
              n("div", Dn, [
                n("label", null, [
                  t[70] || (t[70] = n("span", null, "Provider", -1)),
                  n("select", {
                    value: d.value.config?.ai?.provider ?? "openai",
                    disabled: e.readonly,
                    onChange: t[32] || (t[32] = (a) => w(["ai", "provider"], a.target.value))
                  }, [...t[69] || (t[69] = [
                    n("option", { value: "openai" }, "OpenAI", -1),
                    n("option", { value: "anthropic" }, "Anthropic", -1),
                    n("option", { value: "custom" }, "Custom", -1)
                  ])], 40, Mn)
                ]),
                n("label", null, [
                  t[71] || (t[71] = n("span", null, "Model", -1)),
                  n("input", {
                    value: d.value.config?.ai?.model,
                    disabled: e.readonly,
                    onInput: t[33] || (t[33] = (a) => w(["ai", "model"], a.target.value))
                  }, null, 40, On)
                ])
              ]),
              n("label", null, [
                t[72] || (t[72] = n("span", null, "System prompt", -1)),
                n("textarea", {
                  value: d.value.config?.ai?.prompt,
                  disabled: e.readonly,
                  onInput: t[34] || (t[34] = (a) => w(["ai", "prompt"], a.target.value))
                }, null, 40, Vn)
              ])
            ], 64)) : _("", !0),
            n("label", null, [
              t[73] || (t[73] = n("span", null, "Raw config", -1)),
              Ae(n("textarea", {
                "onUpdate:modelValue": t[35] || (t[35] = (a) => z.value = a),
                class: "trigger-editor__json",
                disabled: e.readonly
              }, null, 8, zn), [
                [lt, z.value]
              ])
            ]),
            V.value ? (m(), b("p", Bn, k(V.value), 1)) : _("", !0),
            n("div", Pn, [
              n("button", {
                type: "button",
                disabled: e.readonly,
                onClick: je
              }, "Apply JSON", 8, Fn),
              n("button", {
                type: "button",
                class: "trigger-editor__danger",
                disabled: e.readonly,
                onClick: ke
              }, "Delete", 8, Ln)
            ])
          ])) : A.value ? (m(), b("div", Hn, [
            n("div", Kn, [
              t[75] || (t[75] = n("span", null, "→", -1)),
              n("div", null, [
                t[74] || (t[74] = n("strong", null, "Edge", -1)),
                n("small", null, k(A.value.source) + " → " + k(A.value.target), 1)
              ])
            ]),
            n("label", null, [
              t[76] || (t[76] = n("span", null, "Label", -1)),
              n("input", {
                value: A.value.name,
                disabled: e.readonly,
                onInput: Je
              }, null, 40, Un)
            ]),
            n("label", null, [
              t[78] || (t[78] = n("span", null, "Condition", -1)),
              Ae(n("select", {
                "onUpdate:modelValue": t[36] || (t[36] = (a) => me.value = a),
                disabled: e.readonly
              }, [...t[77] || (t[77] = [
                n("option", { value: "always" }, "Always", -1),
                n("option", { value: "field" }, "Field", -1),
                n("option", { value: "expression" }, "Expression", -1)
              ])], 8, jn), [
                [st, me.value]
              ])
            ]),
            A.value.condition?.type === "field" ? (m(), b(C, { key: 0 }, [
              n("label", null, [
                t[79] || (t[79] = n("span", null, "Field", -1)),
                n("input", {
                  value: A.value.condition.field,
                  disabled: e.readonly,
                  onInput: t[37] || (t[37] = (a) => X("field", a.target.value))
                }, null, 40, Jn)
              ]),
              n("label", null, [
                t[80] || (t[80] = n("span", null, "Operator", -1)),
                n("select", {
                  value: A.value.condition.operator,
                  disabled: e.readonly,
                  onChange: t[38] || (t[38] = (a) => X("operator", a.target.value))
                }, [
                  (m(), b(C, null, j(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in"], (a) => n("option", { key: a }, k(a), 1)), 64))
                ], 40, Gn)
              ]),
              n("label", null, [
                t[81] || (t[81] = n("span", null, "Value", -1)),
                n("input", {
                  value: A.value.condition.value,
                  disabled: e.readonly,
                  onInput: t[39] || (t[39] = (a) => X("value", a.target.value))
                }, null, 40, Qn)
              ])
            ], 64)) : _("", !0),
            A.value.condition?.type === "expression" ? (m(), b("label", Yn, [
              t[82] || (t[82] = n("span", null, "Expression", -1)),
              n("textarea", {
                value: A.value.condition.expression,
                disabled: e.readonly,
                onInput: t[40] || (t[40] = (a) => X("expression", a.target.value))
              }, null, 40, Xn)
            ])) : _("", !0),
            n("button", {
              type: "button",
              class: "trigger-editor__danger",
              disabled: e.readonly,
              onClick: ke
            }, "Delete edge", 8, Zn)
          ])) : (m(), b("div", eo, [
            n("div", to, [
              t[83] || (t[83] = n("strong", null, "Validation", -1)),
              n("span", null, k(Q.value.length), 1)
            ]),
            n("ul", null, [
              (m(!0), b(C, null, j(Q.value, (a) => (m(), b("li", {
                key: `${a.path}-${a.message}`,
                class: P({ "trigger-editor__issue--error": a.level === "error" })
              }, [
                n("span", null, k(a.path), 1),
                n("strong", null, k(a.message), 1)
              ], 2))), 128))
            ])
          ]))
        ])
      ])
    ], 4));
  }
}), io = /* @__PURE__ */ qe(no, [["__scopeId", "data-v-6ab76f3f"]]);
export {
  J as TRIGGER_WORKFLOW_SCHEMA_VERSION,
  vt as TriggerFlowNode,
  io as TriggerWorkflowEditor,
  _t as TriggerWorkflowValidationError,
  Nt as assertValidTriggerWorkflow,
  xt as cloneTriggerWorkflow,
  Rt as compileTriggerWorkflow,
  Ve as createAiAgentTriggerWorkflow,
  ve as createApprovalTriggerWorkflow,
  Oe as createDataSyncTriggerWorkflow,
  ge as getTriggerNodeDefinition,
  mt as getTriggerNodeDefinitionsForKind,
  yt as isBuiltInTriggerNodeType,
  M as isRecord,
  L as normalizeTriggerWorkflow,
  Me as triggerNodeDefinitionMap,
  De as triggerNodeDefinitions,
  ro as triggerWorkflowTemplates,
  fe as validateTriggerWorkflow
};
