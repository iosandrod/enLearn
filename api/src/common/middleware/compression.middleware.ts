import {
  brotliCompress,
  constants,
  deflate,
  gzip,
  type BrotliOptions,
  type ZlibOptions
} from 'node:zlib';

const MIN_COMPRESS_BYTES = 1024;

type CompressionEncoding = 'br' | 'gzip' | 'deflate';
type CompressionCallback = (error: Error | null, result: Buffer) => void;

function readAcceptEncoding(value: unknown) {
  if (Array.isArray(value)) return value.join(',');
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function selectCompressionEncoding(value: unknown): CompressionEncoding | null {
  const acceptEncoding = readAcceptEncoding(value);
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  if (acceptEncoding.includes('deflate')) return 'deflate';
  return null;
}

function shouldCompressContentType(value: unknown) {
  const contentType = Array.isArray(value) ? value.join(';') : String(value ?? '');

  return (
    contentType.includes('application/json') ||
    contentType.includes('application/javascript') ||
    contentType.includes('text/') ||
    contentType.includes('image/svg+xml') ||
    contentType.includes('application/xml')
  );
}

function compressBody(
  encoding: CompressionEncoding,
  body: Buffer,
  callback: CompressionCallback
) {
  if (encoding === 'br') {
    const options: BrotliOptions = {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 4
      }
    };
    brotliCompress(body, options, callback);
    return;
  }

  const options: ZlibOptions = { level: 6 };
  if (encoding === 'gzip') {
    gzip(body, options, callback);
    return;
  }

  deflate(body, options, callback);
}

export function responseCompressionMiddleware(req: any, res: any, next: () => void) {
  const encoding = selectCompressionEncoding(req.headers?.['accept-encoding']);

  if (!encoding || req.method === 'HEAD') {
    next();
    return;
  }

  const chunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = (chunk: unknown, chunkEncoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (chunk) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk), typeof chunkEncoding === 'string' ? chunkEncoding : undefined)
      );
    }

    const writeCallback = typeof chunkEncoding === 'function' ? chunkEncoding : callback;
    writeCallback?.();
    return true;
  };

  res.end = (chunk?: unknown, chunkEncoding?: BufferEncoding | (() => void), callback?: () => void) => {
    if (chunk) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(String(chunk), typeof chunkEncoding === 'string' ? chunkEncoding : undefined)
      );
    }

    const endCallback = typeof chunkEncoding === 'function' ? chunkEncoding : callback;
    const body = Buffer.concat(chunks);
    const contentType = res.getHeader?.('content-type');
    const shouldCompress =
      body.length >= MIN_COMPRESS_BYTES &&
      res.statusCode >= 200 &&
      res.statusCode !== 204 &&
      res.statusCode !== 304 &&
      !res.getHeader?.('content-encoding') &&
      shouldCompressContentType(contentType);

    if (!shouldCompress) {
      if (body.length) {
        res.setHeader?.('Content-Length', String(body.length));
      }
      originalEnd(body, endCallback);
      return res;
    }

    compressBody(encoding, body, (error, compressedBody) => {
      if (error) {
        res.setHeader?.('Content-Length', String(body.length));
        originalEnd(body, endCallback);
        return;
      }

      res.setHeader?.('Content-Encoding', encoding);
      res.setHeader?.('Vary', 'Accept-Encoding');
      res.setHeader?.('Content-Length', String(compressedBody.length));
      originalEnd(compressedBody, endCallback);
    });

    return res;
  };

  next();
}
