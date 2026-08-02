import { BadRequestException } from '@nestjs/common';
import {
  LowCodeSchemaValidationError,
  assertValidLowCodePageSchema,
  isRecord,
  migrateLowCodePageSchema,
  type LowCodePageSchema
} from './lowcode.schema';
import type { LowCodePageOpenType, LowCodePageRelations, LowCodePageRow } from './lowcode.types';

export function normalizeSchema(value: unknown, shouldValidate = false): LowCodePageSchema {
  try {
    const schema = migrateLowCodePageSchema(value);
    if (shouldValidate) assertValidLowCodePageSchema(schema);
    return schema;
  } catch (error) {
    if (error instanceof LowCodeSchemaValidationError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export function normalizePageRow(row: LowCodePageRow, relations?: LowCodePageRelations) {
  return {
    ...row,
    schema: normalizeSchema(row.schema),
    ...(relations ? { relations } : {})
  };
}

export function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeOpenType(value: unknown): LowCodePageOpenType {
  return value === 'drawer' || value === 'modal' || value === 'page' ? value : 'page';
}

export function normalizeActionKey(value: unknown, fallback = 'edit') {
  return readString(value, fallback);
}

export function readMetadata(value: unknown) {
  return isRecord(value) ? value : {};
}

export function asRows(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function normalizeGeneratedStatus(value: unknown): 'draft' | 'published' | 'archived' {
  return value === 'draft' || value === 'archived' ? value : 'published';
}
