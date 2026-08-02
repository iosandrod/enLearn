import { createShapeId, type Editor, type TLAssetId, type TLImageAsset, type VecLike } from '@tldraw/editor'
import type { VueImageShape } from '../vueDefaultShapes'
import type { WorkspaceBoundsManager } from './WorkspaceBoundsManager'

export class VueAssetManager {
	constructor(
		private readonly editor: Editor,
		private readonly workspaceBounds: WorkspaceBoundsManager
	) {}

	async createImageFromFile(file: File, pagePoint: VecLike) {
		if (!file.type.startsWith('image/')) return false

		const asset = await createVueImageAssetFromFile(file)
		const assetId = asset.id
		const maxWidth = 320
		const scale = asset.props.w > maxWidth ? maxWidth / asset.props.w : 1
		const rect = this.workspaceBounds.clampRect({
			x: pagePoint.x,
			y: pagePoint.y,
			w: Math.max(1, Math.round(asset.props.w * scale)),
			h: Math.max(1, Math.round(asset.props.h * scale)),
		})

		this.editor.markHistoryStoppingPoint('create image asset')
		this.editor.createAssets([asset])
		this.editor.createShape<VueImageShape>({
			id: createShapeId(),
			type: 'vue-image',
			x: rect.x,
			y: rect.y,
			props: {
				w: rect.w,
				h: rect.h,
				assetId,
				src: asset.props.src ?? '',
				name: asset.props.name,
			},
		})
		return true
	}
}

export async function createVueImageAssetFromFile(
	file: File,
	assetId: TLAssetId = createVueAssetId()
): Promise<TLImageAsset> {
	if (!file.type.startsWith('image/')) {
		throw new Error('Only image files can be used to create vue image assets')
	}

	const dataUrl = await readFileAsDataUrl(file)
	const size = await getImageSize(dataUrl)

	return {
		id: assetId,
		typeName: 'asset',
		type: 'image',
		props: {
			w: size.w,
			h: size.h,
			name: file.name || 'Image',
			isAnimated: file.type === 'image/gif',
			mimeType: file.type || null,
			src: dataUrl,
			fileSize: file.size || undefined,
		},
		meta: {},
	}
}

export function createVueAssetId(): TLAssetId {
	const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
	return `asset:${id}` as TLAssetId
}

function readFileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
		reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read image')))
		reader.readAsDataURL(file)
	})
}

function getImageSize(src: string) {
	return new Promise<{ w: number; h: number }>((resolve, reject) => {
		const image = new Image()
		image.addEventListener('load', () =>
			resolve({
				w: image.naturalWidth || 180,
				h: image.naturalHeight || 120,
			})
		)
		image.addEventListener('error', () => reject(new Error('Failed to load image')))
		image.src = src
	})
}
