import { TriggerCredentialsService } from '../src/workflow/trigger/trigger-credentials.service';

async function main() {
  const service = new TriggerCredentialsService();
  try {
    const first = await service.getCredentials();
    const second = await service.getCredentials();
    console.log(
      JSON.stringify(
        {
          accessTokenPrefix: first.accessToken.slice(0, 7),
          adminEmail: first.adminEmail,
          cacheHit: first === second,
          projectName: first.projectName,
          projectRefPrefix: first.projectRef.slice(0, 8),
          secretKeyPrefix: first.secretKey.slice(0, 7),
          selection: first.selection,
          source: first.source
        },
        null,
        2
      )
    );
  } finally {
    await service.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
