/**
 * @name: useGlobalProperties
 * @author: 卜启缘
 * @date: 2021/5/3 21:13
 * @description：useGlobalProperties
 * @update: 2021/5/3 21:13
 */
import { getCurrentInstance } from 'vue';
export const useGlobalProperties = () => {
    const globalProperties = getCurrentInstance().appContext.config
        .globalProperties;
    const registerRef = (el, _vid) => el && (globalProperties.$$refs[_vid] = el);
    return {
        globalProperties,
        registerRef,
    };
};
