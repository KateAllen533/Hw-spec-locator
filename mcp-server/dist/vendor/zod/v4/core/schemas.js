import { $ as $ZodCheck, a as $ZodCheckStringFormat, b as $ZodCheckNumberFormat } from './checks.js';
import { $ as $constructor, i as defineLazyInternal, k as globalConfig, l as aborted, m as cached, o as isObject, p as own, q as hide, a as $ZodAsyncError, r as explicitlyAborted, s as attachSchema, t as prefixIssues, u as assignProp, f as finalizeIssue, c as config, v as optionalKeys, w as allowsEval, x as esc, y as cleanRegex, z as rawShape, A as isPlainObject, B as getEnumValues, C as propertyKeyTypes, e as escapeRegex, D as $ZodEncodeError, E as sizeCaps, F as issue } from './runtime.js';
import { D as Doc } from './doc.js';
import { n as number, a as anyString, b as boolean, d as datetime, c as date, t as time, e as duration, f as email, g as guid, h as uuid, i as emoji, j as nanoid, k as nanoidOfLength, m as cuid, o as cuid2, p as ulid, x as xid, q as ksuid, r as ipv4, s as ipv6, v as cidrv4, w as cidrv6, y as e164, _ as _null, z as httpProtocol } from './regexes.js';
import { v as version } from './versions.js';

const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def; // set _def property
    inst._zod.bag = inst._zod.bag || {}; // initialize _bag object
    inst._zod.version = version;
    const defChecks = inst._zod.def.checks;
    // if inst is itself a checks.$ZodCheck, run it as a check
    const checks = inst._zod.traits.has("$ZodCheck")
        ? [inst, ...(defChecks ?? [])]
        : defChecks?.length
            ? [...defChecks]
            : [];
    for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
            fn(inst);
        }
    }
    if (checks.length === 0) {
        // deferred initializer inst._zod.parse is not yet defined
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        inst._zod.deferred?.push(() => {
            inst._zod.run = inst._zod.parse;
        });
    }
    else {
        const runChecks = (payload, checks, ctx) => {
            if (payload.memo)
                return payload;
            let isAborted = aborted(payload);
            let asyncResult;
            for (const ch of checks) {
                if (ch._zod.def.when) {
                    if (explicitlyAborted(payload))
                        continue;
                    const shouldRun = ch._zod.def.when(payload);
                    if (!shouldRun)
                        continue;
                }
                else if (isAborted) {
                    continue;
                }
                const currLen = payload.issues.length;
                const _ = ch._zod.check(payload);
                if (_ instanceof Promise && ctx?.async === false) {
                    throw new $ZodAsyncError();
                }
                if (asyncResult || _ instanceof Promise) {
                    asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                        await _;
                        const nextLen = payload.issues.length;
                        if (nextLen === currLen)
                            return;
                        attachSchema(payload.issues, currLen, inst);
                        if (!isAborted)
                            isAborted = aborted(payload, currLen);
                    });
                }
                else {
                    const nextLen = payload.issues.length;
                    if (nextLen === currLen)
                        continue;
                    attachSchema(payload.issues, currLen, inst);
                    if (!isAborted)
                        isAborted = aborted(payload, currLen);
                }
            }
            if (asyncResult) {
                return asyncResult.then(() => {
                    return payload;
                });
            }
            return payload;
        };
        const handleCanaryResult = (canary, payload, ctx) => {
            // abort if the canary is aborted
            if (aborted(canary)) {
                canary.aborted = true;
                return canary;
            }
            // run checks first, then
            const checkResult = runChecks(payload, checks, ctx);
            if (checkResult instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
            }
            return inst._zod.parse(checkResult, ctx);
        };
        inst._zod.run = (payload, ctx) => {
            if (ctx.skipChecks) {
                return inst._zod.parse(payload, ctx);
            }
            if (ctx.direction === "backward") {
                // run canary initial pass (no checks)
                const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
                if (canary instanceof Promise) {
                    return canary.then((canary) => {
                        return handleCanaryResult(canary, payload, ctx);
                    });
                }
                return handleCanaryResult(canary, payload, ctx);
            }
            // forward
            const result = inst._zod.parse(payload, ctx);
            if (result instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return result.then((result) => runChecks(result, checks, ctx));
            }
            return runChecks(result, checks, ctx);
        };
    }
}, {
    // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
    get "~standard"() {
        return hide(this, "~standard", standardProps(this));
    },
    set "~standard"(value) {
        own(this, "~standard", value);
    },
});
/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
// a Standard Schema result only reports issues, so a failure finalizes them straight off the raw payload: no ZodError, and no lazy result to read through
const toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync(inst, value) {
    const ctx = { async: true };
    return toStandardResult((await inst._zod.run({ value, issues: [] }, ctx)), ctx);
}
function standardProps(inst) {
    return {
        validate: (value) => {
            const ctx = { async: false };
            try {
                const r = inst._zod.run({ value, issues: [] }, ctx);
                if (!(r instanceof Promise))
                    return toStandardResult(r, ctx);
            }
            catch (_) { }
            // async function so a synchronously throwing check rejects instead of escaping validate
            return validateAsync(inst, value);
        },
        vendor: "zod",
        version: 1,
    };
}
const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    // a format's own pattern, else unbounded; a template literal derives the check-aware form itself
    inst._zod.pattern = def.pattern ?? anyString;
    inst._zod.parse = (payload, _) => {
        if (def.coerce)
            try {
                payload.value = String(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "string")
            return payload;
        payload.issues.push({
            expected: "string",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
    // check initialization must come first
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
});
const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
});
const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
        const versionMap = {
            v1: 1,
            v2: 2,
            v3: 3,
            v4: 4,
            v5: 5,
            v6: 6,
            v7: 7,
            v8: 8,
        };
        const v = versionMap[def.version];
        if (v === undefined)
            throw new Error(`Invalid UUID version: "${def.version}"`);
        def.pattern ?? (def.pattern = uuid(v));
    }
    else
        def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
});
const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
});
/** The `://` guard rejected the input before the URL constructor saw it. */
const URL_BAD_FORMAT = 1;
/** The URL parser rejected the input. */
const URL_UNPARSEABLE = 2;
function canParseURL(input) {
    try {
        if (typeof URL !== "undefined" && typeof URL.canParse === "function")
            return URL.canParse(input);
        new URL(input);
        return true;
    }
    catch {
        return false;
    }
}
function validateURL(trimmed, def) {
    if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
        return canParseURL(trimmed) || URL_UNPARSEABLE;
    }
    return parseURLObject(trimmed, def);
}
/** Parses a URL while preserving the non-normalizing HTTP guard. */
function parseURLObject(trimmed, def) {
    // When normalize is off, require :// for http/https URLs. This prevents strings like "http:example.com" or "https:/path" from being silently accepted
    if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
        return URL_BAD_FORMAT;
    }
    try {
        if (typeof URL !== "undefined") {
            const URLStatic = URL;
            if (typeof URLStatic.parse === "function")
                return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
        }
        // @ts-ignore
        return new URL(trimmed);
    }
    catch {
        return URL_UNPARSEABLE;
    }
}
const asciiTabOrNewline = /[\t\n\r]/g;
/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
function stripTabAndNewline(value) {
    return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
    hostname.lastIndex = 0;
    return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
    protocol.lastIndex = 0;
    return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        try {
            // Trim whitespace from input
            const trimmed = payload.value.trim();
            const url = validateURL(trimmed, def);
            if (url === URL_BAD_FORMAT) {
                payload.issues.push({
                    code: "invalid_format",
                    format: "url",
                    note: "Invalid URL format",
                    input: payload.value,
                    inst,
                    continue: !def.abort,
                });
                return;
            }
            if (url === URL_UNPARSEABLE) {
                payload.issues.push({
                    code: "invalid_format",
                    format: "url",
                    input: payload.value,
                    inst,
                    continue: !def.abort,
                });
                return;
            }
            if (url === true) {
                payload.value = stripTabAndNewline(trimmed);
                return;
            }
            if (def.hostname && !urlHostnameOk(url, def.hostname)) {
                payload.issues.push({
                    code: "invalid_format",
                    format: "url",
                    note: "Invalid hostname",
                    pattern: def.hostname.source,
                    input: payload.value,
                    inst,
                    continue: !def.abort,
                });
            }
            if (def.protocol && !urlProtocolOk(url, def.protocol)) {
                payload.issues.push({
                    code: "invalid_format",
                    format: "url",
                    note: "Invalid protocol",
                    pattern: def.protocol.source,
                    input: payload.value,
                    inst,
                    continue: !def.abort,
                });
            }
            // Set the output value based on normalize flag
            payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
            return;
        }
        catch (_) {
            payload.issues.push({
                code: "invalid_format",
                format: "url",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
    if (def.length !== undefined && (!Number.isInteger(def.length) || def.length < 1))
        throw new Error(`Invalid nanoid length: ${def.length}`);
    def.pattern ?? (def.pattern = def.length === undefined ? nanoid : nanoidOfLength(def.length));
    $ZodStringFormat.init(inst, def);
});
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
});
const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
});
const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
});
/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
    if (!ipv6Alphabet.test(value))
        return false;
    return canParseURL(`http://[${value}]`);
}
const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (!isValidIPv6(payload.value)) {
            payload.issues.push({
                code: "invalid_format",
                format: "ipv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
    const parts = value.split("/");
    if (parts.length !== 2)
        return false;
    const [address, prefix] = parts;
    if (!prefix)
        return false;
    const prefixNum = Number(prefix);
    if (`${prefixNum}` !== prefix)
        return false;
    if (prefixNum < 0 || prefixNum > 128)
        return false;
    return isValidIPv6(address);
}
const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6); // not used for validation
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (!isValidCIDRv6(payload.value)) {
            payload.issues.push({
                code: "invalid_format",
                format: "cidrv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
//////////////////////////////   ZodBase64   //////////////////////////////
function isValidBase64(data) {
    if (data === "")
        return true;
    // atob ignores whitespace, so reject it up front.
    if (/\s/.test(data))
        return false;
    if (data.length % 4 !== 0)
        return false;
    try {
        // @ts-ignore
        atob(data);
        return true;
    }
    catch {
        return false;
    }
}
// lax on purpose: the quantified regexes.base64 overflows the regex stack on multi-MB input and its leading ^$| alternation leaks through template-literal composition; isValidBase64 enforces length and padding
const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64Charset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (isValidBase64(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
//////////////////////////////   ZodBase64URL   //////////////////////////////
// lax on purpose: the quantified regexes.base64url overflows the regex stack on multi-MB input; isValidBase64 enforces length on the padded string
const base64urlCharset = /^[A-Za-z0-9_-]*$/;
function isValidBase64URL(data) {
    if (!base64urlCharset.test(data))
        return false;
    const base64 = data.replace(/[-_]/g, (c) => (c === "-" ? "+" : "/"));
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return isValidBase64(padded);
}
const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64urlCharset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (isValidBase64URL(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64url",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
});
//////////////////////////////   ZodJWT   //////////////////////////////
function isValidJWT(token, algorithm = null) {
    try {
        const tokensParts = token.split(".");
        if (tokensParts.length !== 3)
            return false;
        const [header] = tokensParts;
        if (!header)
            return false;
        // @ts-ignore
        const parsedHeader = JSON.parse(atob(header));
        if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
            return false;
        if (!parsedHeader.alg)
            return false;
        if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (isValidJWT(payload.value, def.alg))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "jwt",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = number;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Number(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
            return payload;
        }
        const received = typeof input === "number"
            ? Number.isNaN(input)
                ? "NaN"
                : !Number.isFinite(input)
                    ? String(input)
                    : undefined
            : undefined;
        payload.issues.push({
            expected: "number",
            code: "invalid_type",
            input,
            inst,
            ...(received ? { received } : {}),
        });
        return payload;
    };
});
const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def); // no format checks
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Boolean(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "boolean")
            return payload;
        payload.issues.push({
            expected: "boolean",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
const $ZodNull = /*@__PURE__*/ $constructor("$ZodNull", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = _null;
    inst._zod.values = new Set([null]);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (input === null)
            return payload;
        payload.issues.push({
            expected: "null",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
});
const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        payload.issues.push({
            expected: "never",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
// an oversized container fails its leading size checks before any element is parsed
function capSize(inst, size) {
    const caps = sizeCaps(inst._zod.def.checks);
    if (!caps.length)
        return;
    const cap = Math.min(...caps.map((c) => c[0]));
    const parse = inst._zod.parse;
    inst._zod.parse = (payload, ctx) => {
        const n = size(payload.value);
        if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
            for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
                if (n > max && ch._zod.def.when(payload)) {
                    const start = payload.issues.length;
                    ch._zod.check(payload);
                    // the value is still the raw input, so no later check may read it
                    payload.issues[start].continue = false;
                    attachSchema(payload.issues, start, inst);
                    return payload;
                }
            }
        }
        return parse(payload, ctx);
    };
}
const arraySize = (input) => (Array.isArray(input) ? input.length : -1);
function handleArrayResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    const memo = globalConfig.memoizer;
    memo?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                expected: "array",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
        const proms = [];
        const abortEarly = ctx?.abortEarly;
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const result = def.element._zod.run({
                value: item,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleArrayResult(result, payload, i)));
            }
            else {
                handleArrayResult(result, payload, i);
                // the element's payload is authoritative here, since handleArrayResult forwards every issue; an object's is not, because it drops a failed absent optional
                if (abortEarly && result.issues.length !== 0 && aborted(result))
                    break;
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload; //handleArrayResultsAsync(parseResults, final);
    };
    capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
    const isPresent = key in input;
    const isOptionalOut = optout === "optional";
    // The middle rung means "absence permitted, nothing supplied in its place", so an absent key contributes nothing — whatever the schema made of `undefined` is invented, not substituted. Only `optional` reaches this with a value: `defaulted` substitutes, and a schema that isn't optional-out has to keep the key.
    if (!isPresent && isOptionalOut && optin === "optional") {
        return;
    }
    if (result.issues.length) {
        // For optional-in/out schemas, ignore errors on absent keys.
        if (optin !== undefined && isOptionalOut && !isPresent) {
            return;
        }
        final.issues.push(...prefixIssues(key, result.issues));
    }
    if (!isPresent && optin === undefined) {
        if (!result.issues.length) {
            final.issues.push({
                code: "invalid_type",
                expected: "nonoptional",
                input: undefined,
                path: [key],
            });
        }
        return;
    }
    if (result.value === undefined) {
        if (isPresent || (optin === "defaulted" && !isOptionalOut)) {
            final.value[key] = undefined;
        }
    }
    else {
        final.value[key] = result.value;
    }
}
// one shared instance; a fresh [] per schema cost 56 bytes retained
const NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
    const keys = Object.keys(def.shape);
    const ownSymbols = Object.getOwnPropertySymbols(def.shape);
    const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
    // aliases `keys` when there are no symbols, so a string-only shape keeps one array
    const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
    for (const k of allKeys) {
        if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
            throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
        }
    }
    const okeys = optionalKeys(def.shape);
    return {
        ...def,
        allKeys,
        symbolKeys,
        // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
        keySet: new Set(keys),
        numKeys: keys.length,
        optionalKeys: new Set(okeys),
    };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
    const unrecognized = [];
    const keySet = def.keySet;
    const _catchall = def.catchall._zod;
    const t = _catchall.def.type;
    const optin = _catchall.optin;
    const optout = _catchall.optout;
    // starts at 0, not the current length: the shape phase already ran and may have aborted
    let seen = 0;
    for (const key in input) {
        if (abortEarly && payload.issues.length !== seen) {
            if (aborted(payload, seen))
                break;
            seen = payload.issues.length;
        }
        // Must precede the __proto__ branch: a declared key is not unrecognized, even though the shape loop deliberately strips __proto__ from the parsed output.
        if (keySet.has(key))
            continue;
        // Don't copy an undeclared __proto__ into the result; assignment to a plain {} would replace the result prototype. But in strict mode it is still an unknown key, so report it before skipping.
        if (key === "__proto__") {
            if (t === "never")
                unrecognized.push(key);
            continue;
        }
        if (t === "never") {
            unrecognized.push(key);
            continue;
        }
        const r = _catchall.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
            proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
        }
        else {
            handlePropertyResult(r, payload, key, input, optin, optout);
        }
    }
    if (unrecognized.length) {
        payload.issues.push({
            code: "unrecognized_keys",
            keys: unrecognized,
            input,
            inst,
            // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
            continue: true,
        });
    }
    if (!proms.length)
        return payload;
    return Promise.all(proms).then(() => {
        return payload;
    });
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodType.init(inst, def);
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    // a cloned def carries its source's accessor, which knows the shape it answers from; adopting that keeps the clone's keys readable without running it
    const sh = desc?.get ? desc.get.raw : (def.shape ?? {});
    if (sh) {
        // Freezes the shape on first read, so its getters resolve once and every later read sees the same schemas.
        const get = () => {
            const newSh = { ...sh };
            Object.defineProperty(def, "shape", { value: newSh });
            get.raw = newSh;
            return newSh;
        };
        get.raw = sh;
        Object.defineProperty(def, "shape", { get });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazyInternal(inst, "propValues", (zod) => {
        const shape = zod.def.shape;
        const propValues = {};
        for (const key in shape) {
            const field = shape[key]._zod;
            if (field.values) {
                if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
                    assignProp(propValues, key, new Set());
                }
                for (const v of field.values)
                    propValues[key].add(v);
                // An omittable slot reads back as undefined at a discriminator lookup, so it has to claim undefined: two options that can both omit the key are not discriminable on it.
                if (field.optin !== undefined)
                    propValues[key].add(undefined);
            }
        }
        return propValues;
    });
    const isObject$1 = isObject;
    const catchall = def.catchall;
    let value;
    const memo = globalConfig.memoizer;
    memo?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject$1(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
        const proms = [];
        const shape = value.shape;
        const abortEarly = ctx?.abortEarly;
        let seen = payload.issues.length;
        for (const key of value.allKeys) {
            if (abortEarly && payload.issues.length !== seen) {
                if (aborted(payload, seen))
                    break;
                seen = payload.issues.length;
            }
            if (key === "__proto__")
                continue;
            const el = shape[key];
            const optin = el._zod.optin;
            const optout = el._zod.optout;
            const r = el._zod.run({ value: input[key], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
            }
            else {
                handlePropertyResult(r, payload, key, input, optin, optout);
            }
        }
        if (!catchall) {
            return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
    };
});
const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const memo = globalConfig.memoizer;
    const generateFastpass = (shape) => {
        const normalized = _normalized.value;
        const syms = normalized.symbolKeys;
        // a symbol has no source literal, so it is read as `syms[i]` off the closed-over scope
        const doc = new Doc(["payload", "ctx"], { shape, inst, memo, syms });
        const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        // prefixes in place, like util.prefixIssues. newResult must land before the early return: a catchall runs after this and would otherwise write onto the caller's input
        const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
        doc.write(`const input = payload.value;`);
        const ids = Object.create(null);
        let counter = 0;
        for (const key of normalized.allKeys) {
            ids[key] = `key_${counter++}`;
        }
        // A: preserve key order {
        doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
        for (const key of normalized.allKeys) {
            if (key === "__proto__")
                continue;
            const id = ids[key];
            const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
            const isPresent = `${k} in input`;
            const schema = shape[key];
            const optin = schema?._zod?.optin;
            const isOptionalIn = optin !== undefined;
            const isOptionalOut = schema?._zod?.optout === "optional";
            doc.write(`const ${id} = ${parseStr(k)};`);
            if (isOptionalIn && isOptionalOut) {
                // For optional-in/out schemas, ignore errors on absent keys — and, like the interpreted path, drop the value produced alongside them. The middle rung goes further: it permits absence without supplying anything in its place, so an absent key contributes nothing at all.
                const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
                doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
            }
            else if (!isOptionalIn) {
                doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
            }
            else {
                doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
                if (optin === "defaulted") {
                    doc.write(`newResult[${k}] = ${id}.value;`);
                }
                else {
                    doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
                }
            }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        // closing `shape` in is what pays: turbofan specializes the parser against that one shape object, so every `shape[k]._zod.run` folds to a known callee. as a parameter it stays a generic load and measures 13% slower even with the forwarding frame gone
        return doc.compile();
    };
    let fastpass;
    const isObject$1 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval$1 = allowsEval;
    const fastEnabled = jit && allowsEval$1.value; // && !def.catchall;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject$1(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
            // always synchronous
            if (!fastpass)
                fastpass = generateFastpass(def.shape);
            payload = fastpass(payload, ctx);
            if (!catchall)
                return payload;
            return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
        }
        return superParse(payload, ctx);
    };
});
function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
        if (result.issues.length === 0) {
            final.value = result.value;
            return final;
        }
    }
    const nonaborted = results.filter((r) => !aborted(r));
    if (nonaborted.length === 1) {
        final.value = nonaborted[0].value;
        return nonaborted[0];
    }
    final.issues.push({
        code: "invalid_union",
        input: final.value,
        inst,
        errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
    });
    return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted")
        ? "defaulted"
        : zod.def.options.some((o) => o._zod.optin !== undefined)
            ? "optional"
            : undefined);
    defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazyInternal(inst, "values", (zod) => {
        if (zod.def.options.every((o) => o._zod.values)) {
            return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return undefined;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
        if (zod.def.options.every((o) => o._zod.pattern)) {
            const patterns = zod.def.options.map((o) => o._zod.pattern);
            return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return undefined;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
        if (first) {
            return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                if (result.issues.length === 0)
                    return result;
                results.push(result);
            }
        }
        if (!async)
            return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleUnionResults(results, payload, inst, ctx);
        });
    };
});
function discriminatorMap(def) {
    const map = new Map();
    for (const option of def.options) {
        const values = option._zod.propValues?.[def.discriminator];
        if (!values || values.size === 0)
            throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
        for (const value of values) {
            if (map.has(value)) {
                if (value !== undefined)
                    throw new Error(`Duplicate discriminator value "${String(value)}"`);
                // keep the collision marked so a later member cannot reclaim it
                map.set(value, null);
            }
            else {
                map.set(value, option);
            }
        }
    }
    return map;
}
const $ZodDiscriminatedUnion = 
/*@__PURE__*/
$constructor("$ZodDiscriminatedUnion", (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    defineLazyInternal(inst, "propValues", (zod) => {
        const propValues = {};
        let undefinedCount = 0;
        for (const option of zod.def.options) {
            const pv = option._zod.propValues;
            if (!pv || Object.keys(pv).length === 0)
                throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
            if (pv[zod.def.discriminator]?.has(undefined))
                undefinedCount++;
            for (const [k, v] of Object.entries(pv)) {
                if (!Object.prototype.hasOwnProperty.call(propValues, k)) {
                    assignProp(propValues, k, new Set());
                }
                for (const val of v) {
                    propValues[k].add(val);
                }
            }
        }
        if (!zod.def.unionFallback && undefinedCount > 1)
            propValues[zod.def.discriminator]?.delete(undefined);
        return propValues;
    });
    // Checked now rather than in the lookup map below, so an option that lacks the discriminator fails at the `discriminatedUnion` call instead of on the first object parsed. Options whose shape cannot be enumerated without resolving it — pipes and lazies — are left to the map.
    def.options.forEach((option, i) => {
        const propShape = rawShape(option._zod.def);
        if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
            throw new Error(`Invalid discriminated union option at index "${i}"`);
        }
    });
    const disc = cached(() => discriminatorMap(def));
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                code: "invalid_type",
                expected: "object",
                input,
                inst,
            });
            return payload;
        }
        const value = input?.[def.discriminator];
        const opt = disc.value.get(value);
        // forward metadata cannot choose an encoder for an absent tag
        if (opt && (value !== undefined || ctx.direction !== "backward")) {
            return opt._zod.run(payload, ctx);
        }
        // Fall back to union matching when the fast discriminator path fails:
        // - explicitly enabled via unionFallback, or
        // - during backward direction (encode), since codec-based discriminators have different values in forward vs backward directions
        if (def.unionFallback || ctx.direction === "backward") {
            return _super(payload, ctx);
        }
        // no matching discriminator
        payload.issues.push({
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: def.discriminator,
            options: Array.from(disc.value.keys()).filter((value) => disc.value.get(value) !== null),
            input,
            path: [def.discriminator],
            inst,
        });
        return payload;
    };
});
const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        const left = def.left._zod.run({ value: input, issues: [] }, ctx);
        const right = def.right._zod.run({ value: input, issues: [] }, ctx);
        const async = left instanceof Promise || right instanceof Promise;
        if (async) {
            return Promise.all([left, right]).then(([left, right]) => {
                return handleIntersectionResults(payload, left, right);
            });
        }
        return handleIntersectionResults(payload, left, right);
    };
});
function mergeValues(a, b) {
    // const aType = parse.t(a);
    // const bType = parse.t(b);
    if (a === b) {
        return { valid: true, data: a };
    }
    if (a instanceof Date && b instanceof Date && +a === +b) {
        return { valid: true, data: a };
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const bKeys = Object.keys(b);
        const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
        const newObj = { ...a, ...b };
        if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
            delete newObj.__proto__;
        for (const key of sharedKeys) {
            if (key === "__proto__")
                continue;
            const sharedValue = mergeValues(a[key], b[key]);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [key, ...sharedValue.mergeErrorPath],
                };
            }
            newObj[key] = sharedValue.data;
        }
        return { valid: true, data: newObj };
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return { valid: false, mergeErrorPath: [] };
        }
        const newArray = [];
        for (let index = 0; index < a.length; index++) {
            const itemA = a[index];
            const itemB = b[index];
            const sharedValue = mergeValues(itemA, itemB);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [index, ...sharedValue.mergeErrorPath],
                };
            }
            newArray.push(sharedValue.data);
        }
        return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
    // Track which side(s) reject each key. A key rejection is reported only when BOTH sides reject it, so a key owned by one branch survives the other's key schema. strictObject reports these as unrecognized_keys; a record with an open key schema reports one invalid_key per key.
    const unrecKeys = new Map();
    let unrecIssue;
    const keyIssues = new Map();
    const collect = (iss, side) => {
        let keys;
        if (iss.code === "unrecognized_keys" && !iss.path?.length) {
            unrecIssue ?? (unrecIssue = iss);
            keys = iss.keys;
        }
        else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
            const k = String(iss.path[0]);
            if (!keyIssues.has(k))
                keyIssues.set(k, iss);
            keys = [k];
        }
        else {
            return false;
        }
        for (const k of keys) {
            if (!unrecKeys.has(k))
                unrecKeys.set(k, {});
            unrecKeys.get(k)[side] = true;
        }
        return true;
    };
    for (const iss of left.issues) {
        if (!collect(iss, "l"))
            result.issues.push(iss);
    }
    for (const iss of right.issues) {
        if (!collect(iss, "r"))
            result.issues.push(iss);
    }
    // Report only keys rejected by BOTH sides
    const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
    if (bothKeys.length) {
        const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
        if (aggregated.length)
            result.issues.push({ ...unrecIssue, keys: aggregated });
        for (const k of bothKeys) {
            if (!aggregated.includes(k) && keyIssues.has(k))
                result.issues.push(keyIssues.get(k));
        }
    }
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
        if (aborted(result))
            return result;
        throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
}
const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
    $ZodType.init(inst, def);
    const memo = globalConfig.memoizer;
    memo?.attach(inst);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isPlainObject(input)) {
            payload.issues.push({
                expected: "record",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        // no guard in either loop below: a record's invalid_key aborts but an enclosing intersection can reconcile it, so a stopped loop hides keys the sibling does not own and the intersection then rejects nothing
        const proms = [];
        const values = def.keyType._zod.values;
        if (values && !def.partial) {
            payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
            const recordKeys = new Set();
            for (const key of values) {
                if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
                    recordKeys.add(typeof key === "number" ? key.toString() : key);
                    // A declared __proto__ is stripped but is not an unrecognized key.
                    if (key === "__proto__")
                        continue;
                    const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                    if (keyResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (keyResult.issues.length) {
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                        continue;
                    }
                    const outKey = keyResult.value;
                    if (outKey === "__proto__")
                        continue;
                    const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                    if (result instanceof Promise) {
                        proms.push(result.then((result) => {
                            if (result.issues.length) {
                                payload.issues.push(...prefixIssues(key, result.issues));
                            }
                            payload.value[outKey] = result.value;
                        }));
                    }
                    else {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[outKey] = result.value;
                    }
                }
            }
            let unrecognized;
            for (const key in input) {
                if (!recordKeys.has(key)) {
                    if (def.mode === "loose") {
                        // skip __proto__ so it can't replace the result prototype via the assignment setter on the plain {} we build into
                        if (key === "__proto__")
                            continue;
                        payload.value[key] = input[key];
                    }
                    else {
                        unrecognized = unrecognized ?? [];
                        unrecognized.push(key);
                    }
                }
            }
            if (unrecognized && unrecognized.length > 0) {
                payload.issues.push({
                    code: "unrecognized_keys",
                    input,
                    inst,
                    keys: unrecognized,
                    continue: true,
                });
            }
        }
        else {
            payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
            // An enumerable key schema declares which keys the record owns, so a key outside the set is unrecognized. A non-enumerable one (regex, refine) is a constraint every key must satisfy, so a failing key is invalid. Only the former is reconcilable against the other side of an intersection.
            let unrecognized;
            // Reflect.ownKeys for Symbol-key support; filter non-enumerable to match z.object()
            for (const key of Reflect.ownKeys(input)) {
                if (key === "__proto__")
                    continue;
                if (!Object.prototype.propertyIsEnumerable.call(input, key))
                    continue;
                let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                if (keyResult instanceof Promise) {
                    throw new Error("Async schemas not supported in object keys currently");
                }
                // Numeric string fallback: if key is a numeric string and failed, retry with Number(key). This handles z.number(), z.literal([1, 2, 3]), and unions containing numeric literals
                const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
                if (checkNumericKey) {
                    const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
                    if (retryResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (retryResult.issues.length === 0) {
                        keyResult = retryResult;
                    }
                }
                if (keyResult.issues.length) {
                    if (def.mode === "loose") {
                        // Pass through unchanged
                        payload.value[key] = input[key];
                    }
                    else if (values) {
                        unrecognized = unrecognized ?? [];
                        unrecognized.push(key);
                    }
                    else {
                        // Default "strict" behavior: error on invalid key
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                    }
                    continue;
                }
                // the guard above tests the raw input key, but the key schema can normalize an ordinary key into __proto__; re-check the key we actually write under
                const outKey = keyResult.value;
                if (outKey === "__proto__")
                    continue;
                const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                if (result instanceof Promise) {
                    proms.push(result.then((result) => {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[outKey] = result.value;
                    }));
                }
                else {
                    if (result.issues.length) {
                        payload.issues.push(...prefixIssues(key, result.issues));
                    }
                    payload.value[outKey] = result.value;
                }
            }
            if (unrecognized && unrecognized.length > 0) {
                payload.issues.push({
                    code: "unrecognized_keys",
                    input,
                    inst,
                    keys: unrecognized,
                    continue: true,
                });
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload;
    };
});
const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    defineLazyInternal(inst, "pattern", (zod) => {
        const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
        // unmatchable fallback, RE2-safe: an empty alternation would compile to /^()$/, which matches ""
        return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (valuesSet.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    const values = new Set(def.values);
    inst._zod.values = values;
    defineLazyInternal(inst, "pattern", (zod) => {
        const vals = zod.def.values;
        // unmatchable fallback, RE2-safe: an empty alternation would compile to /^()$/, which matches ""
        return new RegExp(vals.length
            ? `^(${vals
                .map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o))
                .join("|")})$`
            : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (values.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values: def.values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    globalConfig.memoizer?.guard(inst);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        const _out = def.transform(payload.value, payload);
        if (ctx.async) {
            const output = _out instanceof Promise ? _out : Promise.resolve(_out);
            return output.then((output) => {
                payload.value = output;
                return payload;
            });
        }
        if (_out instanceof Promise) {
            throw new $ZodAsyncError();
        }
        payload.value = _out;
        return payload;
    };
});
function handleOptionalResult(payload, result) {
    // A substituting schema that still failed has no usable answer; yield undefined. Its issues are simply dropped: it ran on a payload of its own, so there is no shared array to truncate and nothing of the caller's to lose with it.
    payload.value = result.issues.length ? undefined : result.value;
    return payload;
}
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    // .optional() propagates absence rather than substituting for it, so a defaulted inner keeps its rung.
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    inst._zod.optout = "optional";
    defineLazyInternal(inst, "values", (zod) => {
        const values = zod.def.innerType._zod.values;
        return values ? new Set([...values, undefined]) : undefined;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
        const pattern = zod.def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        if (payload.value === undefined) {
            // Only the top rung substitutes a value for absence; everything else leaves it intact, which is what .optional() means.
            if (def.innerType._zod.optin !== "defaulted")
                return payload;
            // Its own payload, for the same reason $ZodCatch gets one: a pipe forwards an unrecognized key through the caller's issues array, and this must not read that as the substituting schema failing and drop it.
            const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
            if (result instanceof Promise)
                return result.then((result) => handleOptionalResult(payload, result));
            return handleOptionalResult(payload, result);
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
    // Call parent init - inherits optin/optout = "optional"
    $ZodOptional.init(inst, def);
    // Override values/pattern to NOT add undefined
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
    // Override parse to just delegate (no undefined handling)
    inst._zod.parse = (payload, ctx) => {
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "pattern", (zod) => {
        const pattern = zod.def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
    });
    defineLazyInternal(inst, "values", (zod) => {
        return zod.def.innerType._zod.values ? new Set([...zod.def.innerType._zod.values, null]) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        // Forward direction (decode): allow null to pass through
        if (payload.value === null)
            return payload;
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    // inst._zod.qin = "true";
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply defaults for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
            /**
             * $ZodDefault returns the default value immediately in forward direction.
             * It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
            return payload;
        }
        // Forward direction: continue with default handling
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleDefaultResult(result, def));
        }
        return handleDefaultResult(result, def);
    };
});
function handleDefaultResult(payload, def) {
    if (payload.value === undefined) {
        payload.value = def.defaultValue;
    }
    return payload;
}
const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply prefault for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => {
        const v = zod.def.innerType._zod.values;
        return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleNonOptionalResult(result, inst));
        }
        return handleNonOptionalResult(result, inst);
    };
});
function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === undefined) {
        payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: payload.value,
            inst,
        });
    }
    return payload;
}
function handleCatchResult(payload, result, def, ctx) {
    if (!result.issues.length) {
        payload.value = result.value;
        // The value carries up, so the flag describing it has to carry with it: a back-edge into a node still being parsed must not be frozen by an enclosing readonly, and its checks belong to the node itself. Guarded so the ordinary case adds no own property.
        if (result.memo)
            payload.memo = true;
        return payload;
    }
    // Spread the inner's own payload, not ours: `value` has to stay the input the catch was handed, and the inner ran on a payload of its own so its issues are already private to this call.
    payload.value = def.catchValue({
        ...result,
        value: payload.value,
        error: {
            issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
        },
        input: payload.value,
    });
    return payload;
}
const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply catch logic
        const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleCatchResult(payload, result, def, ctx));
        }
        return handleCatchResult(payload, result, def, ctx);
    };
});
const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            const right = def.out._zod.run(payload, ctx);
            if (right instanceof Promise) {
                return right.then((right) => handlePipeResult(right, def.in, ctx));
            }
            return handlePipeResult(right, def.in, ctx);
        }
        const left = def.in._zod.run(payload, ctx);
        if (left instanceof Promise) {
            return left.then((left) => handlePipeResult(left, def.out, ctx));
        }
        return handlePipeResult(left, def.out, ctx);
    };
});
function handlePipeResult(left, next, ctx) {
    // Any issue stops the pipe, so a failing refinement never feeds its transform. An unrecognized key is the exception: it describes the input's extra properties, not the value being piped, and an enclosing intersection may yet reconcile it.
    if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
        // prevent further checks
        left.aborted = true;
        return left;
    }
    return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
const $ZodPreprocess = /*@__PURE__*/ $constructor("$ZodPreprocess", (inst, def) => {
    $ZodPipe.init(inst, def);
});
const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then(handleReadonlyResult);
        }
        return handleReadonlyResult(result);
    };
});
function handleReadonlyResult(payload) {
    // A repeat visit hands back a node that is still being built; freezing it here would make the rest of its keys fail to assign.
    if (!payload.memo)
        payload.value = Object.freeze(payload.value);
    return payload;
}
const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
        return payload;
    };
    inst._zod.check = (payload) => {
        const input = payload.value;
        const r = def.fn(input);
        if (r instanceof Promise) {
            return r.then((r) => handleRefineResult(r, payload, input, inst));
        }
        handleRefineResult(r, payload, input, inst);
        return;
    };
});
function handleRefineResult(result, payload, input, inst) {
    if (!result) {
        const _iss = {
            code: "custom",
            input,
            inst, // incorporates params.error into issue reporting
            path: [...(inst._zod.def.path ?? [])], // incorporates params.error into issue reporting
            continue: !inst._zod.def.abort,
            // params: inst._zod.def.params,
        };
        if (inst._zod.def.params)
            _iss.params = inst._zod.def.params;
        payload.issues.push(issue(_iss));
    }
}

export { $ZodObjectJIT as $, $ZodPrefault as A, $ZodDefault as B, $ZodNullable as C, $ZodISODate as D, $ZodISOTime as E, $ZodISODuration as F, $ZodEmail as G, $ZodGUID as H, $ZodUUID as I, $ZodURL as J, $ZodEmoji as K, $ZodNanoID as L, $ZodCUID as M, $ZodCUID2 as N, $ZodULID as O, $ZodXID as P, $ZodKSUID as Q, $ZodIPv4 as R, $ZodIPv6 as S, $ZodCIDRv4 as T, $ZodCIDRv6 as U, $ZodBase64 as V, $ZodBase64URL as W, $ZodE164 as X, $ZodJWT as Y, $ZodNull as Z, $ZodNumberFormat as _, base64urlCharset as a, $ZodNever as a0, $ZodObject as a1, base64Charset as b, $ZodUnion as c, $ZodDiscriminatedUnion as d, $ZodIntersection as e, $ZodRecord as f, $ZodEnum as g, $ZodLiteral as h, $ZodTransform as i, $ZodOptional as j, $ZodExactOptional as k, $ZodNonOptional as l, $ZodPreprocess as m, $ZodString as n, $ZodNumber as o, $ZodBoolean as p, $ZodUnknown as q, $ZodArray as r, standardProps as s, $ZodType as t, $ZodPipe as u, $ZodCustom as v, $ZodISODateTime as w, $ZodStringFormat as x, $ZodReadonly as y, $ZodCatch as z };
