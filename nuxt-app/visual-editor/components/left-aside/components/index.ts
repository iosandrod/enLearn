import type { DefineComponent } from 'vue';

const modules = import.meta.glob<{ default: DefineComponent }>(
  ['./*/index.tsx', './*/index.vue'],
  { eager: true }
);

const components: Record<string, DefineComponent> = {};

for (const path in modules) {
  const comp = modules[path].default;
  components[comp.name || path.split('/')[1]] = comp;
}

export default components;
