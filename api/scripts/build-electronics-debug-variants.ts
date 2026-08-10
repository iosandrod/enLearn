import { readFile, writeFile } from 'node:fs/promises';

const outputs: Record<string, string> = {
  'RT-PCBA-100': 'OP-PCBA-070-FCT',
  'RT-PWR-100': 'OP-PWR-020-TEST',
  'RT-CASE-100': 'OP-CASE-010-ASSY',
  'RT-FG-CTRL-100': 'OP-FG-040-PACK'
};

async function main() {
  const input = JSON.parse(await readFile('../artifacts/electronics-frepple-request.json', 'utf8'));
  const outputSteps = new Set(Object.values(outputs));
  for (const variant of ['keep-explicit', 'implicit-only', 'parent-explicit'] as const) {
    const model = structuredClone(input.model);
    for (const operation of model.operations) {
      const isRoute = operation.type === 'operation_routing';
      const isOutputStep = outputSteps.has(operation.name);
      if (!isRoute && !isOutputStep) delete operation.item;
      if (variant === 'implicit-only' && isOutputStep) {
        operation.flows = (operation.flows ?? []).filter((flow: any) => !(flow.quantity > 0));
      }
      if (variant === 'parent-explicit') {
        if (!isRoute) delete operation.item;
        if (isOutputStep) {
          const parent = Object.entries(outputs).find(([, step]) => step === operation.name)?.[0];
          const positive = (operation.flows ?? []).filter((flow: any) => flow.quantity > 0);
          operation.flows = (operation.flows ?? []).filter((flow: any) => !(flow.quantity > 0));
          const route = model.operations.find((candidate: any) => candidate.name === parent);
          route.flows = [...(route.flows ?? []), ...positive];
        }
      }
    }
    await writeFile(`../artifacts/electronics-model-${variant}.json`, JSON.stringify(model));
  }
  await writeFile('../artifacts/electronics-request-bridge-debug.json', JSON.stringify({
    bucketDates: input.bucketDates,
    bucketizedResources: input.bucketizedResources,
    parameters: input.parameters
  }));
}

void main();
