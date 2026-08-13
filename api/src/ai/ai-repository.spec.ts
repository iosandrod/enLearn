import assert from 'node:assert/strict';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { aiRepositoryInternals } from './ai.repository';

assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(undefined), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(''), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode('DATABASE'), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(' memory '), 'memory');
assert.throws(
  () => aiRepositoryInternals.resolveAiPersistenceMode('automatic'),
  /Unsupported AI_PERSISTENCE_MODE/
);
assert.deepEqual(
  aiRepositoryInternals.assertPersistedRow({ id: 'row-1' }, null, 'missing'),
  { id: 'row-1' }
);
assert.throws(
  () => aiRepositoryInternals.assertPersistedRow(null, null, 'AI run was not found.'),
  (error: unknown) => error instanceof NotFoundException && /AI run was not found/.test(error.message)
);
assert.throws(
  () => aiRepositoryInternals.assertPersistedRow(null, { code: '42P01' }, 'missing'),
  (error: unknown) => error instanceof ServiceUnavailableException
);

assert.equal(aiRepositoryInternals.isMissingAiSchema({ code: '42P01' }), true);
assert.equal(aiRepositoryInternals.isMissingAiSchema({ code: 'PGRST205' }), true);
assert.equal(
  aiRepositoryInternals.isMissingAiSchema({ message: 'relation ai_conversations does not exist' }),
  true
);
assert.equal(aiRepositoryInternals.assertAiSchemaAvailable({ code: '23505' }), false);
assert.throws(
  () => aiRepositoryInternals.assertAiSchemaAvailable({ code: '42P01' }),
  (error: unknown) => error instanceof ServiceUnavailableException &&
    /AI persistence schema is not installed/.test(error.message)
);

console.log('AI repository persistence-mode tests passed');
