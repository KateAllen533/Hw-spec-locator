/**
 * HTML context patterns.
 *
 * Detects XSS vectors that are dangerous when a string ends up rendered as HTML.
 * All patterns use bounded quantifiers to ensure linear-time matching (ReDoS-safe).
 *
 * Each entry is { pattern: RegExp, id: string, description: string }
 * so callers can inspect which rule fired if they need to.
 */

const HTML_PATTERNS = [
  {
    id: 'html-script-open',
    description: '<script opening tag',
    pattern: /<script[\s>/]/i,
  },
  {
    id: 'html-script-close',
    description: '</script closing tag',
    pattern: /<\/script[\s>]/i,
  },
  {
    id: 'html-javascript-protocol',
    description: 'javascript: URI scheme (with optional whitespace/encoding)',
    // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
    pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i,
  },
  {
    id: 'html-vbscript-protocol',
    description: 'vbscript: URI scheme',
    pattern: /vbscript[\t\n\r ]*:/i,
  },
  {
    id: 'html-data-html',
    description: 'data:text/html URI — can execute scripts in browsers',
    pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i,
  },
  {
    id: 'html-data-xhtml',
    description: 'data:application/xhtml+xml URI',
    pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i,
  },
  {
    id: 'html-data-svg',
    description: 'data:image/svg+xml URI — can execute scripts',
    pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i,
  },
  {
    id: 'html-inline-event-handler',
    description: 'Inline event handler attributes: onclick=, onerror=, onload=, etc.',
    // \bon ensures we match a word boundary so "phonetic=" is not caught
    pattern: /\bon\w{1,30}\s*=/i,
  },
  {
    id: 'html-entity-obfuscated-script',
    description: 'HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)',
    // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
    pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i,
  },
  {
    id: 'html-entity-obfuscated-javascript',
    description: 'HTML-entity-encoded javascript: (partial — catches common &#106; or &#x6a; for "j")',
    pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i,
  },
  {
    id: 'html-style-expression',
    description: 'CSS expression() — IE-era code execution in style attributes',
    pattern: /style[\s\S]{0,20}expression\s*\(/i,
  },
  {
    id: 'html-object-embed',
    description: '<object or <embed tags that can load active content',
    pattern: /<(?:object|embed)[\s>/]/i,
  },
  {
    id: 'html-base-tag',
    description: '<base href= — can hijack all relative URLs on a page',
    pattern: /<base[\s>]/i,
  },
  {
    id: 'html-meta-refresh',
    description: '<meta http-equiv="refresh" — can redirect users',
    pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i,
  },
  {
    id: 'html-srcdoc',
    description: 'srcdoc= attribute on iframes — embeds HTML that can run scripts',
    pattern: /srcdoc\s*=/i,
  },
  {
    id: 'html-iframe',
    description: '<iframe tag',
    pattern: /<iframe[\s>/]/i,
  },
  {
    id: 'html-form',
    description: '<form tag — can be used for phishing / credential harvesting injection',
    pattern: /<form[\s>/]/i,
  },
];

/**
 * XML context patterns.
 *
 * Detects injection vectors that are specifically dangerous when a string
 * is inserted into an XML document (not HTML rendering context).
 *
 * Key distinction from HTML: these patterns target parser-level attacks —
 * things that can confuse or subvert an XML parser, trigger external entity
 * resolution, or inject DTD content. HTML rendering concerns (XSS) belong
 * in the HTML context.
 */

const XML_PATTERNS = [
  {
    id: 'xml-cdata-injection',
    description: 'CDATA section injection: <![CDATA[ breaks out of text node context',
    pattern: /<!\[CDATA\[/i,
  },
  {
    id: 'xml-cdata-close',
    description: 'CDATA close sequence: ]]> can terminate an enclosing CDATA section',
    pattern: /\]\]>/,
  },
  {
    id: 'xml-processing-instruction',
    description: 'XML processing instruction: <?xml-stylesheet or <?php etc.',
    pattern: /<\?(?:xml[\- ]|php|asp)/i,
  },
  {
    id: 'xml-doctype-injection',
    description: 'DOCTYPE declaration embedded in content — can define entities',
    // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
    pattern: /<!DOCTYPE(?:[\s[]|$)/i,
  },
  {
    id: 'xml-entity-system',
    description: 'SYSTEM keyword — used in external entity declarations (XXE)',
    pattern: /\bSYSTEM\s+["']/i,
  },
  {
    id: 'xml-entity-public',
    description: 'PUBLIC keyword — used in external entity declarations (XXE)',
    pattern: /\bPUBLIC\s+["']/i,
  },
  {
    id: 'xml-entity-declaration',
    description: '<!ENTITY declaration — defines entities, potential XXE or entity expansion',
    pattern: /<!ENTITY[\s%]/i,
  },
  {
    id: 'xml-billion-laughs',
    description: 'Entity reference chaining / billion laughs: repeated &eX; style references',
    // Heuristic: 3+ consecutive entity refs suggests expansion attack
    pattern: /(?:&\w{1,20};){3,}/,
  },
  {
    id: 'xml-namespace-confusion',
    description: 'xmlns: attribute injection — can redefine namespaces to confuse parsers',
    // pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i,
    pattern: /\bxmlns(?::\w{1,40})?\s*=/i,
  },
  {
    id: 'xml-comment-injection',
    description: '<!-- comment injection — can hide content from some parsers',
    pattern: /<!--/,
  },
  {
    id: 'xml-comment-close',
    description: '--> closes an enclosing XML comment',
    pattern: /-->/,
  },
  {
    id: 'xml-pi-close',
    description: '?> closes an enclosing processing instruction',
    pattern: /\?>/,
  },
];

/**
 * SVG context patterns.
 *
 * SVG is XML-based but renders in browsers, giving it a unique attack surface
 * that combines XML parser behaviour with browser rendering and JavaScript execution.
 *
 * Many of these vectors bypass HTML sanitizers that don't understand SVG semantics
 * (DOMPurify has documented bypass vulnerabilities specifically in SVG/XML context).
 */

const SVG_PATTERNS = [
  {
    id: 'svg-script-element',
    description: '<script element inside SVG executes JavaScript',
    pattern: /<script[\s>/]/i,
  },
  {
    id: 'svg-xlink-href-javascript',
    description: 'xlink:href with javascript: — classic SVG XSS via <a> or <use>',
    pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i,
  },
  {
    id: 'svg-href-javascript',
    description: 'href= with javascript: in SVG context (<a>, <animate>, etc.)',
    pattern: /href\s*=\s*["']?\s*javascript\s*:/i,
  },
  {
    id: 'svg-foreignobject',
    description: '<foreignObject embeds HTML inside SVG — can execute scripts',
    pattern: /<foreignObject[\s>/]/i,
  },
  {
    id: 'svg-use-external',
    description: '<use xlink:href or href pointing to external resource (non-fragment URL)',
    // Match <use with href= where the value starts with a non-# character (external URL)
    // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
    pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i,
  },
  {
    id: 'svg-animate-href',
    description: '<animate attributeName="href" — can dynamically change href to javascript:',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i,
  },
  {
    id: 'svg-animate-xlinkhref',
    description: '<animate attributeName="xlink:href"',
    pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i,
  },
  {
    id: 'svg-set-javascript',
    description: '<set to="javascript:..." — sets an attribute to a javascript: URI',
    pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i,
  },
  {
    id: 'svg-event-handler',
    description: 'SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.',
    pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i,
  },
  {
    id: 'svg-handler-generic',
    description: 'Generic on* handler catch-all for SVG attributes',
    pattern: /\bon\w{1,30}\s*=/i,
  },
  {
    id: 'svg-filter-feimage',
    description: '<feImage href= — filter primitive that can load external resources',
    pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i,
  },
  {
    id: 'svg-image-external',
    description: '<image xlink:href with http/https or javascript protocol',
    pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i,
  },
  {
    id: 'svg-style-javascript',
    description: 'style= attribute containing javascript: (e.g. background:url(javascript:...))',
    pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i,
  },
];

/**
 * SQL context patterns — high-precision rules only.
 *
 * These rules have very low false-positive risk and are safe to apply to
 * general user text (names, descriptions, search queries, etc.).
 * All patterns are ReDoS-safe — unlike the `sql-injection` npm package
 * which has an active CVE on its own detection regexes.
 *
 * For exhaustive coverage including noisier heuristics (comment sequences,
 * hex literals, stacked queries with semicolons), use 'SQL-STRICT' instead.
 * Apply 'SQL-STRICT' only to strings that are specifically SQL fragments,
 * not to general free-text fields.
 */

const SQL_PATTERNS = [
  {
    id: 'sql-block-comment-open',
    description: 'SQL block comment open: /* ... */ — unusual in legitimate user text',
    pattern: /\/\*/,
  },
  {
    id: 'sql-union-select',
    description: 'UNION SELECT — most common SQL injection aggregation attack',
    pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i,
  },
  {
    id: 'sql-drop-table',
    description: 'DROP TABLE — destructive DDL injection',
    pattern: /\bDROP\s{1,20}TABLE\b/i,
  },
  {
    id: 'sql-drop-database',
    description: 'DROP DATABASE — destructive DDL injection',
    pattern: /\bDROP\s{1,20}DATABASE\b/i,
  },
  {
    id: 'sql-insert-into',
    description: 'INSERT INTO — data injection',
    pattern: /\bINSERT\s{1,20}INTO\b/i,
  },
  {
    id: 'sql-delete-from',
    description: 'DELETE FROM — data deletion injection',
    pattern: /\bDELETE\s{1,20}FROM\b/i,
  },
  {
    id: 'sql-update-set',
    description: 'UPDATE ... SET — data modification injection',
    // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
    pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i,
  },
  {
    id: 'sql-exec-xp',
    description: 'EXEC xp_ — MSSQL extended stored procedure execution',
    pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i,
  },
  {
    id: 'sql-tautology-string',
    description: "Classic string tautology: ' OR '1'='1 or \" OR \"1\"=\"1\"",
    // Last quote is optional — injection may truncate it: ' OR '1'='1--
    pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i,
  },
  {
    id: 'sql-tautology-numeric',
    description: 'Numeric tautology: OR 1=1',
    pattern: /\bOR\s{1,10}1\s*=\s*1\b/i,
  },
  {
    id: 'sql-always-true-zero',
    description: 'Numeric tautology: OR 0=0',
    pattern: /\bOR\s{1,10}0\s*=\s*0\b/i,
  },
  {
    id: 'sql-sleep-benchmark',
    description: 'Time-based blind injection: SLEEP() or BENCHMARK()',
    pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i,
  },
  {
    id: 'sql-waitfor-delay',
    description: 'MSSQL time-based blind injection: WAITFOR DELAY',
    pattern: /\bWAITFOR\s{1,20}DELAY\b/i,
  },
  {
    id: 'sql-char-function',
    description: 'CHAR() function — used to obfuscate injected strings',
    pattern: /\bCHAR\s*\(\s*\d{1,3}/i,
  },
  {
    id: 'sql-information-schema',
    description: 'INFORMATION_SCHEMA — reconnaissance query for table/column enumeration',
    pattern: /\bINFORMATION_SCHEMA\b/i,
  },
];

/**
 * SHELL context patterns.
 *
 * Detects shell injection vectors and path traversal patterns.
 * Designed for use when a string will be passed to a shell command,
 * used as a file path, or interpolated into OS-level operations.
 */

const SHELL_PATTERNS = [
  {
    id: 'shell-path-traversal-unix',
    description: 'Unix path traversal: ../  — climbing the directory tree',
    pattern: /\.\.\//,
  },
  {
    id: 'shell-path-traversal-windows',
    description: 'Windows path traversal: ..\\ — climbing the directory tree',
    pattern: /\.\.\\/,
  },
  {
    id: 'shell-path-traversal-encoded',
    description: 'URL-encoded path traversal: %2e%2e or %2f variants',
    pattern: /%2e%2e|%2f\.\.|\.\.%2f/i,
  },
  {
    id: 'shell-null-byte',
    description: 'Null byte injection: \\x00 or %00 — truncates strings in C-backed functions',
    pattern: /\x00|%00/,
  },
  {
    id: 'shell-semicolon',
    description: 'Semicolon command separator: cmd1; cmd2',
    pattern: /;/,
  },
  {
    id: 'shell-pipe',
    description: 'Pipe operator: cmd1 | cmd2',
    pattern: /\|/,
  },
  {
    id: 'shell-and-operator',
    description: 'AND operator: cmd1 && cmd2',
    pattern: /&&/,
  },
  {
    id: 'shell-or-operator',
    description: 'OR operator: cmd1 || cmd2',
    pattern: /\|\|/,
  },
  {
    id: 'shell-backtick',
    description: 'Backtick command substitution: `cmd`',
    pattern: /`/,
  },
  {
    id: 'shell-dollar-paren',
    description: 'Dollar-paren command substitution: $(cmd)',
    pattern: /\$\(/,
  },
  {
    id: 'shell-dollar-brace',
    description: 'Dollar-brace variable expansion: ${var} — can be abused for injection',
    pattern: /\$\{/,
  },
  {
    id: 'shell-redirect-out',
    description: 'Output redirection: cmd > file or cmd >> file',
    pattern: />{1,2}/,
  },
  {
    id: 'shell-redirect-in',
    description: 'Input redirection: cmd < file',
    pattern: /</,
  },
  {
    id: 'shell-newline-injection',
    description: 'Newline injection: \\n or \\r — can inject new shell commands',
    pattern: /[\n\r]/,
  },
  {
    id: 'shell-glob-star',
    description: 'Glob expansion: * or ? — can expand to unintended files',
    // Only flag when combined with path separators to reduce false positives
    pattern: /[/\\][*?]/,
  },
  {
    id: 'shell-absolute-root',
    description: 'Absolute root path injection: string starting with / or \\ (Windows UNC)',
    pattern: /^(?:\/|\\\\)/,
  },
  {
    id: 'shell-windows-drive',
    description: 'Windows drive letter path injection: C:\\ or D:/',
    pattern: /^[a-zA-Z]:[/\\]/,
  },
  {
    id: 'shell-curl-wget',
    description: 'curl/wget with URL or flags — can exfiltrate data or download payloads',
    // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
    // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
    pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i,
  },
];

/**
 * REDOS context patterns.
 *
 * Detects strings that, if used as regular expressions, could cause
 * catastrophic backtracking (ReDoS — Regular Expression Denial of Service).
 *
 * These patterns detect the structural forms that lead to exponential or
 * polynomial backtracking in NFA-based regex engines (V8, PCRE, Java, etc.).
 *
 * Use this context when user-supplied strings will be compiled into RegExp objects.
 */

const REDOS_PATTERNS = [
  {
    id: 'redos-nested-quantifier-plus',
    description: 'Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.',
    // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
    pattern: /\([^)]*\+[^)]*\)[+*]/,
  },
  {
    id: 'redos-nested-quantifier-star',
    description: 'Nested * quantifier: (a*)* or (a*)+ — catastrophic backtracking',
    pattern: /\([^)]*\*[^)]*\)[*+]/,
  },
  {
    id: 'redos-nested-groups',
    description: 'Doubly nested quantified groups: ((a+)+) — guaranteed catastrophic',
    pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/,
  },
  {
    id: 'redos-alternation-overlap',
    description: 'Overlapping alternation under quantifier: (a|a)+ — ambiguous NFA paths',
    // Detect repeated identical alternatives under a quantifier
    pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/,
  },
  {
    id: 'redos-star-plus-concat',
    description: '(x*x)+ pattern — triggers super-linear backtracking',
    pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/,
  },
  {
    id: 'redos-dot-star-greedy',
    description: '(.*){n,} or (.+){n,} — repeated greedy dot quantifiers',
    pattern: /\(\.[*+]\)\{?\d/,
  },
  {
    id: 'redos-large-repetition',
    description: 'Very large fixed or range repetition count {1000,} or {1000,n} — denial of service via backtracking',
    // Matches { followed by 4+ digits (≥1000), then optional ,digits }
    pattern: /\{\d{4,}(?:,\d*)?\}/,
  },
  {
    id: 'redos-catastrophic-alternation',
    description: 'Long alternation with many similar branches — polynomial backtracking risk',
    // Heuristic: 10+ pipe-separated alternatives in a single group
    pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/,
  },
];

/**
 * NOSQL context patterns.
 *
 * Detects injection vectors specific to NoSQL databases (primarily MongoDB)
 * and JavaScript-evaluated queries.
 *
 * Attack categories:
 *   1. MongoDB query operator injection: $where, $ne, $gt, $regex, $or, $and, etc.
 *      These operators, when injected into a JSON query object, can bypass
 *      authentication or exfiltrate data without knowing passwords.
 *
 *   2. JavaScript execution: $where clauses execute arbitrary JS server-side.
 *
 *   3. Prototype pollution: __proto__, constructor.prototype — can corrupt
 *      the prototype chain of all objects in the Node.js process.
 *
 * Pattern note: MongoDB operators appear as JSON keys. In JSON, keys are
 * quoted: {"$where": ...} so the pattern must allow an optional closing
 * quote between the operator name and the colon: /\$where["'\s]*:/
 */

const sep = '["\'\\s]*:';

const NOSQL_PATTERNS = [
  // ─── MongoDB $ operator injection ────────────────────────────────────────
  {
    id: 'nosql-where-operator',
    description: '$where — executes arbitrary JavaScript server-side in MongoDB',
    pattern: new RegExp(`\\$where${sep}`, 'i'),
  },
  {
    id: 'nosql-ne-operator',
    description: '$ne — "not equal" operator used to bypass equality checks',
    pattern: new RegExp(`\\$ne${sep}`, 'i'),
  },
  {
    id: 'nosql-gt-operator',
    description: '$gt — "greater than" used to bypass password/value checks',
    pattern: new RegExp(`\\$gte?${sep}`, 'i'),
  },
  {
    id: 'nosql-lt-operator',
    description: '$lt / $lte — "less than" bypass variants',
    pattern: new RegExp(`\\$lte?${sep}`, 'i'),
  },
  {
    id: 'nosql-regex-operator',
    description: '$regex — can be used to extract data character by character (blind injection)',
    pattern: new RegExp(`\\$regex${sep}`, 'i'),
  },
  {
    id: 'nosql-or-operator',
    description: '$or — logical OR; used to create always-true conditions',
    pattern: new RegExp(`\\$or${sep}\\s*\\[`, 'i'),
  },
  {
    id: 'nosql-and-operator',
    description: '$and — logical AND operator injection',
    pattern: new RegExp(`\\$and${sep}\\s*\\[`, 'i'),
  },
  {
    id: 'nosql-nor-operator',
    description: '$nor — logical NOR operator injection',
    pattern: new RegExp(`\\$nor${sep}\\s*\\[`, 'i'),
  },
  {
    id: 'nosql-exists-operator',
    description: '$exists — can enumerate fields to determine schema',
    pattern: new RegExp(`\\$exists${sep}`, 'i'),
  },
  {
    id: 'nosql-in-operator',
    description: '$in — matches any value in a list; can enumerate values',
    pattern: new RegExp(`\\$in${sep}\\s*\\[`, 'i'),
  },
  {
    id: 'nosql-expr-operator',
    description: '$expr — allows aggregation expressions in queries (MongoDB 3.6+)',
    pattern: new RegExp(`\\$expr${sep}`, 'i'),
  },
  {
    id: 'nosql-function-operator',
    description: '$function — executes arbitrary JavaScript in MongoDB 4.4+',
    pattern: new RegExp(`\\$function${sep}`, 'i'),
  },
  {
    id: 'nosql-accumulator-operator',
    description: '$accumulator — custom aggregation with arbitrary JS execution',
    pattern: new RegExp(`\\$accumulator${sep}`, 'i'),
  },
  // ─── Prototype pollution ─────────────────────────────────────────────────
  {
    id: 'nosql-proto-pollution',
    description: '__proto__ — prototype pollution via object key injection',
    pattern: /__proto__/,
  },
  {
    id: 'nosql-constructor-prototype',
    description: 'constructor.prototype — alternative prototype pollution vector (dot notation or JSON key)',
    // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
    // ("constructor": {"prototype": ...})
    pattern: /constructor[\s"':.,{\[]*prototype/i,
  },
  {
    id: 'nosql-proto-bracket',
    description: '["__proto__"] — bracket-notation prototype pollution',
    pattern: /\[["']__proto__["']\]/,
  },
];

/**
 * LOG context patterns.
 *
 * Detects injection vectors that are dangerous when a string is written
 * to a log file, passed to a logging framework, or interpolated into
 * a log message that will be parsed or displayed.
 *
 * Attack categories:
 *   1. CRLF injection — injects fake log lines by embedding newlines
 *   2. Log4Shell (CVE-2021-44228) — ${jndi:...} triggers JNDI lookup in Log4j
 *   3. SSTI in log templates — {{...}}, #{...} trigger template evaluation
 *      if the log message is passed through a template engine
 *   4. Null byte injection — truncates log entries in some implementations
 *   5. ANSI escape injection — manipulates terminal output when logs are
 *      tailed in a terminal (colour codes, cursor movement, etc.)
 *
 * Note: Newline characters (\n, \r) will produce false positives for
 * multi-line legitimate values. Use this context only for single-line
 * log field values (usernames, IDs, request parameters, etc.).
 */

const LOG_PATTERNS = [
  // ─── CRLF / newline injection ─────────────────────────────────────────────
  {
    id: 'log-crlf-injection',
    description: 'CRLF injection: literal \\r or \\n embeds fake log lines',
    pattern: /[\r\n]/,
  },
  {
    id: 'log-url-encoded-crlf',
    description: 'URL-encoded CRLF: %0d, %0a, %0D, %0A — decoded by some log parsers',
    pattern: /%0[dDaA]/,
  },
  {
    id: 'log-unicode-newline',
    description: 'Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)',
    pattern: /[\u2028\u2029]/,
  },

  // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
  {
    id: 'log-log4shell-jndi',
    description: 'Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j',
    pattern: /\$\{jndi\s*:/i,
  },
  {
    id: 'log-log4shell-obfuscated',
    description: 'Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection',
    // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
    pattern: /\$\{::-/,
  },
  {
    id: 'log-log4j-lookup',
    description: 'Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} — data exfiltration',
    pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i,
  },

  // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
  {
    id: 'log-ssti-double-brace',
    description: 'SSTI double-brace: {{expression}} — Jinja2, Twig, Handlebars, etc.',
    pattern: /\{\{[\s\S]{0,80}\}\}/,
  },
  {
    id: 'log-ssti-hash-brace',
    description: 'SSTI hash-brace: #{expression} — Thymeleaf, Velocity, Ruby ERB',
    pattern: /#\{[\s\S]{0,80}\}/,
  },
  {
    id: 'log-ssti-dollar-brace',
    description: 'SSTI/EL injection: ${expression with operators or method calls} — JSP EL, Freemarker, SpEL',
    // Require that the ${...} content looks like an expression, not a plain variable name.
    // Flags if the content contains: . ( * + operators, or known SSTI keywords.
    // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
    pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i,
  },
  {
    id: 'log-ssti-percent-tag',
    description: 'SSTI ERB/ASP tag: <%= expression %> — Ruby ERB, ASP',
    pattern: /<%=[\s\S]{0,80}%>/,
  },

  // ─── Null byte ────────────────────────────────────────────────────────────
  {
    id: 'log-null-byte',
    description: 'Null byte: \\x00 or %00 — can truncate log entries in C-backed loggers',
    pattern: /\x00|%00/,
  },

  // ─── ANSI escape injection ────────────────────────────────────────────────
  {
    id: 'log-ansi-escape',
    description: 'ANSI escape sequence: ESC[ — can manipulate terminal output when logs are tailed',
    pattern: /\x1b\[/,
  },
];

/**
 * SQL-STRICT context patterns.
 *
 * Extends the base 'SQL' context with three additional rules that are
 * effective at detecting real injections but carry a higher false-positive
 * risk on general free-text input.
 *
 * Use 'SQL-STRICT' when:
 *   - The string is specifically a SQL fragment or database identifier
 *   - You control the input domain (e.g. a dedicated SQL search field)
 *   - You can tolerate occasional false positives in exchange for broader coverage
 *
 * Use 'SQL' (not STRICT) when:
 *   - The field is general user text (names, descriptions, comments)
 *   - False positives would block legitimate content (e.g. "see note -- above")
 *
 * Rules moved here from 'SQL' due to false-positive risk:
 *
 *   sql-line-comment   — "--" fires on "see note -- above", "value--", CSS var(--primary)
 *   sql-stacked-query  — "; SELECT" fires on legitimate prose with semicolons + SQL words
 *   sql-hex-encoding   — "0xDEAD" fires on hex values in technical docs and log output
 */


const SQL_STRICT_EXTRA = [
  {
    id: 'sql-line-comment',
    description: 'SQL line comment: -- followed by whitespace or end of string',
    pattern: /--(?:\s|$)/,
  },
  {
    id: 'sql-stacked-query',
    description: 'Stacked queries: semicolon immediately followed by a SQL keyword',
    pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i,
  },
  {
    id: 'sql-hex-encoding',
    description: 'Hex-encoded string injection: 0x41414141 style (MySQL)',
    pattern: /\b0x[0-9a-f]{4,}/i,
  },
];

// SQL-STRICT = all base SQL rules + the three noisy extras
const SQL_STRICT_PATTERNS = [...SQL_PATTERNS, ...SQL_STRICT_EXTRA];

/**
 * is-unsafe v2
 *
 * Zero-dependency, DOM-free, pure predicate for detecting unsafe strings
 * across HTML, XML, SVG, SQL, SQL-STRICT, SHELL, REDOS, NOSQL, and LOG contexts.
 *
 * v2 change: contexts are imported as named pattern arrays rather than resolved
 * via a string-keyed registry. This makes each context independently
 * tree-shakeable — bundlers can drop any context you never import.
 *
 * @module is-unsafe
 */


// ─── Attach labels to named contexts ──────────────────────────────────────
// Each built-in PatternList carries its canonical name so matchList can read
// list.label directly — no registry lookup needed at match time.
// Custom PatternLists default to 'CUSTOM' unless the caller sets list.label.

HTML_PATTERNS.label       = 'HTML';
XML_PATTERNS.label        = 'XML';
SVG_PATTERNS.label        = 'SVG';
SQL_PATTERNS.label        = 'SQL';
SQL_STRICT_PATTERNS.label = 'SQL-STRICT';
SHELL_PATTERNS.label      = 'SHELL';
REDOS_PATTERNS.label      = 'REDOS';
NOSQL_PATTERNS.label      = 'NOSQL';
LOG_PATTERNS.label        = 'LOG';

// ─── Types ────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, description: string, pattern: RegExp }} Rule
 */

/**
 * @typedef {Rule[]} PatternList
 */

/**
 * @typedef {Object} MatchResult
 * @property {string} context     - Label identifying which context matched ('HTML', 'CUSTOM', etc.)
 * @property {string} id          - Rule identifier
 * @property {string} description - Human-readable description of what was matched
 * @property {RegExp} pattern     - The pattern that matched
 */

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * @param {unknown} value
 */
function assertString(value) {
  if (typeof value !== 'string') {
    throw new TypeError(
      `is-unsafe: first argument must be a string, got ${typeof value}`
    );
  }
}

/**
 * @param {unknown} context
 */
function assertContext(context) {
  if (context instanceof RegExp) return;

  if (Array.isArray(context)) {
    if (context.length === 0) {
      throw new TypeError('is-unsafe: context must not be an empty array');
    }
    // Detect array-of-arrays vs flat pattern list
    if (Array.isArray(context[0])) {
      // Array of PatternLists
      for (const list of context) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new TypeError(
            'is-unsafe: each context in the array must be a non-empty pattern array (PatternList)'
          );
        }
      }
    }
    // else: flat PatternList — trust it, no deep validation needed
    return;
  }

  throw new TypeError(
    `is-unsafe: second argument must be a PatternList (e.g. HTML), ` +
    `an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
  );
}

/**
 * Normalise any valid context arg into an array of PatternLists.
 *
 * @param {Rule[]|Rule[][]|RegExp} context
 * @returns {{ lists: Rule[][]|null, regex: RegExp|null }}
 */
function normalise(context) {
  if (context instanceof RegExp) return { lists: null, regex: context };
  // Distinguish PatternList (array of rule objects) from array of PatternLists
  if (Array.isArray(context[0])) return { lists: context, regex: null };
  return { lists: [context], regex: null };
}

/**
 * Test value against a single PatternList. Returns the first MatchResult or null.
 *
 * @param {string} value
 * @param {Rule[]} list
 * @returns {MatchResult|null}
 */
function matchList(value, list) {
  const label = list.label ?? 'CUSTOM';
  for (const rule of list) {
    if (rule.pattern.test(value)) {
      return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Returns `true` if `value` is unsafe in the given context(s), `false` otherwise.
 *
 * @param {string} value - The string to test
 * @param {PatternList | PatternList[] | RegExp} context
 *   - A PatternList imported from is-unsafe (e.g. `HTML`, `XML`)
 *   - An array of PatternLists — returns true if unsafe in **any** of them
 *   - A custom RegExp — returns true if the pattern matches
 * @returns {boolean}
 *
 * @example
 * import { isUnsafe, HTML, SQL } from 'is-unsafe';
 *
 * isUnsafe('<script>alert(1)</script>', HTML)       // true
 * isUnsafe('hello world', HTML)                     // false
 * isUnsafe('value', [HTML, SQL])                    // false
 * isUnsafe('value', /my-pattern/i)                  // false
 */
function isUnsafe(value, context) {
  assertString(value);
  assertContext(context);

  const { lists, regex } = normalise(context);

  if (regex) return regex.test(value);

  for (const list of lists) {
    if (matchList(value, list) !== null) return true;
  }
  return false;
}

export { HTML_PATTERNS as H, XML_PATTERNS as X, isUnsafe as i };
