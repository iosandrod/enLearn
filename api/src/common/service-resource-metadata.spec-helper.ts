import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ResourceConfigMap } from './base.service';

const migrationPath = resolve(
  process.cwd(),
  '../supabase/migrations/20260916190000_service_resource_metadata.sql'
);

let cached: Record<string, ResourceConfigMap> | undefined;

export function readMigratedResourceMetadata() {
  if (cached) return cached;

  const sql = readFileSync(migrationPath, 'utf8');
  const services: Record<string, ResourceConfigMap> = {};
  const rowPattern = /^  \('((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)', 1, '((?:''|[^'])*)'::jsonb, true\)[,;]?$/gm;
  for (const match of sql.matchAll(rowPattern)) {
    const serviceName = match[1].replaceAll("''", "'");
    const resourceName = match[2].replaceAll("''", "'");
    const tableName = match[3].replaceAll("''", "'");
    const config = JSON.parse(match[4].replaceAll("''", "'"));
    if (config.tableName !== tableName) {
      throw new Error(`Inconsistent migrated metadata for ${serviceName}.${resourceName}.`);
    }
    (services[serviceName] ??= {})[resourceName] = config;
  }
  cached = services;
  return services;
}

export function readServiceResourceMetadata(serviceName: string) {
  const resources = readMigratedResourceMetadata()[serviceName];
  if (!resources) throw new Error(`No migrated resource metadata for service ${serviceName}.`);
  return resources;
}
