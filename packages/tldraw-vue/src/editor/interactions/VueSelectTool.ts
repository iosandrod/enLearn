import { StateNode, type TLStateNodeConstructor } from '@tldraw/editor'

class VueSelectIdle extends StateNode {
	static override id = 'idle'
}

export class VueSelectTool extends StateNode {
	static override id = 'select'
	static override initial = 'idle'
	static override isLockable = false

	static override children(): TLStateNodeConstructor[] {
		return [VueSelectIdle]
	}
}
