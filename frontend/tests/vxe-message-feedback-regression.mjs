import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRoot = resolve(frontendRoot, '..');
const sourceRoots = [
  join(frontendRoot, 'components'),
  join(frontendRoot, 'layouts'),
  join(frontendRoot, 'pages'),
  join(repositoryRoot, 'packages', 'lowcode-framework', 'src'),
  join(repositoryRoot, 'packages', 'tldraw-vue', 'src', 'components'),
  join(repositoryRoot, 'packages', 'chat-widget', 'src'),
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return nested.flat().filter((path) => ['.ts', '.tsx', '.vue'].includes(extname(path)));
}

const helper = await readFile(
  join(repositoryRoot, 'packages', 'lowcode-framework', 'src', 'utils', 'vxe-message.ts'),
  'utf8',
);
assert.match(helper, /VxeUI\.modal\.message\(/);

const printDesigner = await readFile(
  join(frontendRoot, 'pages', 'dashboard', 'print', 'lowcode-designer.vue'),
  'utf8',
);
assert.match(printDesigner, /import \{ useVxeMessage \} from ['"]~\/composables\/useVxeMessage['"]/);

const lowCodeFormPanel = await readFile(
  join(repositoryRoot, 'packages', 'tldraw-vue', 'src', 'components', 'LowCodeFormPanel.vue'),
  'utf8',
);
assert.ok(
  lowCodeFormPanel.indexOf("useVxeMessage(displayedFormError, 'error')")
    > lowCodeFormPanel.indexOf('const fallbackDescriptor'),
  'The displayed form error watcher must be registered after its descriptor dependencies are initialized.',
);

const forbiddenBindings = [
  'errorMessage',
  'successMessage',
  'formDefinitionError',
  'templateError',
  'printPreviewError',
  'conversationError',
  'messageError',
  'runtimeMonitorErrorText',
];

for (const file of (await Promise.all(sourceRoots.map(sourceFiles))).flat()) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /VxeUI\.modal\.alert\(/, `${file} still uses a blocking alert for feedback.`);
  for (const binding of forbiddenBindings) {
    assert.doesNotMatch(
      source,
      new RegExp(`\\{\\{\\s*${binding}\\s*\\}\\}`),
      `${file} still renders ${binding} inline.`,
    );
  }
}

console.log('VXE message feedback regression test passed.');
