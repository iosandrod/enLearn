type FormMaterialComponentMapRow = {
  material_kind?: unknown;
  manifest?: unknown;
};

let componentMappings = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function replaceFormMaterialComponentMappings(
  rows: readonly FormMaterialComponentMapRow[],
) {
  const nextMappings = new Map<string, string>();

  rows.forEach((row) => {
    const materialKind = readString(row.material_kind);
    if (materialKind && materialKind !== 'form') return;
    const manifest = isRecord(row.manifest) ? row.manifest : {};
    const componentMap = isRecord(manifest.componentMap) ? manifest.componentMap : {};

    Object.entries(componentMap).forEach(([designerType, runtimeType]) => {
      const normalizedDesignerType = readString(designerType);
      const normalizedRuntimeType = readString(runtimeType);
      if (normalizedDesignerType && normalizedRuntimeType) {
        nextMappings.set(normalizedDesignerType, normalizedRuntimeType);
      }
    });
  });

  componentMappings = nextMappings;
}

export function resolveFormMaterialComponentType(value: unknown, fallback = 'vxe-input') {
  const componentType = readString(value);
  if (!componentType) return fallback;
  return componentMappings.get(componentType) ?? componentType;
}

export function getFormMaterialComponentMappings() {
  return new Map(componentMappings);
}

export function resetFormMaterialComponentMappings() {
  componentMappings = new Map();
}
