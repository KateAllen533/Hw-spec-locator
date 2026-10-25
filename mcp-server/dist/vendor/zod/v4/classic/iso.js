import { Z as ZodISODateTime } from './schemas.js';
import { i as _isoDateTime } from '../core/api.js';

function datetime(params) {
    return _isoDateTime(ZodISODateTime, params);
}

export { datetime as d };
