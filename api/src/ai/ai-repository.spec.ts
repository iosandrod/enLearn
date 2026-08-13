import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { aiRepositoryInternals } from './ai.repository';

assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(undefined), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(''), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode('DATABASE'), 'database');
assert.equal(aiRepositoryInternals.resolveAiPersistenceMode(' memory '), 'memory');
assert.throws(
  () => aiRepositoryInternals.resolveAiPersistenceMode('automatic'),
  /Unsupported AI_PERSISTENCE_MODE/
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
