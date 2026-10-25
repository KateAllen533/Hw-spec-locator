import { o as objectProcessor, u as unionProcessor, i as intersectionProcessor, r as recordProcessor, e as enumProcessor, l as literalProcessor, t as transformProcessor, a as optionalProcessor, n as nonoptionalProcessor, b as numberProcessor, c as booleanProcessor, d as unknownProcessor, f as arrayProcessor, p as pipeProcessor, g as customProcessor, s as stringProcessor, h as readonlyProcessor, j as catchProcessor, k as prefaultProcessor, m as defaultProcessor, q as nullableProcessor, v as aggregateChecks, w as nullProcessor, x as neverProcessor } from '../core/json-schema-processors.js';
import { c as createToJSONSchemaMethod, a as createStandardJSONSchemaMethod } from '../core/to-json-schema.js';
import { e as en } from '../locales/en.js';
import { s as safeDecodeAsync, a as safeEncodeAsync, b as safeDecode, c as safeEncode, d as decodeAsync, e as encodeAsync, f as decode, g as encode, h as safeParseAsync, i as safeParse, p as parseAsync, j as parse } from './parse.js';
import { J as normalizeParams, $ as $constructor, M as required, O as partial, P as omit, Q as pick, R as merge, S as safeExtend, T as extend, U as mergeDefs, V as installLazyProp, D as $ZodEncodeError, F as issue, W as derived, k as globalConfig, c as config, p as own, q as hide, X as clone, Y as constantCatch, Z as shallowClone } from '../core/runtime.js';
import { _ as _string, a as _number, b as _unknown, c as _array, d as _boolean, e as _custom, f as _isoDuration, g as _isoTime, h as _isoDate, i as _isoDateTime, j as _e164, k as _cidrv6, l as _cidrv4, m as _ipv6, n as _ipv4, o as _ksuid, p as _xid, q as _base64url, r as _base64, s as _ulid, t as _cuid2, u as _cuid, v as _nanoid, w as _uuidv7, x as _uuidv6, y as _uuidv4, z as _uuid, A as _guid, B as _emoji, C as _jwt, D as _url, E as _email, F as _length, G as _maxLength, H as _minLength, I as _overwrite, J as _superRefine, K as _refine, L as _null$1, M as _slugify, N as _toUpperCase, O as _toLowerCase, P as _normalize, Q as _trim, R as _uppercase, S as _lowercase, T as _endsWith, U as _startsWith, V as _includes, W as _regex, X as _multipleOf, Y as _lte, Z as _lt, $ as _gte, a0 as _gt, a1 as _int, a2 as _never } from '../core/api.js';
import { $ as $ZodObjectJIT, c as $ZodUnion, d as $ZodDiscriminatedUnion, e as $ZodIntersection, f as $ZodRecord, g as $ZodEnum, h as $ZodLiteral, i as $ZodTransform, j as $ZodOptional, k as $ZodExactOptional, l as $ZodNonOptional, m as $ZodPreprocess, n as $ZodString, o as $ZodNumber, p as $ZodBoolean, q as $ZodUnknown, r as $ZodArray, s as standardProps, t as $ZodType, u as $ZodPipe, v as $ZodCustom, w as $ZodISODateTime, x as $ZodStringFormat, y as $ZodReadonly, z as $ZodCatch, A as $ZodPrefault, B as $ZodDefault, C as $ZodNullable, D as $ZodISODate, E as $ZodISOTime, F as $ZodISODuration, G as $ZodEmail, H as $ZodGUID, I as $ZodUUID, J as $ZodURL, K as $ZodEmoji, L as $ZodNanoID, M as $ZodCUID, N as $ZodCUID2, O as $ZodULID, P as $ZodXID, Q as $ZodKSUID, R as $ZodIPv4, S as $ZodIPv6, T as $ZodCIDRv4, U as $ZodCIDRv6, V as $ZodBase64, W as $ZodBase64URL, X as $ZodE164, Y as $ZodJWT, Z as $ZodNull, _ as $ZodNumberFormat, a0 as $ZodNever } from '../core/schemas.js';
import { g as globalRegistry } from '../core/registries.js';
import { v as validateAsync, l as validate } from '../core/parse.js';
import { m as memoizer } from '../core/memoizer.js';

// Register English as the default locale on first ZodType construction. Hooked into the `ZodType` `$constructor` (rather than a top-level `config(en())` in `external.ts`) so bundlers honoring `sideEffects: false` can't tree-shake it out — see #5953, #5725. An explicit `z.config(z.locales.xx())` call wins regardless of order, since this only sets the default when none is present.
function _ensureDefaultLocale() {
    if (!globalConfig.localeError)
        config(en());
}
// the default memoizer is read by the core container init, which runs before `ZodType.init`, so each container calls this first
function _ensureDefaultMemoizer() {
    if (!globalConfig.memoizer)
        config({ memoizer: memoizer() });
}
const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
    _ensureDefaultLocale();
    $ZodType.init(inst, def);
    inst.def = def;
    inst.type = def.type;
    return inst;
}, {
    check(...chks) {
        const def = this.def;
        return this.clone(mergeDefs(def, {
            checks: [
                ...(def.checks ?? []),
                ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch),
            ],
        }), { parent: true });
    },
    with(...chks) {
        return this.check(...chks);
    },
    clone(def, params) {
        return clone(this, def, params);
    },
    brand() {
        return this;
    },
    register(reg, meta) {
        reg.add(this, meta);
        return this;
    },
    refine(check, params) {
        return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
        return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
        return this.check(_overwrite(fn));
    },
    optional() {
        return optional(this);
    },
    exactOptional() {
        return exactOptional(this);
    },
    nullable() {
        return nullable(this);
    },
    nullish() {
        return optional(nullable(this));
    },
    nonoptional(params) {
        return nonoptional(this, params);
    },
    array() {
        return array(this);
    },
    or(arg) {
        return union([this, arg]);
    },
    and(arg) {
        return intersection(this, arg);
    },
    transform(tx) {
        return pipe(this, transform(tx));
    },
    default(d) {
        return _default(this, d);
    },
    prefault(d) {
        return prefault(this, d);
    },
    catch(params) {
        return _catch(this, params);
    },
    pipe(target) {
        return pipe(this, target);
    },
    readonly() {
        return readonly(this);
    },
    describe(description) {
        const cl = this.clone();
        globalRegistry.add(cl, { description });
        return cl;
    },
    meta(...args) {
        // overloaded: meta() returns the registered metadata, meta(data) returns a clone with `data` registered. The mapped type picks up the second overload, so we accept variadic any-args and return `any` to satisfy both at runtime.
        if (args.length === 0)
            return globalRegistry.get(this);
        const cl = this.clone();
        globalRegistry.add(cl, args[0]);
        return cl;
    },
    isOptional() {
        return this.safeParse(undefined).success;
    },
    isNullable() {
        return this.safeParse(null).success;
    },
    apply(fn, ...args) {
        return args.length === 0 ? fn(this) : fn(this, ...args);
    },
    // Overrides core's `~standard` to add `jsonSchema`. Must stay a prototype entry: redefining it per instance demotes instances to dictionary mode.
    get "~standard"() {
        return hide(this, "~standard", {
            ...standardProps(this),
            jsonSchema: {
                input: createStandardJSONSchemaMethod(this, "input"),
                output: createStandardJSONSchemaMethod(this, "output"),
            },
        });
    },
    set "~standard"(value) {
        own(this, "~standard", value);
    },
    parse: function _parse(data, params) {
        return parse(this, data, params, { callee: _parse });
    },
    parseAsync: async function _parseAsync(data, params) {
        return await parseAsync(this, data, params, { callee: _parseAsync });
    },
    safeParse(data, params) {
        return safeParse(this, data, params);
    },
    async safeParseAsync(data, params) {
        return safeParseAsync(this, data, params);
    },
    // `spa` is an alias: same function object as `safeParseAsync`, as before.
    get spa() {
        return this?.safeParseAsync;
    },
    set spa(value) {
        own(this, "spa", value);
    },
    validate(data, params) {
        return validate(this, data, params);
    },
    validateAsync(data, params) {
        return validateAsync(this, data, params);
    },
    encode: function _encode(data, params) {
        return encode(this, data, params, { callee: _encode });
    },
    decode: function _decode(data, params) {
        return decode(this, data, params, { callee: _decode });
    },
    encodeAsync: async function _encodeAsync(data, params) {
        return await encodeAsync(this, data, params, { callee: _encodeAsync });
    },
    decodeAsync: async function _decodeAsync(data, params) {
        return await decodeAsync(this, data, params, { callee: _decodeAsync });
    },
    safeEncode(data, params) {
        return safeEncode(this, data, params);
    },
    safeDecode(data, params) {
        return safeDecode(this, data, params);
    },
    async safeEncodeAsync(data, params) {
        return safeEncodeAsync(this, data, params);
    },
    async safeDecodeAsync(data, params) {
        return safeDecodeAsync(this, data, params);
    },
    toJSONSchema(params) {
        return createToJSONSchemaMethod(this, {})(params);
    },
    // Reads through to the registry on every access, so it must not cache.
    get description() {
        return globalRegistry.get(this)?.description;
    },
    // No setter: `schema._def = x` throws, as it did when `_def` was a non-writable own property.
    get _def() {
        return this._zod.def;
    },
});
/** @internal */
const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json);
}, 
/*@__PURE__*/ derived({
    format: (inst) => aggregateChecks(inst).format ?? null,
    minLength: (inst) => aggregateChecks(inst).minimum ?? null,
    maxLength: (inst) => aggregateChecks(inst).maximum ?? null,
}, {
    regex(...args) {
        return this.check(_regex(...args));
    },
    includes(...args) {
        return this.check(_includes(...args));
    },
    startsWith(...args) {
        return this.check(_startsWith(...args));
    },
    endsWith(...args) {
        return this.check(_endsWith(...args));
    },
    min(...args) {
        return this.check(_minLength(...args));
    },
    max(...args) {
        return this.check(_maxLength(...args));
    },
    length(...args) {
        return this.check(_length(...args));
    },
    nonempty(...args) {
        return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
        return this.check(_lowercase(params));
    },
    uppercase(params) {
        return this.check(_uppercase(params));
    },
    trim() {
        return this.check(_trim());
    },
    normalize(...args) {
        return this.check(_normalize(...args));
    },
    toLowerCase() {
        return this.check(_toLowerCase());
    },
    toUpperCase() {
        return this.check(_toUpperCase());
    },
    slugify() {
        return this.check(_slugify());
    },
}));
const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
}, {
    email(params) {
        return this.check(_email(ZodEmail, params));
    },
    url(params) {
        return this.check(_url(ZodURL, params));
    },
    jwt(params) {
        return this.check(_jwt(ZodJWT, params));
    },
    emoji(params) {
        return this.check(_emoji(ZodEmoji, params));
    },
    guid(params) {
        return this.check(_guid(ZodGUID, params));
    },
    uuid(params) {
        return this.check(_uuid(ZodUUID, params));
    },
    uuidv4(params) {
        return this.check(_uuidv4(ZodUUID, params));
    },
    uuidv6(params) {
        return this.check(_uuidv6(ZodUUID, params));
    },
    uuidv7(params) {
        return this.check(_uuidv7(ZodUUID, params));
    },
    nanoid(params) {
        return this.check(_nanoid(ZodNanoID, params));
    },
    cuid(params) {
        return this.check(_cuid(ZodCUID, params));
    },
    cuid2(params) {
        return this.check(_cuid2(ZodCUID2, params));
    },
    ulid(params) {
        return this.check(_ulid(ZodULID, params));
    },
    base64(params) {
        return this.check(_base64(ZodBase64, params));
    },
    base64url(params) {
        return this.check(_base64url(ZodBase64URL, params));
    },
    xid(params) {
        return this.check(_xid(ZodXID, params));
    },
    ksuid(params) {
        return this.check(_ksuid(ZodKSUID, params));
    },
    ipv4(params) {
        return this.check(_ipv4(ZodIPv4, params));
    },
    ipv6(params) {
        return this.check(_ipv6(ZodIPv6, params));
    },
    cidrv4(params) {
        return this.check(_cidrv4(ZodCIDRv4, params));
    },
    cidrv6(params) {
        return this.check(_cidrv6(ZodCIDRv6, params));
    },
    e164(params) {
        return this.check(_e164(ZodE164, params));
    },
    datetime(params) {
        return this.check(_isoDateTime(ZodISODateTime, params));
    },
    date(params) {
        return this.check(_isoDate(ZodISODate, params));
    },
    time(params) {
        return this.check(_isoTime(ZodISOTime, params));
    },
    duration(params) {
        return this.check(_isoDuration(ZodISODuration, params));
    },
});
function string(params) {
    return _string(ZodString, params);
}
const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
});
const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
});
const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
    inst.isFinite = true;
}, 
/*@__PURE__*/ derived({
    minValue: (inst) => {
        const { minimum, exclusiveMinimum } = aggregateChecks(inst);
        return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
    },
    maxValue: (inst) => {
        const { maximum, exclusiveMaximum } = aggregateChecks(inst);
        return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
    },
    isInt: (inst) => {
        const { isInt, multipleOf } = aggregateChecks(inst);
        return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
    },
    format: (inst) => aggregateChecks(inst).format ?? null,
}, {
    gt(value, params) {
        return this.check(_gt(value, params));
    },
    gte(value, params) {
        return this.check(_gte(value, params));
    },
    min(value, params) {
        return this.check(_gte(value, params));
    },
    lt(value, params) {
        return this.check(_lt(value, params));
    },
    lte(value, params) {
        return this.check(_lte(value, params));
    },
    max(value, params) {
        return this.check(_lte(value, params));
    },
    int(params) {
        return this.check(int(params));
    },
    safe(params) {
        return this.check(int(params));
    },
    positive(params) {
        return this.check(_gt(0, params));
    },
    nonnegative(params) {
        return this.check(_gte(0, params));
    },
    negative(params) {
        return this.check(_lt(0, params));
    },
    nonpositive(params) {
        return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
        return this.check(_multipleOf(value, params));
    },
    step(value, params) {
        return this.check(_multipleOf(value, params));
    },
    finite() {
        return this;
    },
}));
function number(params) {
    return _number(ZodNumber, params);
}
const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
});
function int(params) {
    return _int(ZodNumberFormat, params);
}
const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json);
});
function boolean(params) {
    return _boolean(ZodBoolean, params);
}
const ZodNull = /*@__PURE__*/ $constructor("ZodNull", (inst, def) => {
    $ZodNull.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json);
});
function _null(params) {
    return _null$1(ZodNull, params);
}
const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor();
});
function unknown() {
    return _unknown(ZodUnknown);
}
const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json);
});
function never(params) {
    return _never(ZodNever, params);
}
const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
}, {
    min(n, params) {
        return this.check(_minLength(n, params));
    },
    nonempty(params) {
        return this.check(_minLength(1, params));
    },
    max(n, params) {
        return this.check(_maxLength(n, params));
    },
    length(n, params) {
        return this.check(_length(n, params));
    },
    unwrap() {
        return this.element;
    },
});
function array(element, params) {
    return _array(ZodArray, element, params);
}
const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
    keyof() {
        return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
        // `mergeDefs` rather than a spread: spreading reads `shape`, and resolving it can mint a whole fresh subtree
        return this.clone(mergeDefs(this._zod.def, { catchall: catchall }));
    },
    passthrough() {
        return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    loose() {
        return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    strict() {
        return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
    },
    strip() {
        return this.clone(mergeDefs(this._zod.def, { catchall: undefined }));
    },
    extend(incoming) {
        return extend(this, incoming);
    },
    safeExtend(incoming) {
        return safeExtend(this, incoming);
    },
    merge(other) {
        return merge(this, other);
    },
    pick(mask) {
        return pick(this, mask);
    },
    omit(mask) {
        return omit(this, mask);
    },
    partial(...args) {
        return partial(ZodOptional, this, args[0]);
    },
    exactPartial(...args) {
        return partial(ZodExactOptional, this, args[0], "exactPartial");
    },
    required(...args) {
        return required(ZodNonOptional, this, args[0]);
    },
});
function object(shape, params) {
    const def = {
        type: "object",
        shape: shape ?? {},
        ...normalizeParams(params),
    };
    return new ZodObject(def);
}
// looseObject
function looseObject(shape, params) {
    return new ZodObject({
        type: "object",
        shape,
        catchall: unknown(),
        ...normalizeParams(params),
    });
}
const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
});
function union(options, params) {
    return new ZodUnion({
        type: "union",
        options: options,
        ...normalizeParams(params),
    });
}
const ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
    ZodUnion.init(inst, def);
    $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
    // const [options, params] = args;
    return new ZodDiscriminatedUnion({
        type: "union",
        options: options,
        discriminator,
        ...normalizeParams(params),
    });
}
const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
    return new ZodIntersection({
        type: "intersection",
        left: left,
        right: right,
    });
}
const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodRecord.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
    // v3-compat: z.record(valueType, params?) — defaults keyType to z.string()
    if (!valueType || !valueType._zod) {
        return new ZodRecord({
            type: "record",
            keyType: string(),
            valueType: keyType,
            ...normalizeParams(valueType),
        });
    }
    return new ZodRecord({
        type: "record",
        keyType,
        valueType: valueType,
        ...normalizeParams(params),
    });
}
const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json);
    inst.enum = def.entries;
    // reuse the parsed value set so a numeric TS enum's reverse-mapping keys stay out
    inst.options = [...inst._zod.values];
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
        const newEntries = {};
        for (const value of values) {
            if (keys.has(value)) {
                newEntries[value] = def.entries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
    inst.exclude = (values, params) => {
        const newEntries = { ...def.entries };
        for (const value of values) {
            if (keys.has(value)) {
                delete newEntries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
});
function _enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new ZodEnum({
        type: "enum",
        entries,
        ...normalizeParams(params),
    });
}
const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
        get() {
            if (def.values.length > 1) {
                throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
            }
            return def.values[0];
        },
    });
});
function literal(value, params) {
    return new ZodLiteral({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...normalizeParams(params),
    });
}
const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
        if (_ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        payload.addIssue = (issue$1) => {
            if (typeof issue$1 === "string") {
                payload.issues.push(issue(issue$1, payload.value, def));
            }
            else {
                // for Zod 3 backwards compatibility
                const _issue = issue$1;
                if (_issue.fatal)
                    _issue.continue = false;
                _issue.code ?? (_issue.code = "custom");
                if (!("input" in _issue))
                    _issue.input = payload.value;
                _issue.inst ?? (_issue.inst = inst);
                // _issue.continue ??= true;
                payload.issues.push(issue(_issue));
            }
        };
        const output = def.transform(payload.value, payload);
        if (output instanceof Promise) {
            return output.then((output) => {
                payload.value = output;
                return payload;
            });
        }
        payload.value = output;
        return payload;
    };
});
function transform(fn) {
    return new ZodTransform({
        type: "transform",
        transform: fn,
    });
}
const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
    return new ZodOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
    return new ZodExactOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
    return new ZodNullable({
        type: "nullable",
        innerType: innerType,
    });
}
const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
    return new ZodDefault({
        type: "default",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
    return new ZodPrefault({
        type: "prefault",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
    return new ZodNonOptional({
        type: "nonoptional",
        innerType: innerType,
        ...normalizeParams(params),
    });
}
const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
    return new ZodCatch({
        type: "catch",
        innerType: innerType,
        catchValue: (typeof catchValue === "function" ? catchValue : constantCatch(catchValue)),
    });
}
const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
});
function pipe(in_, out) {
    return new ZodPipe({
        type: "pipe",
        in: in_,
        out: out,
        // ...util.normalizeParams(params),
    });
}
const ZodPreprocess = /*@__PURE__*/ $constructor("ZodPreprocess", (inst, def) => {
    ZodPipe.init(inst, def);
    $ZodPreprocess.init(inst, def);
});
const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
    return new ZodReadonly({
        type: "readonly",
        innerType: innerType,
    });
}
const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function custom(fn, _params) {
    return _custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
    return _refine(ZodCustom, fn, _params);
}
// superRefine
function superRefine(fn, params) {
    return _superRefine(fn, params);
}
// preprocess
function preprocess(fn, schema) {
    return new ZodPreprocess({
        type: "pipe",
        in: transform(fn),
        out: schema,
    });
}

export { ZodISODateTime as Z, _enum as _, literal as a, unknown as b, array as c, boolean as d, optional as e, discriminatedUnion as f, custom as g, _null as h, intersection as i, ZodOptional as j, looseObject as l, number as n, object as o, preprocess as p, record as r, string as s, union as u };
