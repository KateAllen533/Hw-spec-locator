/**
 * Expression - Parses and stores a tag pattern expression
 * 
 * Patterns are parsed once and stored in an optimized structure for fast matching.
 * 
 * @example
 * const expr = new Expression("root.users.user");
 * const expr2 = new Expression("..user[id]:first");
 * const expr3 = new Expression("root/users/user", { separator: '/' });
 */
class Expression {
  /**
   * Create a new Expression
   * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Path separator (default: '.')
   */
  constructor(pattern, options = {}, data) {
    this.pattern = pattern;
    this.separator = options.separator || '.';
    this.segments = this._parse(pattern);
    this.data = data;
    // Cache expensive checks for performance (O(1) instead of O(n))
    this._hasDeepWildcard = this.segments.some(seg => seg.type === 'deep-wildcard');
    this._hasAttributeCondition = this.segments.some(seg => seg.attrName !== undefined);
    this._hasPositionSelector = this.segments.some(seg => seg.position !== undefined);
  }

  /**
   * Parse pattern string into segments
   * @private
   * @param {string} pattern - Pattern to parse
   * @returns {Array} Array of segment objects
   */
  _parse(pattern) {
    const segments = [];

    // Split by separator but handle ".." specially
    let i = 0;
    let currentPart = '';

    while (i < pattern.length) {
      if (pattern[i] === this.separator) {
        // Check if next char is also separator (deep wildcard)
        if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
          // Flush current part if any
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
            currentPart = '';
          }
          // Add deep wildcard
          segments.push({ type: 'deep-wildcard' });
          i += 2; // Skip both separators
        } else {
          // Regular separator
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
          }
          currentPart = '';
          i++;
        }
      } else {
        currentPart += pattern[i];
        i++;
      }
    }

    // Flush remaining part
    if (currentPart.trim()) {
      segments.push(this._parseSegment(currentPart.trim()));
    }

    return segments;
  }

  /**
   * Parse a single segment
   * @private
   * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
   * @returns {Object} Segment object
   */
  _parseSegment(part) {
    const segment = { type: 'tag' };

    // NEW NAMESPACE SYNTAX (v2.0):
    // ============================
    // Namespace uses DOUBLE colon (::)
    // Position uses SINGLE colon (:)
    // 
    // Examples:
    //   "user"              → tag
    //   "user:first"        → tag + position
    //   "user[id]"          → tag + attribute
    //   "user[id]:first"    → tag + attribute + position
    //   "ns::user"          → namespace + tag
    //   "ns::user:first"    → namespace + tag + position
    //   "ns::user[id]"      → namespace + tag + attribute
    //   "ns::user[id]:first" → namespace + tag + attribute + position
    //   "ns::first"         → namespace + tag named "first" (NO ambiguity!)
    //
    // This eliminates all ambiguity:
    //   :: = namespace separator
    //   :  = position selector
    //   [] = attributes

    // Step 1: Extract brackets [attr] or [attr=value]
    let bracketContent = null;
    let withoutBrackets = part;

    const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (bracketMatch) {
      withoutBrackets = bracketMatch[1] + bracketMatch[3];
      if (bracketMatch[2]) {
        const content = bracketMatch[2].slice(1, -1);
        if (content) {
          bracketContent = content;
        }
      }
    }

    // Step 2: Check for namespace (double colon ::)
    let namespace = undefined;
    let tagAndPosition = withoutBrackets;

    if (withoutBrackets.includes('::')) {
      const nsIndex = withoutBrackets.indexOf('::');
      namespace = withoutBrackets.substring(0, nsIndex).trim();
      tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim(); // Skip ::

      if (!namespace) {
        throw new Error(`Invalid namespace in pattern: ${part}`);
      }
    }

    // Step 3: Parse tag and position (single colon :)
    let tag = undefined;
    let positionMatch = null;

    if (tagAndPosition.includes(':')) {
      const colonIndex = tagAndPosition.lastIndexOf(':'); // Use last colon for position
      const tagPart = tagAndPosition.substring(0, colonIndex).trim();
      const posPart = tagAndPosition.substring(colonIndex + 1).trim();

      // Verify position is a valid keyword
      const isPositionKeyword = ['first', 'last', 'odd', 'even'].includes(posPart) ||
        /^nth\(\d+\)$/.test(posPart);

      if (isPositionKeyword) {
        tag = tagPart;
        positionMatch = posPart;
      } else {
        // Not a valid position keyword, treat whole thing as tag
        tag = tagAndPosition;
      }
    } else {
      tag = tagAndPosition;
    }

    if (!tag) {
      throw new Error(`Invalid segment pattern: ${part}`);
    }

    segment.tag = tag;
    if (namespace) {
      segment.namespace = namespace;
    }

    // Step 4: Parse attributes
    if (bracketContent) {
      if (bracketContent.includes('=')) {
        const eqIndex = bracketContent.indexOf('=');
        segment.attrName = bracketContent.substring(0, eqIndex).trim();
        segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
      } else {
        segment.attrName = bracketContent.trim();
      }
    }

    // Step 5: Parse position selector
    if (positionMatch) {
      const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
      if (nthMatch) {
        segment.position = 'nth';
        segment.positionValue = parseInt(nthMatch[1], 10);
      } else {
        segment.position = positionMatch;
      }
    }

    return segment;
  }

  /**
   * Get the number of segments
   * @returns {number}
   */
  get length() {
    return this.segments.length;
  }

  /**
   * Check if expression contains deep wildcard
   * @returns {boolean}
   */
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }

  /**
   * Check if expression has attribute conditions
   * @returns {boolean}
   */
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }

  /**
   * Check if expression has position selectors
   * @returns {boolean}
   */
  hasPositionSelector() {
    return this._hasPositionSelector;
  }

  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return this.pattern;
  }
}

/**
 * ExpressionSet - An indexed collection of Expressions for efficient bulk matching
 *
 * Instead of iterating all expressions on every tag, ExpressionSet pre-indexes
 * them at insertion time by depth and terminal tag name. At match time, only
 * the relevant bucket is evaluated — typically reducing checks from O(E) to O(1)
 * lookup plus O(small bucket) matches.
 *
 * Three buckets are maintained:
 *  - `_byDepthAndTag`  — exact depth + exact tag name  (tightest, used first)
 *  - `_wildcardByDepth` — exact depth + wildcard tag `*` (depth-matched only)
 *  - `_deepWildcards`  — expressions containing `..`  (cannot be depth-indexed)
 *
 * @example
 * import { Expression, ExpressionSet } from 'fast-xml-tagger';
 *
 * // Build once at config time
 * const stopNodes = new ExpressionSet();
 * stopNodes.add(new Expression('root.users.user'));
 * stopNodes.add(new Expression('root.config.setting'));
 * stopNodes.add(new Expression('..script'));
 *
 * // Query on every tag — hot path
 * if (stopNodes.matchesAny(matcher)) { ... }
 */
class ExpressionSet {
  constructor() {
    /** @type {Map<string, import('./Expression.js').default[]>} depth:tag → expressions */
    this._byDepthAndTag = new Map();

    /** @type {Map<number, import('./Expression.js').default[]>} depth → wildcard-tag expressions */
    this._wildcardByDepth = new Map();

    /** @type {import('./Expression.js').default[]} expressions containing deep wildcard (..) */
    this._deepWildcards = [];

    /** @type {Map<string, import('./Expression.js').default[]>} terminalTag → deep wildcard expressions */
    this._deepByTerminalTag = new Map();

    /** @type {Set<string>} pattern strings already added — used for deduplication */
    this._patterns = new Set();

    /** @type {boolean} whether the set is sealed against further additions */
    this._sealed = false;
  }

  /**
   * Add an Expression to the set.
   * Duplicate patterns (same pattern string) are silently ignored.
   *
   * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
   * @returns {this} for chaining
   * @throws {TypeError} if called after seal()
   *
   * @example
   * set.add(new Expression('root.users.user'));
   * set.add(new Expression('..script'));
   */
  add(expression) {
    if (this._sealed) {
      throw new TypeError(
        'ExpressionSet is sealed. Create a new ExpressionSet to add more expressions.'
      );
    }

    // Deduplicate by pattern string
    if (this._patterns.has(expression.pattern)) return this;
    this._patterns.add(expression.pattern);

    if (expression.hasDeepWildcard()) {
      const lastSeg = expression.segments[expression.segments.length - 1];
      if (lastSeg && lastSeg.type !== 'deep-wildcard' && lastSeg.tag !== '*') {
        const tag = lastSeg.tag;
        if (!this._deepByTerminalTag.has(tag)) this._deepByTerminalTag.set(tag, []);
        this._deepByTerminalTag.get(tag).push(expression);
      } else {
        this._deepWildcards.push(expression);
      }
      return this;
    }

    const depth = expression.length;
    const lastSeg = expression.segments[expression.segments.length - 1];
    const tag = lastSeg?.tag;

    if (!tag || tag === '*') {
      // Can index by depth but not by tag
      if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
      this._wildcardByDepth.get(depth).push(expression);
    } else {
      // Tightest bucket: depth + tag
      const key = `${depth}:${tag}`;
      if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
      this._byDepthAndTag.get(key).push(expression);
    }

    return this;
  }

  /**
   * Add multiple expressions at once.
   *
   * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
   * @returns {this} for chaining
   *
   * @example
   * set.addAll([
   *   new Expression('root.users.user'),
   *   new Expression('root.config.setting'),
   * ]);
   */
  addAll(expressions) {
    for (const expr of expressions) this.add(expr);
    return this;
  }

  /**
   * Check whether a pattern string is already present in the set.
   *
   * @param {import('./Expression.js').default} expression
   * @returns {boolean}
   */
  has(expression) {
    return this._patterns.has(expression.pattern);
  }

  /**
   * Number of expressions in the set.
   * @type {number}
   */
  get size() {
    return this._patterns.size;
  }

  /**
   * Seal the set against further modifications.
   * Useful to prevent accidental mutations after config is built.
   * Calling add() or addAll() on a sealed set throws a TypeError.
   *
   * @returns {this}
   */
  seal() {
    this._sealed = true;
    return this;
  }

  /**
   * Whether the set has been sealed.
   * @type {boolean}
   */
  get isSealed() {
    return this._sealed;
  }

  /**
   * Test whether the matcher's current path matches any expression in the set.
   *
   * Evaluation order (cheapest → most expensive):
   *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
   *  2. Depth-only wildcard bucket — O(1) lookup, rare
   *  3. Deep-wildcard list         — always checked, but usually small
   *
   * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
   * @returns {boolean} true if any expression matches the current path
   *
   * @example
   * if (stopNodes.matchesAny(matcher)) {
   *   // handle stop node
   * }
   */
  matchesAny(matcher) {
    return this.findMatch(matcher) !== null;
  }
  /**
 * Find and return the first Expression that matches the matcher's current path.
 *
 * Uses the same evaluation order as matchesAny (cheapest → most expensive):
 *  1. Exact depth + tag bucket
 *  2. Depth-only wildcard bucket
 *  3. Deep-wildcard list
 *
 * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
 * @returns {import('./Expression.js').default | null} the first matching Expression, or null
 *
 * @example
 * const expr = stopNodes.findMatch(matcher);
 * if (expr) {
 *   // access expr.config, expr.pattern, etc.
 * }
 */
  findMatch(matcher) {
    const depth = matcher.getDepth();
    const tag = matcher.getCurrentTag();

    // 1. Tightest bucket — most expressions live here
    const exactKey = `${depth}:${tag}`;
    const exactBucket = this._byDepthAndTag.get(exactKey);
    if (exactBucket) {
      for (let i = 0; i < exactBucket.length; i++) {
        if (matcher.matches(exactBucket[i])) return exactBucket[i];
      }
    }

    // 2. Depth-matched wildcard-tag expressions
    const wildcardBucket = this._wildcardByDepth.get(depth);
    if (wildcardBucket) {
      for (let i = 0; i < wildcardBucket.length; i++) {
        if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
      }
    }

    // 3. Deep wildcards — indexed by terminal tag, then unindexed fallback
    const deepBucket = this._deepByTerminalTag.get(tag);
    if (deepBucket) {
      for (let i = 0; i < deepBucket.length; i++) {
        if (matcher.matches(deepBucket[i])) return deepBucket[i];
      }
    }
    for (let i = 0; i < this._deepWildcards.length; i++) {
      if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
    }

    return null;
  }
}

/**
 * MatcherView - A lightweight read-only view over a Matcher's internal state.
 *
 * Created once by Matcher and reused across all callbacks. Holds a direct
 * reference to the parent Matcher so it always reflects current parser state
 * with zero copying or freezing overhead.
 *
 * Users receive this via {@link Matcher#readOnly} or directly from parser
 * callbacks. It exposes all query and matching methods but has no mutation
 * methods — misuse is caught at the TypeScript level rather than at runtime.
 *
 * @example
 * const matcher = new Matcher();
 * const view = matcher.readOnly();
 *
 * matcher.push("root", {});
 * view.getCurrentTag(); // "root"
 * view.getDepth();      // 1
 */
class MatcherView {
  /**
   * @param {Matcher} matcher - The parent Matcher instance to read from.
   */
  constructor(matcher) {
    this._matcher = matcher;
  }

  /**
   * Get the path separator used by the parent matcher.
   * @returns {string}
   */
  get separator() {
    return this._matcher.separator;
  }

  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].tag : undefined;
  }

  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].namespace : undefined;
  }

  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return undefined;
    return path[path.length - 1].values?.[attrName];
  }

  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return false;
    const current = path[path.length - 1];
    return current.values !== undefined && attrName in current.values;
  }

  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {*}
   */
  getAnyParentAttr(attrName) {
    return this._matcher.getAnyParentAttr(attrName);
  }

  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    return this._matcher.hasAnyParentAttr(attrName);
  }

  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].position ?? 0;
  }

  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].counter ?? 0;
  }

  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }

  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this._matcher.path.length;
  }

  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    return this._matcher.toString(separator, includeNamespace);
  }

  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this._matcher.path.map(n => n.tag);
  }

  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    return this._matcher.matches(expression);
  }

  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this._matcher);
  }
}

/**
 * Matcher - Tracks current path in XML/JSON tree and matches against Expressions.
 *
 * The matcher maintains a stack of nodes representing the current path from root to
 * current tag. It only stores attribute values for the current (top) node to minimize
 * memory usage. Sibling tracking is used to auto-calculate position and counter.
 *
 * Use {@link Matcher#readOnly} to obtain a {@link MatcherView} safe to pass to
 * user callbacks — it always reflects current state with no Proxy overhead.
 *
 * @example
 * const matcher = new Matcher();
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123", type: "admin" });
 *
 * const expr = new Expression("root.users.user");
 * matcher.matches(expr); // true
 */
class Matcher {
  /**
   * Create a new Matcher.
   * @param {Object} [options={}]
   * @param {string} [options.separator='.'] - Default path separator
   */
  constructor(options = {}) {
    this.separator = options.separator || '.';
    this.path = [];
    this.siblingStacks = [];
    // Each path node: { tag, values, position, counter, namespace? }
    // values only present for current (last) node
    // Each siblingStacks entry: Map<tagName, count> tracking occurrences at each level
    this._pathStringCache = null;
    this._view = new MatcherView(this);

    // Kept-attribute stack: only populated when push() is called with options.keep.
    this._keptAttrs = [];
  }

  /**
   * Push a new tag onto the path.
   * @param {string} tagName
   * @param {Object|null} [attrValues=null]
   * @param {string|null} [namespace=null]
   * @param {Object|null} [options=null]
   * @param {string[]} [options.keep] - Names of attributes (from attrValues)
   */
  push(tagName, attrValues = null, namespace = null, options = null) {
    this._pathStringCache = null;

    // Remove values from previous current node (now becoming ancestor)
    if (this.path.length > 0) {
      this.path[this.path.length - 1].values = undefined;
    }

    // Get or create sibling tracking for current level
    const currentLevel = this.path.length;
    let level = this.siblingStacks[currentLevel];
    if (!level) {
      // `counts` tells same-name siblings apart (the "counter" — nth <item>
      // among other <item>s). `total` is every child seen at this level so
      // far, kept as a running number instead of re-added from `counts` on
      // every push — a parent with many differently-named children would
      // otherwise cost more per child the more distinct names it has.
      level = { counts: new Map(), total: 0 };
      this.siblingStacks[currentLevel] = level;
    }

    // Create a unique key for sibling tracking that includes namespace
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;

    // Calculate counter (how many times this tag appeared at this level)
    const counter = level.counts.get(siblingKey) || 0;

    // Position = total children at this level seen before this one.
    const position = level.total;

    // Update sibling count for this tag, and the level's running total.
    level.counts.set(siblingKey, counter + 1);
    level.total++;

    // Create new node
    const node = {
      tag: tagName,
      position: position,
      counter: counter
    };

    if (namespace !== null && namespace !== undefined) {
      node.namespace = namespace;
    }

    if (attrValues !== null && attrValues !== undefined) {
      node.values = attrValues;
    }

    this.path.push(node);

    // Depth of the node we just pushed (1-based, matches this.path.length)
    const depth = this.path.length;

    // Copy only the requested attributes into the kept-attrs stack. This is
    // the one part of push() whose cost scales with input (O(keep.length))
    // rather than being O(1) — by design, since the caller is explicitly
    // opting in for specific attribute names. No options/keep => zero added
    // cost beyond the two property reads below.
    const keep = options !== null ? options.keep : null;
    if (keep !== null && keep !== undefined && keep.length > 0 && attrValues) {
      for (let i = 0; i < keep.length; i++) {
        const name = keep[i];
        if (attrValues[name] !== undefined) {
          this._keptAttrs.push({ depth, name, value: attrValues[name] });
        }
      }
    }
  }

  /**
   * Pop the last tag from the path.
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) return undefined;
    this._pathStringCache = null;

    const node = this.path.pop();

    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }

    // Drop any kept attributes that belonged to the popped node (or deeper).
    // _keptAttrs is depth-ordered (push only ever appends increasing depths),
    // so this is a backward scan that stops at the first surviving entry —
    // typically O(1) since kept attrs are rare by design.
    const poppedDepth = this.path.length + 1;
    while (
      this._keptAttrs.length > 0 &&
      this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth
    ) {
      this._keptAttrs.pop();
    }

    return node;
  }

  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param {Object} attrValues
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== undefined) {
        current.values = attrValues;
      }
    }
  }

  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : undefined;
  }

  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : undefined;
  }

  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return undefined;
    return this.path[this.path.length - 1].values?.[attrName];
  }

  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== undefined && attrName in current.values;
  }

  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * Unlike getAttrValue(), this works regardless of how deep the path has
   * gone since the attribute was pushed — but only for attribute names that
   * were explicitly marked with `keep` at push time. Cost is proportional to
   * the number of currently-kept attributes (typically 0-3), not path depth.
   * @param {string} attrName
   * @returns {*} the value, or undefined if no ancestor kept this attribute
   */
  getAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return kept[i].value;
    }
    return undefined;
  }

  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return true;
    }
    return false;
  }

  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }

  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }

  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }

  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }

  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep = separator || this.separator;
    const isDefault = (sep === this.separator && includeNamespace === true);

    if (isDefault) {
      if (this._pathStringCache !== null) {
        return this._pathStringCache;
      }
      const result = this.path.map(n =>
        (n.namespace) ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep);
      this._pathStringCache = result;
      return result;
    }

    return this.path.map(n =>
      (includeNamespace && n.namespace) ? `${n.namespace}:${n.tag}` : n.tag
    ).join(sep);
  }

  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this.path.map(n => n.tag);
  }

  /**
   * Reset the path to empty.
   */
  reset() {
    this._pathStringCache = null;
    this.path = [];
    this.siblingStacks = [];
    this._keptAttrs = [];
  }

  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    const segments = expression.segments;

    if (segments.length === 0) {
      return false;
    }

    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }

    return this._matchSimple(segments);
  }

  /**
   * @private
   */
  _matchSimple(segments) {
    if (this.path.length !== segments.length) {
      return false;
    }

    for (let i = 0; i < segments.length; i++) {
      if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
        return false;
      }
    }

    return true;
  }

  /**
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;
    let segIdx = segments.length - 1;

    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];

      if (segment.type === 'deep-wildcard') {
        segIdx--;

        if (segIdx < 0) {
          return true;
        }

        const nextSeg = segments[segIdx];
        let found = false;

        for (let i = pathIdx; i >= 0; i--) {
          if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }

        if (!found) {
          return false;
        }
      } else {
        if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }

    return segIdx < 0;
  }

  /**
   * @private
   */
  _matchSegment(segment, node, isCurrentNode) {
    if (segment.tag !== '*' && segment.tag !== node.tag) {
      return false;
    }

    if (segment.namespace !== undefined) {
      if (segment.namespace !== '*' && segment.namespace !== node.namespace) {
        return false;
      }
    }

    if (segment.attrName !== undefined) {
      if (!isCurrentNode) {
        return false;
      }

      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }

      if (segment.attrValue !== undefined) {
        if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
          return false;
        }
      }
    }

    if (segment.position !== undefined) {
      if (!isCurrentNode) {
        return false;
      }

      const counter = node.counter ?? 0;

      if (segment.position === 'first' && counter !== 0) {
        return false;
      } else if (segment.position === 'odd' && counter % 2 !== 1) {
        return false;
      } else if (segment.position === 'even' && counter % 2 !== 0) {
        return false;
      } else if (segment.position === 'nth' && counter !== segment.positionValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this);
  }

  /**
   * Create a snapshot of current state.
   * @returns {Object}
   */
  snapshot() {
    return {
      path: this.path.map(node => ({ ...node })),
      siblingStacks: this.siblingStacks.map(level => level ? { counts: new Map(level.counts), total: level.total } : level),
      keptAttrs: this._keptAttrs.map(entry => ({ ...entry }))
    };
  }

  /**
   * Restore state from snapshot.
   * @param {Object} snapshot
   */
  restore(snapshot) {
    this._pathStringCache = null;
    this.path = snapshot.path.map(node => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map(level => level ? { counts: new Map(level.counts), total: level.total } : level);
    this._keptAttrs = (snapshot.keptAttrs || []).map(entry => ({ ...entry }));
  }

  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * It always reflects the current parser state and is safe to pass to
   * user callbacks without risk of accidental mutation.
   *
   * @returns {MatcherView}
   *
   * @example
   * const view = matcher.readOnly();
   * // pass view to callbacks — it stays in sync automatically
   * view.matches(expr);       // ✓
   * view.getCurrentTag();     // ✓
   * // view.push(...)         // ✗ method does not exist — caught by TypeScript
   */
  readOnly() {
    return this._view;
  }
}

export { ExpressionSet as E, Matcher as M, Expression as a };
