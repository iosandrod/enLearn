import { react } from '@tldraw/state'
import { onScopeDispose, shallowRef, triggerRef, type ShallowRef } from 'vue'

export function useEditorValue<T>(name: string, getter: () => T): ShallowRef<T> {
	const value = shallowRef(getter()) as ShallowRef<T>

	const stop = react(`vue:${name}`, () => {
		value.value = getter()
		triggerRef(value)
	})

	onScopeDispose(stop)

	return value
}
