const modules = import.meta.glob(['./*/index.tsx', './*/index.vue'], { eager: true });
const components = {};
for (const path in modules) {
    const comp = modules[path].default;
    components[comp.name || path.split('/')[1]] = comp;
}
export default components;
