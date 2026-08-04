import { BadRequestException } from '@nestjs/common';

import type { SaveWorkflowModelDto } from './definition/definition.dto';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function normalizeWorkflowDraftSchema(dto: SaveWorkflowModelDto) {
  const schema = { ...dto.schema };

  return {
    schemaVersion: typeof schema.schemaVersion === 'number' ? schema.schemaVersion : 1,
    ...schema,
    code: readString(schema.code, dto.code),
    name: readString(schema.name, dto.name),
    ...(dto.documentType ? { documentType: dto.documentType } : {})
  };
}

export function validateWorkflowDraftSchema(
  schema: Record<string, unknown>,
  strict: boolean
) {
  const nodes = Array.isArray(schema.nodes) ? schema.nodes : [];
  const edges = Array.isArray(schema.edges) ? schema.edges : [];

  if (!readString(schema.code)) {
    throw new BadRequestException('Workflow schema code is required.');
  }
  if (!readString(schema.name)) {
    throw new BadRequestException('Workflow schema name is required.');
  }
  if (!nodes.length) {
    throw new BadRequestException('Workflow schema requires nodes.');
  }
  if (!edges.length) {
    throw new BadRequestException('Workflow schema requires edges.');
  }
  if (!strict) return;

  const nodeIds = new Set<string>();
  const nodeTypes = new Map<string, string>();

  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      throw new BadRequestException(`Node at index ${index} must be an object.`);
    }

    const id = readString(node.id);
    const type = readString(node.type);
    if (!id) {
      throw new BadRequestException(`Node at index ${index} requires id.`);
    }
    if (nodeIds.has(id)) {
      throw new BadRequestException(`Duplicate node id "${id}".`);
    }

    nodeIds.add(id);
    nodeTypes.set(id, type);

    if (type === 'approval' || type === 'sign' || type === 'orSign') {
      const config = isRecord(node.config) ? node.config : {};
      if (!isRecord(config.assigneeStrategy)) {
        throw new BadRequestException(`${type} node "${id}" requires assigneeStrategy.`);
      }
    }
  });

  const startCount = Array.from(nodeTypes.values()).filter((type) => type === 'start').length;
  const endCount = Array.from(nodeTypes.values()).filter((type) => type === 'end').length;
  if (startCount !== 1) {
    throw new BadRequestException('Workflow schema must contain exactly one start node.');
  }
  if (!endCount) {
    throw new BadRequestException('Workflow schema must contain at least one end node.');
  }

  edges.forEach((edge, index) => {
    if (!isRecord(edge)) {
      throw new BadRequestException(`Edge at index ${index} must be an object.`);
    }

    const source = readString(edge.source);
    const target = readString(edge.target);
    if (!nodeIds.has(source)) {
      throw new BadRequestException(`Edge source "${source}" does not exist.`);
    }
    if (!nodeIds.has(target)) {
      throw new BadRequestException(`Edge target "${target}" does not exist.`);
    }
  });
}
