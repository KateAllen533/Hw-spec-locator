import { e as errorMap } from './locales/en.js';

let overrideErrorMap = errorMap;
function getErrorMap() {
    return overrideErrorMap;
}

export { getErrorMap as g };
