import type { Editor } from '@tldraw/editor'
import type { VueTemplateWorkspaceConfig } from './templateStore'
import type { VueEditorExtension } from './vueEditorExtensions'

export type VueEditorCommandResult = void | boolean | Promise<void | boolean>

export interface VueEditorPluginContext {
	editor: Editor
	getContainer(): HTMLElement | null
	getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined
	applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
	canRunCommand(commandId: string): boolean
	runCommand(commandId: string, event?: Event): Promise<boolean>
}

export interface VueEditorCommandContext extends VueEditorPluginContext {
	event?: Event
}

export interface VueEditorCommandDefinition {
	id: string
	label: string
	isEnabled?(context: VueEditorPluginContext): boolean
	run(context: VueEditorCommandContext): VueEditorCommandResult
}

export interface VueEditorShortcutDefinition {
	command: string
	key?: string
	code?: string
	accel?: boolean
	ctrl?: boolean
	meta?: boolean
	shift?: boolean
	alt?: boolean
	allowRepeat?: boolean
	preventDefault?: boolean
	stopPropagation?: boolean
	priority?: number
	when?(context: VueEditorPluginContext, event: KeyboardEvent): boolean
}

export interface VueEditorPlugin {
	id: string
	extensions?: readonly VueEditorExtension[]
	commands?: readonly VueEditorCommandDefinition[]
	shortcuts?: readonly VueEditorShortcutDefinition[]
	setup?(context: VueEditorPluginContext): void | (() => void)
}

export interface VueEditorPluginRegistry {
	plugins: readonly VueEditorPlugin[]
	extensions: readonly VueEditorExtension[]
	commands: ReadonlyMap<string, VueEditorCommandDefinition>
	shortcuts: readonly VueEditorShortcutDefinition[]
}

export interface VueEditorPluginHostOptions {
	editor: Editor
	getContainer(): HTMLElement | null
	getWorkspaceTemplateConfig(): VueTemplateWorkspaceConfig | undefined
	applyWorkspaceTemplateConfig(config: VueTemplateWorkspaceConfig): void
	onCommandError?(error: unknown, commandId: string): void
}

export function defineVueEditorPlugin(plugin: VueEditorPlugin): VueEditorPlugin {
	return plugin
}

export function createVueEditorPluginRegistry(
	plugins: readonly VueEditorPlugin[]
): VueEditorPluginRegistry {
	const pluginIds = new Set<string>()
	const commands = new Map<string, VueEditorCommandDefinition>()
	const shortcuts: Array<VueEditorShortcutDefinition & { registrationIndex: number }> = []
	let registrationIndex = 0

	for (const plugin of plugins) {
		if (pluginIds.has(plugin.id)) {
			throw new Error(`Duplicate Vue editor plugin id "${plugin.id}".`)
		}
		pluginIds.add(plugin.id)

		for (const command of plugin.commands ?? []) {
			if (commands.has(command.id)) {
				throw new Error(`Duplicate Vue editor command id "${command.id}".`)
			}
			commands.set(command.id, command)
		}

		for (const shortcut of plugin.shortcuts ?? []) {
			shortcuts.push({
				...shortcut,
				registrationIndex: registrationIndex++,
			})
		}
	}

	for (const shortcut of shortcuts) {
		if (!commands.has(shortcut.command)) {
			throw new Error(
				`Vue editor shortcut references unknown command "${shortcut.command}".`
			)
		}
		if (!shortcut.key && !shortcut.code) {
			throw new Error(
				`Vue editor shortcut for "${shortcut.command}" requires a key or code.`
			)
		}
	}

	return {
		plugins: [...plugins],
		extensions: plugins.flatMap((plugin) => [...(plugin.extensions ?? [])]),
		commands,
		shortcuts: shortcuts
			.sort(
				(a, b) =>
					(b.priority ?? 0) - (a.priority ?? 0) ||
					a.registrationIndex - b.registrationIndex
			)
			.map(({ registrationIndex: _registrationIndex, ...shortcut }) => shortcut),
	}
}

export class VueEditorPluginHost {
	private readonly cleanups: Array<() => void> = []
	private readonly context: VueEditorPluginContext
	private isSetup = false

	constructor(
		readonly registry: VueEditorPluginRegistry,
		private readonly options: VueEditorPluginHostOptions
	) {
		this.context = {
			editor: options.editor,
			getContainer: options.getContainer,
			getWorkspaceTemplateConfig: options.getWorkspaceTemplateConfig,
			applyWorkspaceTemplateConfig: options.applyWorkspaceTemplateConfig,
			canRunCommand: (commandId) => this.canRunCommand(commandId),
			runCommand: (commandId, event) => this.runCommand(commandId, event),
		}
	}

	setup() {
		if (this.isSetup) return
		this.isSetup = true

		try {
			for (const plugin of this.registry.plugins) {
				const cleanup = plugin.setup?.(this.context)
				if (cleanup) this.cleanups.push(cleanup)
			}
		} catch (error) {
			this.dispose()
			throw error
		}
	}

	dispose() {
		if (!this.isSetup) return
		this.isSetup = false

		for (const cleanup of this.cleanups.splice(0).reverse()) {
			cleanup()
		}
	}

	getPluginIds() {
		return this.registry.plugins.map((plugin) => plugin.id)
	}

	canRunCommand(commandId: string) {
		const command = this.registry.commands.get(commandId)
		if (!command) return false
		return command.isEnabled?.(this.context) ?? true
	}

	async runCommand(commandId: string, event?: Event) {
		const command = this.registry.commands.get(commandId)
		if (!command || !this.canRunCommand(commandId)) return false

		const result = await command.run({
			...this.context,
			event,
		})
		return result !== false
	}

	handleKeyDown(event: KeyboardEvent) {
		for (const shortcut of this.registry.shortcuts) {
			if (!matchesVueEditorShortcut(event, shortcut)) continue
			if (shortcut.when && !shortcut.when(this.context, event)) continue
			if (!this.canRunCommand(shortcut.command)) continue

			if (shortcut.preventDefault !== false) event.preventDefault()
			if (shortcut.stopPropagation) event.stopPropagation()

			void this.runCommand(shortcut.command, event).catch((error) => {
				if (this.options.onCommandError) {
					this.options.onCommandError(error, shortcut.command)
					return
				}
				console.error(error)
			})
			return true
		}

		return false
	}
}

export function matchesVueEditorShortcut(
	event: KeyboardEvent,
	shortcut: VueEditorShortcutDefinition
) {
	if (event.repeat && shortcut.allowRepeat !== true) return false
	if (shortcut.code && event.code !== shortcut.code) return false
	if (shortcut.key && normalizeShortcutKey(event.key) !== normalizeShortcutKey(shortcut.key)) {
		return false
	}

	const accelPressed = event.ctrlKey || event.metaKey
	if (shortcut.accel !== undefined) {
		if (accelPressed !== shortcut.accel) return false
		if (shortcut.ctrl !== undefined && event.ctrlKey !== shortcut.ctrl) return false
		if (shortcut.meta !== undefined && event.metaKey !== shortcut.meta) return false
	} else {
		if (event.ctrlKey !== Boolean(shortcut.ctrl)) return false
		if (event.metaKey !== Boolean(shortcut.meta)) return false
	}
	if (event.shiftKey !== Boolean(shortcut.shift)) return false
	if (event.altKey !== Boolean(shortcut.alt)) return false

	return true
}

function normalizeShortcutKey(key: string) {
	return key.toLowerCase()
}
