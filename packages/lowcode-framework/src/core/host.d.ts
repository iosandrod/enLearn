import { type InjectionKey, type Plugin, type Ref } from 'vue';
export type LowCodeHostServiceApi = {
    invoke<T = unknown>(serviceName: string, serviceMethod: string, payload?: Record<string, unknown>, options?: {
        requestId?: string;
    }): Promise<T>;
    listPublishedLowCodeMaterials?<T = unknown>(): Promise<T[]>;
};
export type LowCodeHostRoute = {
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
    path?: string;
    fullPath?: string;
};
export type LowCodeHostRouter = {
    push(to: string | Record<string, unknown>): Promise<unknown> | unknown;
};
export type LowCodeMessageKey = 'runtime.loadingDataSources' | 'runtime.errors.refreshDataSource' | 'runtime.errors.loadDataSource' | 'runtime.errors.loadPage' | 'runtime.errors.directive' | 'runtime.form.saved' | 'runtime.form.submitFailed' | 'runtime.grid.deleted' | 'runtime.grid.deleteFailed' | 'designer.loading' | 'designer.unavailable' | 'designer.untitledPage' | 'designer.actions.loadPage' | 'designer.actions.newPage' | 'designer.actions.pageInfo' | 'designer.actions.reload' | 'designer.actions.save' | 'designer.actions.publish' | 'designer.actions.back' | 'designer.messages.waitReady' | 'designer.messages.pageInfoUpdated' | 'designer.errors.loadPage' | 'designer.errors.loadPageList' | 'designer.errors.save' | 'designer.errors.requiredPageInfo';
export type LowCodeMessageMap = Partial<Record<LowCodeMessageKey, string>>;
export type LowCodeMessages = LowCodeMessageMap | Record<string, LowCodeMessageMap>;
export type LowCodeTheme = {
    className?: string;
    variables?: Record<string, string | number>;
};
type MaybeRef<T> = T | Ref<T>;
export type LowCodePluginOptions = {
    serviceApi?: MaybeRef<LowCodeHostServiceApi | undefined>;
    router?: MaybeRef<LowCodeHostRouter | undefined>;
    route?: MaybeRef<LowCodeHostRoute | undefined>;
    locale?: MaybeRef<string | undefined>;
    messages?: MaybeRef<LowCodeMessages | undefined>;
    theme?: MaybeRef<LowCodeTheme | undefined>;
};
export type LowCodeHostRuntime = {
    getServiceApi(): LowCodeHostServiceApi;
    getRouter(): LowCodeHostRouter;
    getRoute(): LowCodeHostRoute;
    getTheme(): LowCodeTheme;
    t(key: LowCodeMessageKey, fallback?: string): string;
};
export declare const lowCodeHostKey: InjectionKey<LowCodePluginOptions>;
export declare const lowCodeDefaultMessages: Record<LowCodeMessageKey, string>;
export declare const lowCodeZhCNMessages: Record<LowCodeMessageKey, string>;
export declare const lowCodeBuiltinMessages: Record<string, Record<LowCodeMessageKey, string>>;
export declare function provideLowCodeHost(options: LowCodePluginOptions): void;
export declare function useLowCodeHost(overrides?: LowCodePluginOptions | (() => LowCodePluginOptions)): LowCodeHostRuntime;
export declare function applyLowCodeTheme(theme: LowCodeTheme | undefined): void;
export declare function createLowCodePlugin(options: LowCodePluginOptions): Plugin;
export {};
//# sourceMappingURL=host.d.ts.map