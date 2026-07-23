import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  ServiceContext,
  ServiceExecutor
} from '../common/interfaces/service-executor';
import { requireAdmin } from '../common/utils/supabase';

type LowCodePageSchema = {
  code: string;
  route: string;
  title: string;
  description?: string;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: 'draft' | 'published' | 'archived';
  keepAlive?: boolean;
  visualEditor?: Record<string, unknown>;
  config?: {
    bgColor?: string;
    bgImage?: string;
  };
  dataSources?: Record<
    string,
    {
      key: string;
      label?: string;
      serviceName: string;
      serviceMethod: string;
      saveMethod?: string;
      deleteMethod?: string;
      postData?: Record<string, unknown>;
      autoLoad?: boolean;
    }
  >;
  blocks: Array<Record<string, unknown>>;
};

type LowCodePageRow = {
  id: string;
  code: string;
  route: string;
  title: string;
  description: string | null;
  layout: 'default' | 'dashboard' | 'blank';
  status: 'draft' | 'published' | 'archived';
  keep_alive: boolean;
  schema: LowCodePageSchema;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSchema(value: unknown): LowCodePageSchema {
  if (!isRecord(value)) {
    throw new BadRequestException('schema must be an object.');
  }

  const code = typeof value.code === 'string' ? value.code.trim() : '';
  const route = typeof value.route === 'string' ? value.route.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';

  if (!code || !route || !title) {
    throw new BadRequestException('schema.code, schema.route and schema.title are required.');
  }

  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  const dataSources = isRecord(value.dataSources) ? value.dataSources : {};

  return {
    code,
    route,
    title,
    description:
      typeof value.description === 'string' && value.description.trim()
        ? value.description.trim()
        : undefined,
    layout:
      value.layout === 'default' || value.layout === 'dashboard' || value.layout === 'blank'
        ? value.layout
        : 'dashboard',
    status:
      value.status === 'draft' || value.status === 'published' || value.status === 'archived'
        ? value.status
        : 'draft',
    keepAlive: value.keepAlive !== false,
    visualEditor: isRecord(value.visualEditor) ? value.visualEditor : undefined,
    config: isRecord(value.config)
      ? {
          bgColor:
            typeof value.config.bgColor === 'string' ? value.config.bgColor : undefined,
          bgImage:
            typeof value.config.bgImage === 'string' ? value.config.bgImage : undefined
        }
      : undefined,
    dataSources: Object.fromEntries(
      Object.entries(dataSources).map(([key, source]) => {
        if (!isRecord(source)) {
          throw new BadRequestException(`dataSources.${key} must be an object.`);
        }

        const sourceKey = typeof source.key === 'string' && source.key.trim() ? source.key.trim() : key;
        const serviceName =
          typeof source.serviceName === 'string' && source.serviceName.trim()
            ? source.serviceName.trim()
            : '';
        const serviceMethod =
          typeof source.serviceMethod === 'string' && source.serviceMethod.trim()
            ? source.serviceMethod.trim()
            : '';

        if (!serviceName || !serviceMethod) {
          throw new BadRequestException(
            `dataSources.${key}.serviceName and serviceMethod are required.`
          );
        }

        return [
          key,
          {
            key: sourceKey,
            label: typeof source.label === 'string' ? source.label : undefined,
            serviceName,
            serviceMethod,
            saveMethod:
              typeof source.saveMethod === 'string' && source.saveMethod.trim()
                ? source.saveMethod.trim()
                : undefined,
            deleteMethod:
              typeof source.deleteMethod === 'string' && source.deleteMethod.trim()
                ? source.deleteMethod.trim()
                : undefined,
            postData: isRecord(source.postData) ? source.postData : undefined,
            autoLoad: source.autoLoad !== false
          }
        ];
      })
    ),
    blocks: blocks
  };
}

function normalizePageRow(row: LowCodePageRow) {
  return {
    ...row,
    schema: normalizeSchema(row.schema)
  };
}

@Injectable()
export class LowCodeService implements ServiceExecutor {
  async execute(method: string, postData: Record<string, unknown>, context: ServiceContext) {
    switch (method) {
      case 'listPages':
        return this.listPages(context);
      case 'getPage':
        return this.getPage(postData, context);
      case 'savePage':
        return this.savePage(postData, context);
      case 'publishPage':
        return this.publishPage(postData, context);
      case 'archivePage':
        return this.archivePage(postData, context);
      default:
        throw new BadRequestException(`Unsupported lowcode method: ${method}`);
    }
  }

  private async listPages(context: ServiceContext) {
    const { client } = await requireAdmin(context);
    const { data, error } = await client
      .from('lowcode_pages')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((row) => normalizePageRow(row as LowCodePageRow));
  }

  private async getPage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client } = await requireAdmin(context);
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';
    const route = typeof postData.route === 'string' ? postData.route.trim() : '';
    const includeData = postData.includeData !== false;

    if (!code && !route) {
      throw new BadRequestException('code or route is required.');
    }

    let query = client.from('lowcode_pages').select('*');

    if (code) {
      query = query.eq('code', code);
    } else {
      query = query.eq('route', route);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Low-code page not found.');
    }

    const page = normalizePageRow(data as LowCodePageRow);
    return {
      ...page,
      resolvedData: includeData ? {} : {}
    };
  }

  private async savePage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await requireAdmin(context);
    const schema = normalizeSchema(postData.schema ?? postData);
    const existingCode = typeof postData.code === 'string' ? postData.code.trim() : schema.code;

    if (!existingCode) {
      throw new BadRequestException('code is required.');
    }

    const { data: existing, error: lookupError } = await client
      .from('lowcode_pages')
      .select('*')
      .eq('code', existingCode)
      .maybeSingle();

    if (lookupError) {
      throw new BadRequestException(lookupError.message);
    }

    const nextVersion = (existing?.version ?? 0) + 1;
    const pagePayload = {
      code: schema.code,
      route: schema.route,
      title: schema.title,
      description: schema.description ?? null,
      layout: schema.layout ?? 'dashboard',
      status: schema.status ?? 'draft',
      keep_alive: schema.keepAlive ?? true,
      schema: schema as unknown as Record<string, unknown>,
      version: nextVersion,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      published_at: schema.status === 'published' ? new Date().toISOString() : existing?.published_at ?? null
    };

    let savedPage: LowCodePageRow | null = null;

    if (existing) {
      const { data, error } = await client
        .from('lowcode_pages')
        .update(pagePayload)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedPage = data as LowCodePageRow;
    } else {
      const { data, error } = await client
        .from('lowcode_pages')
        .insert({
          ...pagePayload,
          created_by: user.id
        })
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedPage = data as LowCodePageRow;
    }

    const { error: versionError } = await client.from('lowcode_page_versions').insert({
      page_id: savedPage.id,
      version: nextVersion,
      schema: schema as unknown as Record<string, unknown>,
      created_by: user.id,
      published_at: schema.status === 'published' ? new Date().toISOString() : null
    });

    if (versionError) {
      throw new BadRequestException(versionError.message);
    }

    return normalizePageRow(savedPage);
  }

  private async publishPage(postData: Record<string, unknown>, context: ServiceContext) {
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';
    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const saved = await this.savePage(
      {
        code,
        schema: {
          ...(isRecord(postData.schema) ? postData.schema : {}),
          code,
          status: 'published'
        }
      },
      context
    );

    return {
      success: true,
      page: saved
    };
  }

  private async archivePage(postData: Record<string, unknown>, context: ServiceContext) {
    const { client, user } = await requireAdmin(context);
    const code = typeof postData.code === 'string' ? postData.code.trim() : '';

    if (!code) {
      throw new BadRequestException('code is required.');
    }

    const { data: existing, error: lookupError } = await client
      .from('lowcode_pages')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (lookupError) {
      throw new BadRequestException(lookupError.message);
    }

    if (!existing) {
      throw new NotFoundException('Low-code page not found.');
    }

    const { data, error } = await client
      .from('lowcode_pages')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return normalizePageRow(data as LowCodePageRow);
  }

}
