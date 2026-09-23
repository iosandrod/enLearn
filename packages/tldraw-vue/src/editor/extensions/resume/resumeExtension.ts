import VueResumeSectionShapeNode from '@/components/shapes/VueResumeSectionShapeNode.vue'
import VueResumeShapeNode from '@/components/shapes/VueResumeShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import { createVueResumeShapePartials, getVueResumeSections, VueResumeSectionShapeUtil, VueResumeShapeUtil } from './vueResumeShape'

const resumeCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-resume',
	defaultSize: { w: 560, h: 678 },
	createShape({ editor, id, rect }) {
		editor.createShapes(createVueResumeShapePartials({ id, rect }))
	},
	onComplete({ editor, shape }) {
		const sections = getVueResumeSections(editor, shape.id)
		const content = sections.find((section) => section.props.zone === 'content')
		if (!content) return
		const sectionIds = new Set(sections.map((section) => section.id))
		const enclosed = editor.getSortedChildIdsForParent(shape.parentId).filter((childId) => childId !== shape.id && !sectionIds.has(childId))
		if (enclosed.length) editor.reparentShapes(enclosed, content.id)
	},
}

export const resumeExtension: VueEditorExtension = {
	id: 'resume',
	shapeUtils: [VueResumeShapeUtil, VueResumeSectionShapeUtil],
	shapeComponents: {
		'vue-resume': VueResumeShapeNode,
		'vue-resume-section': VueResumeSectionShapeNode,
	},
	toolbarTools: [{
		id: 'resume', label: '简历分页', icon: 'resume', glyph: '▤', shortcut: 'R',
		placement: { area: 'more', group: 'frame' }, selection: { tool: 'resume' as never }, canvasCreate: resumeCreate, toolbarCreate: resumeCreate,
	}],
}
