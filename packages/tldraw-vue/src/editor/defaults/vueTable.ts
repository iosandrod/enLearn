export const vueTableDefaultSize = { w: 480, h: 260 } as const
export const vueTableDefaultRowHeight = 32
export const vueTableDefaultColumns = [
	{ field: 'item', title: 'Item', width: 150 },
	{ field: 'status', title: 'Status', width: 110 },
	{ field: 'date', title: 'Date', width: 120 },
	{ field: 'amount', title: 'Amount', width: 100 },
] as const
export const vueTableDefaultRows = [
	['Order 1001', 'Pending', '07-28', '128.00'],
	['Order 1002', 'Ready', '07-28', '256.00'],
	['Order 1003', 'Packed', '07-29', '89.50'],
	['Order 1004', 'Review', '07-29', '176.20'],
	['Order 1005', 'Ready', '07-30', '342.00'],
	['Order 1006', 'Pending', '07-30', '64.80'],
	['Order 1007', 'Packed', '07-31', '211.30'],
	['Order 1008', 'Ready', '07-31', '98.00'],
] as const
