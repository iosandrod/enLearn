import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';

async function main() {
  process.env.NO_COLOR = '1';
  const service = new TriggerCredentialsService();
  try {
    const credentials = await service.getCredentials();
    process.stdout.write(
      JSON.stringify({
        accessToken: credentials.accessToken,
        projectRef: credentials.projectRef
      })
    );
  } finally {
    await service.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
