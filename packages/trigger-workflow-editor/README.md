# @enlearn/trigger-workflow-editor

Vue 3 visual workflow editor and compiler for Trigger.dev-oriented orchestration.

The package focuses on three workflow families:

- Approval workflows with conditions, human approval, review, timeout, and waitpoint semantics.
- Data synchronization workflows with schedules, connectors, transforms, queues, batches, and retries.
- AI Agent workflows with memory, agent tasks, tools, parallel branches, and human review.

## Install

```bash
pnpm add @enlearn/trigger-workflow-editor @vue-flow/core
```

`vue` is a peer dependency.

## Use the editor

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  TriggerWorkflowEditor,
  createApprovalTriggerWorkflow,
  type TriggerWorkflowModel
} from '@enlearn/trigger-workflow-editor';
import '@enlearn/trigger-workflow-editor/style.css';

const workflow = ref<TriggerWorkflowModel>(createApprovalTriggerWorkflow());
</script>

<template>
  <TriggerWorkflowEditor
    v-model="workflow"
    height="760px"
    @compile="plan => console.log(plan)"
  />
</template>
```

For SSR applications, render the editor on the client because the canvas depends on browser APIs.

## Compile without the UI

```ts
import {
  assertValidTriggerWorkflow,
  compileTriggerWorkflow,
  createDataSyncTriggerWorkflow
} from '@enlearn/trigger-workflow-editor';

const workflow = createDataSyncTriggerWorkflow();
assertValidTriggerWorkflow(workflow);

const plan = compileTriggerWorkflow(workflow);
```

The compiler returns a framework-neutral execution plan instead of importing `@trigger.dev/sdk` directly. This keeps saved workflows stable while the backend adapter chooses the installed Trigger.dev SDK version.

## Execution plan contract

Important operation types include:

| Operation | Backend responsibility |
| --- | --- |
| `schedule` | Register or reconcile a scheduled task. |
| `task.trigger` | Trigger a task and continue according to orchestration policy. |
| `task.triggerAndWait` | Trigger a child task and wait for its result. |
| `task.batchTriggerAndWait` | Run a batch and join its results. |
| `wait.for` / `wait.until` | Pause until a duration or date. |
| `wait.forToken` | Pause for an external event or approval token. |
| `human.approval` | Create approval state, notify assignees, and resume through a token. |
| `parallel` | Fan out branches and join them before downstream nodes. |
| `condition` | Evaluate edge conditions and choose matching branches. |
| `ai.agent` | Invoke an agent task with model, prompt, tool, memory, and review settings. |

Task IDs are references into a backend-owned registry. Do not execute arbitrary import paths or code from workflow JSON.

## Backend adapter boundary

The recommended runtime boundary is:

```ts
type TaskRegistry = Record<string, {
  trigger(payload: unknown, options?: Record<string, unknown>): Promise<unknown>;
  triggerAndWait(payload: unknown, options?: Record<string, unknown>): Promise<unknown>;
  batchTriggerAndWait?(
    items: Array<{ payload: unknown; options?: Record<string, unknown> }>
  ): Promise<unknown>;
}>;
```

The adapter should also own:

- Payload and task-output expression resolution.
- Task allowlists and authorization.
- Idempotency keys, queue configuration, retries, and concurrency.
- Approval records, audit logs, notifications, timeout policies, and waitpoint tokens.
- Secrets and connector credentials.
- Workflow versioning and immutable run snapshots.

## Package scripts

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` emits ESM, bundled editor CSS, and declarations into `dist/`.
