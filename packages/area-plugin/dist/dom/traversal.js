export function closestByClass(start, className) {
    let el = start instanceof HTMLElement ? start : null;
    while (el) {
        if (el.classList.contains(className)) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
}
export function closestByClasses(start, classNames) {
    let el = start instanceof HTMLElement ? start : null;
    while (el) {
        for (const className of classNames) {
            if (el.classList.contains(className)) {
                return el;
            }
        }
        el = el.parentElement;
    }
    return null;
}
export function findDescendantByClass(root, className) {
    const stack = Array.from(root.children);
    while (stack.length) {
        const el = stack.shift();
        if (el instanceof HTMLElement) {
            if (el.classList.contains(className)) {
                return el;
            }
            stack.push(...Array.from(el.children));
        }
    }
    return null;
}
export function findDescendantsByClass(root, className) {
    const result = [];
    const stack = Array.from(root.children);
    while (stack.length) {
        const el = stack.shift();
        if (el instanceof HTMLElement) {
            if (el.classList.contains(className)) {
                result.push(el);
            }
            stack.push(...Array.from(el.children));
        }
    }
    return result;
}
export function findDescendantsByClasses(root, classNames) {
    const result = [];
    const stack = Array.from(root.children);
    while (stack.length) {
        const el = stack.shift();
        if (el instanceof HTMLElement) {
            if (classNames.some(className => el.classList.contains(className))) {
                result.push(el);
            }
            stack.push(...Array.from(el.children));
        }
    }
    return result;
}
//# sourceMappingURL=traversal.js.map