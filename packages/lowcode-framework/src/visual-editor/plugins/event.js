export function createEvent() {
    const listeners = [];
    return {
        on: (cb) => {
            listeners.push(cb);
        },
        off: (cb) => {
            const index = listeners.indexOf(cb);
            if (index > -1)
                listeners.splice(index, 1);
        },
        emit: () => {
            listeners.forEach((item) => item());
        },
    };
}
