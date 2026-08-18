import type { AiRunRequest, AiStreamEvent } from '../types/ai';

type StreamOptions = {
  signal?: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
};

type SseFrame = { id?: string; event?: string; data?: string };

export function parseSseFrames(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const frames = normalized.split('\n\n');
  const remainder = frames.pop() ?? '';
  const parsed: SseFrame[] = [];
  for (const frame of frames) {
    const result: SseFrame = {};
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const separator = line.indexOf(':');
      const field = separator >= 0 ? line.slice(0, separator) : line;
      const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : '';
      if (field === 'id') result.id = value;
      if (field === 'event') result.event = value;
      if (field === 'data') data.push(value);
    }
    if (data.length) result.data = data.join('\n');
    if (result.data) parsed.push(result);
  }
  return { frames: parsed, remainder };
}

export function useAiStream() {
  const { requestRaw } = useAuthenticatedFetch();

  async function consume(response: Response, options: StreamOptions) {
    if (!response.body) throw new Error('AI stream response has no body.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastEvent: AiStreamEvent | undefined;
    let completed = false;
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parsed = parseSseFrames(buffer);
      buffer = parsed.remainder;
      for (const frame of parsed.frames) {
        const event = JSON.parse(frame.data ?? '{}') as AiStreamEvent;
        lastEvent = event;
        options.onEvent(event);
        if (event.type === 'done') completed = true;
      }
      if (done) break;
    }
    if (!completed) throw new Error('AI stream ended before the run completed.');
    return lastEvent;
  }

  async function start(
    input: AiRunRequest,
    options: StreamOptions & { requestId?: string }
  ) {
    const requestId = options.requestId ??
      `ai-${typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`;
    const response = await requestRaw('/api/ai/runs/stream', {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'X-Request-Id': requestId
      },
      body: input,
      signal: options.signal
    });
    try {
      return { lastEvent: await consume(response, options), requestId };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw error;
    }
  }

  async function resume(runId: string, afterSequence: number, options: StreamOptions) {
    const response = await requestRaw(`/api/ai/runs/${encodeURIComponent(runId)}/events`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Last-Event-ID': `${runId}:${afterSequence}`
      },
      signal: options.signal
    });
    return consume(response, options);
  }

  return { start, resume };
}
