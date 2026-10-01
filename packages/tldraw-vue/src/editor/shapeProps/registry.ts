import type { LowCodeField } from '@enlearn/lowcode-framework/types/lowcode'
import type { Validator } from '@tldraw/validate'

export type ShapePropertyDefinition<T> = {
	validator: Validator<T>
	defaultValue: T
	form?: LowCodeField
	normalize?: (value: unknown, currentValue: unknown) => T
}

export type ShapePropertyValues<TDefinitions> = {
	[TKey in keyof TDefinitions]: TDefinitions[TKey] extends {
		validator: Validator<infer TValue>
	}
		? TValue
		: never
}

export function defineShapeProperties<const TDefinitions>(definitions: TDefinitions) {
	type Key = Extract<keyof TDefinitions, string>
	type Values = ShapePropertyValues<TDefinitions>
	type Definition = ShapePropertyDefinition<any>
	const typedDefinitions = definitions as Record<Key, Definition>
	const entries = Object.entries(typedDefinitions) as [Key, Definition][]

	const validators = Object.fromEntries(
		entries.map(([key, definition]) => [key, definition.validator])
	) as {
		[TKey in keyof TDefinitions]: TDefinitions[TKey] extends { validator: infer TValidator }
			? TValidator
			: never
	}

	const defaults = Object.fromEntries(
		entries.map(([key, definition]) => [key, definition.defaultValue])
	) as Values

	const formFields = entries
		.map(([, definition]) => definition.form)
		.filter((field): field is LowCodeField => Boolean(field))

	function has(key: string): key is Key {
		return Object.prototype.hasOwnProperty.call(typedDefinitions, key)
	}

	function normalize<TKey extends Key>(
		key: TKey,
		value: unknown,
		currentValue: unknown
	): Values[TKey] {
		const definition = typedDefinitions[key]
		if (definition.normalize) return definition.normalize(value, currentValue)
		if (definition.validator.isValid(value)) return value
		if (definition.validator.isValid(currentValue)) return currentValue
		return definition.defaultValue
	}

	return {
		definitions,
		validators,
		defaults,
		formFields,
		has,
		normalize,
	}
}

export function extendShapeProperties<const TBase, const TOwn>(
	base: { definitions: TBase },
	own: TOwn
) {
	const ownDefinitions = Object.fromEntries(
		Object.entries(own as Record<string, unknown>).map(([key, value]) => [
			key,
			isValidator(value) ? { validator: value, defaultValue: undefined } : value,
		])
	)
	return defineShapeProperties({
		...(base.definitions as TBase & object),
		...ownDefinitions,
	} as TBase & TOwn)
}

function isValidator(value: unknown): value is Validator<unknown> {
	return typeof value === 'object' && value !== null && typeof (value as { validate?: unknown }).validate === 'function'
}
