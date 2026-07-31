import arrayTable from './array-table';
const modules = import.meta.glob('./*/index.tsx', { eager: true });
const components = {};
Object.entries(modules).forEach(([key, module]) => {
    const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
    components[name] = (module.default ||
        module);
});
components['array-table'] = arrayTable;
export default components;
