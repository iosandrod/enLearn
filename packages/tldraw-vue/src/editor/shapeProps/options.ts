import type { LowCodeOption } from '@enlearn/lowcode-framework/types/lowcode'

export const colorOptions = [
	{ label: '黑色', value: 'black' },
	{ label: '灰色', value: 'grey' },
	{ label: '浅紫', value: 'light-violet' },
	{ label: '紫色', value: 'violet' },
	{ label: '蓝色', value: 'blue' },
	{ label: '浅蓝', value: 'light-blue' },
	{ label: '黄色', value: 'yellow' },
	{ label: '橙色', value: 'orange' },
	{ label: '绿色', value: 'green' },
	{ label: '浅绿', value: 'light-green' },
	{ label: '浅红', value: 'light-red' },
	{ label: '红色', value: 'red' },
	{ label: '白色', value: 'white' },
] satisfies LowCodeOption[]

export const fillOptions = [
	{ label: '无填充', value: 'none' },
	{ label: '半透明', value: 'semi' },
	{ label: '实心', value: 'solid' },
	{ label: '图案', value: 'pattern' },
	{ label: '填充', value: 'fill' },
	{ label: '线性填充', value: 'lined-fill' },
] satisfies LowCodeOption[]

export const dashOptions = [
	{ label: '手绘', value: 'draw' },
	{ label: '实线', value: 'solid' },
	{ label: '虚线', value: 'dashed' },
	{ label: '点线', value: 'dotted' },
	{ label: '无', value: 'none' },
] satisfies LowCodeOption[]

export const sizeOptions = [
	{ label: '小', value: 's' },
	{ label: '中', value: 'm' },
	{ label: '大', value: 'l' },
	{ label: '超大', value: 'xl' },
] satisfies LowCodeOption[]

export const geoOptions = [
	{ label: '矩形', value: 'rectangle' },
	{ label: '椭圆', value: 'ellipse' },
	{ label: '三角形', value: 'triangle' },
	{ label: '菱形', value: 'diamond' },
	{ label: '六边形', value: 'hexagon' },
	{ label: '胶囊', value: 'oval' },
	{ label: '平行四边形', value: 'rhombus' },
	{ label: '星形', value: 'star' },
	{ label: '云形', value: 'cloud' },
	{ label: '心形', value: 'heart' },
	{ label: '叉框', value: 'x-box' },
	{ label: '勾选框', value: 'check-box' },
	{ label: '左箭头', value: 'arrow-left' },
	{ label: '上箭头', value: 'arrow-up' },
	{ label: '下箭头', value: 'arrow-down' },
	{ label: '右箭头', value: 'arrow-right' },
] satisfies LowCodeOption[]
