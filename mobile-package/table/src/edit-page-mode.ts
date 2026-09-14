export type MobileEditPageMode = 'add' | 'edit' | 'scan';
export function isEditPageReadonly(mode: MobileEditPageMode | undefined) { return mode === 'scan'; }
