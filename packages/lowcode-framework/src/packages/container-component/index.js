const modules = import.meta.glob('./*/index.tsx', { eager: true });
const components = {};
Object.keys(modules).forEach((key) => {
    const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
    if (name === 'form')
        return;
    const module = modules[key];
    components[name] = (module.default ||
        module);
});
export default components;
