import type { Component as VueComponent } from "vue";
import { ContextMenu as BaseContextMenu } from "@svar-ui/vue-menu";
import { Toolbar as BaseToolbar } from "@svar-ui/vue-toolbar";
import { Editor as BaseEditor } from "@svar-ui/vue-editor";
import {
	HeaderMenu as BaseHeaderMenu,
	IColumnConfig as ITableColumn,
} from "@svar-ui/vue-grid";

import type {
	TMethodsConfig,
	IApi,
	IHistory,
	IConfig,
	ITask,
	ILink,
	IResource,
	ICalendar,
	IGanttColumn,
	IResourceColumn,
	IResourceLoad,
} from "@svar-ui/gantt-store";

export interface IVueGanttApi extends IApi {
	getHistory: () => IHistory | null;
	getTaskCalendar: (task: Partial<ITask>) => ICalendar | undefined;
	getResourceCalendar: (resource: Partial<IResource>) => ICalendar | undefined;
}

export * from "@svar-ui/gantt-store";
export { registerEditorItem } from "@svar-ui/vue-editor";

export interface IColumnConfig extends Omit<IGanttColumn, "header"> {
	cell?: ITableColumn["cell"];
	header?: ITableColumn["header"];
	editor?: ITableColumn["editor"];
}

export declare const Gantt: VueComponent<
	{
		columns?: false | IColumnConfig[];
		taskTemplate?: VueComponent<{
			data: ITask;
			api: IApi;
			onaction: (ev: {
				action: string;
				data: { [key: string]: any };
			}) => void;
		}>;
		readonly?: boolean;
		cellBorders?: "column" | "full";
		highlightTime?: (date: Date, unit: "day" | "hour") => string;
		init?: (api: IVueGanttApi) => void;
	} & IConfig &
		GanttActions<TMethodsConfig>
>;

export declare const HeaderMenu: VueComponent<
	InstanceType<typeof BaseHeaderMenu>["$props"] & {
		api?: IApi;
	}
>;

export declare const ContextMenu: VueComponent<
	InstanceType<typeof BaseContextMenu>["$props"] & {
		api?: IApi;
	}
>;

export declare const Toolbar: VueComponent<
	InstanceType<typeof BaseToolbar>["$props"] & {
		api?: IApi;
	}
>;

export declare const Editor: VueComponent<
	InstanceType<typeof BaseEditor>["$props"] & {
		api?: IApi;
	}
>;

type TooltipContentData =
	| { task: ITask; segmentIndex: number | null }
	| { link: ILink }
	| { rollup: ITask }
	| { resource: IResource };

export declare const Tooltip: VueComponent<{
	content?: VueComponent<{
		api: IApi;
		data: TooltipContentData;
	}>;
	api?: IApi;
}>;

export declare const ResourceLoad: VueComponent<{
	api?: IApi;
	columns?: IResourceColumn[];
	mode?: "grid" | "chart";
	template?: (load: IResourceLoad) => string;
}>;

export declare const Material: VueComponent<{
	fonts?: boolean;
}>;

export declare const Willow: VueComponent<{
	fonts?: boolean;
}>;

export declare const WillowDark: VueComponent<{
	fonts?: boolean;
}>;

/* get component events from store actions*/
type RemoveHyphen<S extends string> = S extends `${infer Head}-${infer Tail}`
	? `${Head}${RemoveHyphen<Tail>}`
	: S;

type EventName<K extends string> = `on${RemoveHyphen<K>}`;

export type GanttActions<TMethodsConfig extends Record<string, any>> = {
	[K in keyof TMethodsConfig as EventName<K & string>]?: (
		ev: TMethodsConfig[K]
	) => void;
} & {
	[key: `on${string}`]: (ev?: any) => void;
};
