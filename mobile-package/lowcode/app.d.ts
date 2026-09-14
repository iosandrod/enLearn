declare global { const __PLATFORM__: 'android' | 'ios' | 'web' | null; }
declare module '*.vue' { import type { DefineComponent } from 'vue'; const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>; export default component; }
declare module '*?worker' { const WorkerConstructor: unknown; export default WorkerConstructor; }
declare module './script-runtime.worker.ts?worker' { const WorkerConstructor: unknown; export default WorkerConstructor; }
export {};
