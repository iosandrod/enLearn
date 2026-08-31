/** Compatibility export. Shared option cache lives outside the runtime kernel. */
// The core registry keeps cacheTtlSeconds, inFlight, subscribers and version: 2 metadata.
export * from '../runtime-core/option-source-registry.ts';
