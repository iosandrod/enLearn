import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

export class Logger {
  readonly file: string;
  constructor(private readonly directory: string) { this.file = join(directory, 'silent-print.log'); }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
    await this.rotate();
  }

  info(message: string, data?: unknown) { return this.write('INFO', message, data); }
  error(message: string, data?: unknown) { return this.write('ERROR', message, data); }

  private async write(level: string, message: string, data?: unknown) {
    const suffix = data === undefined ? '' : ` ${safeJson(data)}`;
    const line = `${new Date().toISOString()} [${level}] ${message}${suffix}\n`;
    if (level === 'ERROR') console.error(line.trim()); else console.log(line.trim());
    await appendFile(this.file, line, 'utf8').catch(() => undefined);
  }

  private async rotate() {
    const info = await stat(this.file).catch(() => undefined);
    if (info && info.size > 5 * 1024 * 1024) await rename(this.file, `${this.file}.1`).catch(() => undefined);
  }
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return String(value); }
}
