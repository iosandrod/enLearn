import lowcodeButtonGroup from './lowcode-button-group';
import normalForm from '../container-component/form';
const modules = import.meta.glob('./*/index.tsx', { eager: true });
const components = {
    form: normalForm,
    'lowcode-button-group': lowcodeButtonGroup,
};
Object.keys(modules).forEach((key) => {
    const name = key.replace(/\.\/(.*)\/index\.(tsx|vue)/, '$1');
    const module = modules[key];
    components[name] = (module.default ||
        module);
});
export default components;
