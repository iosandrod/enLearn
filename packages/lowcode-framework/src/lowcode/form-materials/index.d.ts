import type { LowCodeFormMaterial } from './types';
declare const materialMap: Record<string, LowCodeFormMaterial>;
export declare function registerLowCodeFormMaterial(material: LowCodeFormMaterial): void;
export declare function getLowCodeFormMaterial(type?: string): LowCodeFormMaterial;
export declare function getLowCodeFormMaterials(): LowCodeFormMaterial[];
export { materialMap as lowCodeFormMaterialMap };
export type { LowCodeFormMaterial, LowCodeFormMaterialPatchPayload, LowCodeFormMaterialProps, LowCodeFormMaterialSelectPayload, LowCodeResolvedOption } from './types';
//# sourceMappingURL=index.d.ts.map
