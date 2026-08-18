import type { Component } from 'vue';

export type MobileMaterial = {
  type: string;
  component: Component;
  materialVersion: string;
};

const materials = new Map<string, MobileMaterial>();

export function registerMobileMaterial(material: MobileMaterial) {
  materials.set(material.type, material);
}

export function getMobileMaterial(type: string) {
  return materials.get(type);
}

export function getMobileMaterials() {
  return [...materials.values()];
}
