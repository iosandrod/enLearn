import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createMesE2eDatabase,
  createMesE2eFixture,
  releaseMesE2eWorkOrder
} from './mes-e2e-fixture';

const PASSWORD_ARTIFACT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../artifacts/.mes-e2e-password.dpapi'
);

async function writeProtectedPassword(password: string) {
  if (process.platform !== 'win32') {
    throw new Error('MES E2E credential protection currently requires Windows DPAPI.');
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$plainText = [Console]::In.ReadToEnd()',
    '$plainBytes = [Text.Encoding]::UTF8.GetBytes($plainText)',
    '$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
    '$protected = [System.Security.Cryptography.ProtectedData]::Protect($plainBytes, $null, $scope)',
    '[Array]::Clear($plainBytes, 0, $plainBytes.Length)',
    '$destination = $env:ENLEARN_MES_E2E_PASSWORD_ARTIFACT',
    '$directory = [IO.Path]::GetDirectoryName($destination)',
    '[IO.Directory]::CreateDirectory($directory) | Out-Null',
    '[IO.File]::WriteAllBytes($destination, $protected)',
  ].join('; ');

  await new Promise<void>((resolveProcess, rejectProcess) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        env: {
          ...process.env,
          ENLEARN_MES_E2E_PASSWORD_ARTIFACT: PASSWORD_ARTIFACT,
        },
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true,
      },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', rejectProcess);
    child.on('close', (code) => {
      if (code === 0) resolveProcess();
      else rejectProcess(new Error(stderr.trim() || `DPAPI protection failed with exit code ${code}.`));
    });
    child.stdin.end(password, 'utf8');
  });
}

async function main() {
  const database = await createMesE2eDatabase();
  try {
    const fixture = await createMesE2eFixture(database);
    const workOrder = await releaseMesE2eWorkOrder(database, fixture);
    await writeProtectedPassword(fixture.password);
    console.log(JSON.stringify({
      accountId: fixture.accountId,
      email: fixture.email,
      operationPlanId: fixture.operationPlanId,
      workOrderId: workOrder.workOrderId,
      workOrderNo: workOrder.workOrderNo,
      passwordFingerprint: createHash('sha256').update(fixture.password).digest('hex').slice(0, 12)
    }));
  } finally {
    await database.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
