import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Logger,
  Post,
  Req
} from '@nestjs/common';
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';

import { createSupabaseClient, getCurrentUser } from '../common/utils/supabase';

type VisitorRecordBody = {
  visitorId?: unknown;
  sessionId?: unknown;
  pagePath?: unknown;
  pageUrl?: unknown;
  referrer?: unknown;
  language?: unknown;
  timezone?: unknown;
  screenWidth?: unknown;
  screenHeight?: unknown;
};

type HttpRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readLimitedText(value: unknown, maximumLength: number) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maximumLength)
    : null;
}

function readUuid(value: unknown) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : randomUUID();
}

function readScreenDimension(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000
    ? value
    : null;
}

function readHeader(request: HttpRequest, name: string) {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeIpAddress(value: string | undefined) {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith('::ffff:')) candidate = candidate.slice(7);
  if (candidate.startsWith('[')) {
    const end = candidate.indexOf(']');
    if (end > 0) candidate = candidate.slice(1, end);
  }
  return isIP(candidate) ? candidate : null;
}

export function resolveVisitorIp(request: HttpRequest) {
  const forwardedFor = readHeader(request, 'x-forwarded-for')?.split(',')[0]?.trim();
  const candidates = [
    readHeader(request, 'cf-connecting-ip'),
    readHeader(request, 'x-real-ip'),
    forwardedFor,
    request.ip,
    request.socket?.remoteAddress
  ];
  for (const candidate of candidates) {
    const address = normalizeIpAddress(candidate);
    if (address) return address;
  }
  return null;
}

@Controller('visitor-records')
export class VisitorRecordsController {
  private readonly logger = new Logger(VisitorRecordsController.name);

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: VisitorRecordBody,
    @Req() request: HttpRequest,
    @Headers('authorization') authorization?: string,
    @Headers('user-agent') userAgent?: string
  ) {
    const pagePath = readLimitedText(body?.pagePath, 500);
    if (!pagePath || !pagePath.startsWith('/')) {
      throw new BadRequestException('pagePath must be an absolute application path.');
    }

    let userId: string | null = null;
    if (authorization?.trim()) {
      try {
        const currentUser = await getCurrentUser({ authorization });
        userId = currentUser.user.id;
      } catch {
        // Analytics must not interrupt a public page visit when a stale token is present.
      }
    }

    const client = createSupabaseClient('admin');
    const { data, error } = await client
      .from('visitor_records')
      .insert({
        visitor_id: readUuid(body?.visitorId),
        session_id: readUuid(body?.sessionId),
        user_id: userId,
        ip_address: resolveVisitorIp(request),
        page_path: pagePath,
        page_url: readLimitedText(body?.pageUrl, 2_000),
        referrer: readLimitedText(body?.referrer, 2_000),
        user_agent: readLimitedText(userAgent, 1_000),
        language: readLimitedText(body?.language, 50),
        timezone: readLimitedText(body?.timezone, 100),
        screen_width: readScreenDimension(body?.screenWidth),
        screen_height: readScreenDimension(body?.screenHeight)
      })
      .select('id, visitor_id, session_id, visited_at')
      .single();

    if (error || !data) {
      this.logger.error(`Failed to save visitor record: ${error?.message || 'empty response'}`);
      throw new InternalServerErrorException('Failed to save visitor record.');
    }

    return {
      success: true,
      data: {
        id: data.id,
        visitorId: data.visitor_id,
        sessionId: data.session_id,
        visitedAt: data.visited_at
      }
    };
  }
}
