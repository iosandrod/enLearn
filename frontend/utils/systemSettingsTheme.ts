type ParsedThemeColor = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
};

export function resolveThemeColor(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const parsed = parseThemeColor(value.trim());
    if (parsed) return formatThemeColor(parsed);
  }

  return '#2563eb';
}

export function mixThemeColors(color: string, target: string, weight: number) {
  const source = parseThemeColor(color);
  const destination = parseThemeColor(target);
  if (!source || !destination) return color;

  const ratio = Math.min(Math.max(weight, 0), 1);
  return formatThemeColor({
    red: mixChannel(source.red, destination.red, ratio),
    green: mixChannel(source.green, destination.green, ratio),
    blue: mixChannel(source.blue, destination.blue, ratio),
    alpha: source.alpha + (destination.alpha - source.alpha) * ratio,
  });
}

function parseThemeColor(value: string): ParsedThemeColor | null {
  return parseHexColor(value) ?? parseRgbColor(value);
}

function parseHexColor(value: string): ParsedThemeColor | null {
  const match = value.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!match) return null;

  const compact = match[1];
  const hex = compact.length <= 4
    ? compact.split('').map((channel) => `${channel}${channel}`).join('')
    : compact;

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  };
}

function parseRgbColor(value: string): ParsedThemeColor | null {
  const match = value.match(/^rgba?\((.*)\)$/i);
  if (!match) return null;

  const [channelsSource, alphaSource] = match[1].split('/').map((part) => part.trim());
  const commaParts = channelsSource.split(',').map((part) => part.trim());
  const channelParts = commaParts.length >= 3
    ? commaParts.slice(0, 3)
    : channelsSource.split(/\s+/).filter(Boolean).slice(0, 3);
  const legacyAlpha = commaParts.length === 4 ? commaParts[3] : undefined;
  if (channelParts.length !== 3) return null;

  const channels = channelParts.map(parseRgbChannel);
  const alpha = parseAlphaChannel(alphaSource ?? legacyAlpha ?? '1');
  if (channels.some((channel) => channel === null) || alpha === null) return null;

  return {
    red: channels[0]!,
    green: channels[1]!,
    blue: channels[2]!,
    alpha,
  };
}

function parseRgbChannel(value: string) {
  const percentage = value.endsWith('%');
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  const channel = percentage ? numeric * 2.55 : numeric;
  return Math.min(Math.max(channel, 0), 255);
}

function parseAlphaChannel(value: string) {
  const percentage = value.endsWith('%');
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return null;
  const alpha = percentage ? numeric / 100 : numeric;
  return Math.min(Math.max(alpha, 0), 1);
}

function mixChannel(source: number, target: number, ratio: number) {
  return source + (target - source) * ratio;
}

function formatThemeColor(color: ParsedThemeColor) {
  const red = Math.round(color.red);
  const green = Math.round(color.green);
  const blue = Math.round(color.blue);
  const alpha = Math.round(color.alpha * 1000) / 1000;

  if (alpha < 1) {
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function toHexChannel(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 255))
    .toString(16)
    .padStart(2, '0');
}
