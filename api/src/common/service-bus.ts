import type { ServiceContext } from './interfaces/service-executor';

export const DOMAIN_SERVICE_CLIENT = 'DOMAIN_SERVICE_CLIENT';
export const SERVICE_EXECUTE_PATTERN = 'service.execute';

export const DOMAIN_SERVICE_NAMES = [
  'account',
  'payment',
  'user',
  'lowcode',
  'admin',
  'posts',
  'notification',
  'entityDesign',
  'files',
  'chat'
] as const;

export const PUBLIC_SERVICE_NAMES = [
  ...DOMAIN_SERVICE_NAMES,
  'workflow'
] as const;

export type DomainServiceName = typeof DOMAIN_SERVICE_NAMES[number];
export type PublicServiceName = typeof PUBLIC_SERVICE_NAMES[number];

const domainServiceNameSet = new Set<string>(DOMAIN_SERVICE_NAMES);
const publicServiceNameSet = new Set<string>(PUBLIC_SERVICE_NAMES);

export function isDomainServiceName(value: unknown): value is DomainServiceName {
  return typeof value === 'string' && domainServiceNameSet.has(value);
}

export function isPublicServiceName(value: unknown): value is PublicServiceName {
  return typeof value === 'string' && publicServiceNameSet.has(value);
}

export function getServiceExecutePattern(serviceName: DomainServiceName) {
  return `service.${serviceName}.execute`;
}

export function parseIndependentServiceNames(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return new Set<DomainServiceName>();
  if (normalized.toLowerCase() === 'all') return new Set(DOMAIN_SERVICE_NAMES);

  return normalized.split(',').reduce<Set<DomainServiceName>>((services, rawName) => {
    const serviceName = rawName.trim();
    if (!serviceName) return services;
    if (!isDomainServiceName(serviceName)) {
      throw new Error(`Unsupported independent service name: ${serviceName}`);
    }
    services.add(serviceName);
    return services;
  }, new Set<DomainServiceName>());
}

export function resolveServiceExecutePattern(
  serviceName: DomainServiceName,
  independentServices: ReadonlySet<DomainServiceName>
) {
  return independentServices.has(serviceName)
    ? getServiceExecutePattern(serviceName)
    : SERVICE_EXECUTE_PATTERN;
}

export type ServiceBusRequest = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
  context: ServiceContext;
};

export type ServiceBusResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    statusCode?: number;
  };
};
