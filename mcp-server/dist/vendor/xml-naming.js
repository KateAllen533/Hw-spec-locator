/**
 * xml-naming
 * Validates XML Name productions as defined in the XML 1.0 and 1.1 specifications.
 * Covers: Name, NCName, QName, NMToken, NMTokens
 *
 * XML 1.0 spec: https://www.w3.org/TR/xml/#NT-Name
 * XML 1.1 spec: https://www.w3.org/TR/xml11/#NT-NameStartChar
 * XML NS spec:  https://www.w3.org/TR/xml-names/#NT-NCName
 */

// ---------------------------------------------------------------------------
// Character class strings — XML 1.0
//
// NameStartChar ::= ":" | [A-Z] | "_" | [a-z]
//   | [#xC0-#xD6]   | [#xD8-#xF6]   | [#xF8-#x2FF]
//   | [#x370-#x37D] | [#x37F-#x1FFF]    <- split to exclude #x0487
//   | [#x200C-#x200D]
//   | [#x2070-#x218F] | [#x2C00-#x2FEF]
//   | [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD]
//
// NameChar ::= NameStartChar | "-" | "." | [0-9]
//   | #xB7 | [#x0300-#x036F] | [#x203F-#x2040]
//
// Note: \u0487 (Combining Cyrillic Millions Sign) was added in Unicode 4.0,
// after XML 1.0 was defined against Unicode 2.0. It falls inside the range
// \u037F-\u1FFF but must be excluded. We split that range into
// \u037F-\u0486 and \u0488-\u1FFF to exclude it explicitly.
// ---------------------------------------------------------------------------

const nameStartChar10 =
  ':A-Za-z_' +
  '\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF' +
  '\u0370-\u037D' +
  '\u037F-\u0486\u0488-\u1FFF' +  // split to exclude \u0487
  '\u200C-\u200D' +
  '\u2070-\u218F' +
  '\u2C00-\u2FEF' +
  '\u3001-\uD7FF' +
  '\uF900-\uFDCF' +
  '\uFDF0-\uFFFD';

const nameChar10 =
  nameStartChar10 +
  '\\-\\.\\d' +
  '\u00B7' +
  '\u0300-\u036F' +
  '\u203F-\u2040';

// ---------------------------------------------------------------------------
// Character class strings — XML 1.1
//
// Differences from XML 1.0:
//
// NameStartChar:
//   1.0 has split ranges: \u00C0-\u00D6, \u00D8-\u00F6, \u00F8-\u02FF
//   1.1 merges them into: \u00C0-\u02FF
//   (\u00D7 x and \u00F7 / are division symbols, excluded in both versions)
//
//   1.0 tops out at \uFFFD (BMP only)
//   1.1 adds \u{10000}-\u{EFFFF} (supplementary planes)
//   These require the /u flag on the RegExp — see buildRegexes below.
//
// NameChar:
//   1.1 adds \u0487 (Combining Cyrillic Millions Sign, added in Unicode 4.0)
// ---------------------------------------------------------------------------

const nameStartChar11 =
  ':A-Za-z_' +
  '\u00C0-\u02FF' +                    // merged — 1.0 had three split ranges here
  '\u0370-\u037D' +
  '\u037F-\u0486\u0488-\u1FFF' +       // split to exclude \u0487 (combining mark, never a NameStartChar)
  '\u200C-\u200D' +
  '\u2070-\u218F' +
  '\u2C00-\u2FEF' +
  '\u3001-\uD7FF' +
  '\uF900-\uFDCF' +
  '\uFDF0-\uFFFD' +
  '\u{10000}-\u{EFFFF}';     // supplementary planes — REQUIRES /u flag on RegExp

const nameChar11 =
  nameStartChar11 +
  '\\-\\.\\d' +
  '\u00B7' +
  '\u0300-\u036F' +
  '\u0487' +                 // Combining Cyrillic Millions Sign — valid in 1.1, not 1.0
  '\u203F-\u2040';

// ---------------------------------------------------------------------------
// Regex builders
//
// XML 1.0 regexes: no flags — BMP only, standard JS regex behaviour.
// XML 1.1 regexes: /u flag — required for \u{10000}-\u{EFFFF} to match actual
//   supplementary code points rather than lone surrogates (which are illegal XML).
// ---------------------------------------------------------------------------

const buildRegexes = (startChar, char, flags = '') => {
  const ncStart = startChar.replace(':', '');
  const ncChar = char.replace(':', '');
  const ncNamePat = `[${ncStart}][${ncChar}]*`;

  return {
    name: new RegExp(`^[${startChar}][${char}]*$`, flags),
    ncName: new RegExp(`^${ncNamePat}$`, flags),
    qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
    nmToken: new RegExp(`^[${char}]+$`, flags),
    nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags),
  };
};

const regexes10 = buildRegexes(nameStartChar10, nameChar10);       // no /u — BMP only
const regexes11 = buildRegexes(nameStartChar11, nameChar11, 'u');  // /u — enables \u{10000}-\u{EFFFF}

// ---------------------------------------------------------------------------
// ASCII-only fast path (opt-in, off by default)
//
// The XML 1.0 vs 1.1 NameStartChar/NameChar productions differ *only* in
// their non-ASCII ranges (merged vs split Latin-1 ranges, \u0487, and
// supplementary planes). Restricted to ASCII, both versions collapse to the
// same character classes, so a single regex pair covers both xmlVersion
// values — no /u flag needed.
//
// Rationale: unicode-aware regexes (the /u flag, required for XML 1.1's
// supplementary-plane range) are measurably slower in V8 than plain
// non-unicode regexes on the same input, even when the input is pure ASCII.
// For the common case — HTML/SVG ids, XML tags — names are ASCII, so callers
// who know this can opt in to skip the unicode-aware matching path entirely.
// This is a real but *conditional* win: mainly for XML 1.1 input (avoids /u),
// or at scale where the larger unicode character classes add engine
// overhead. It also changes behaviour (rejects legitimate non-ASCII XML
// 1.0/1.1 names), so it must never be silently enabled — hence off by
// default.
// ---------------------------------------------------------------------------

const nameStartCharAscii = ':A-Za-z_';
const nameCharAscii = nameStartCharAscii + '\\-\\.\\d';

const regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii); // no /u — ASCII only

const getRegexes = (xmlVersion = '1.0', asciiOnly = false) => {
  if (asciiOnly) return regexesAscii;
  return xmlVersion === '1.1' ? regexes11 : regexes10;
};

/**
 * Returns true if the string is a valid QName (Qualified Name).
 * Allows exactly one colon as a prefix separator: prefix:localName.
 * Used for: element and attribute names in namespace-aware XML/SVG.
 *
 * @param {{ xmlVersion?: '1.0'|'1.1', asciiOnly?: boolean }} [opts]
 *   asciiOnly: skip unicode-aware matching, ASCII names only (default false).
 */
const qName = (str, { xmlVersion = '1.0', asciiOnly = false } = {}) =>
  getRegexes(xmlVersion, asciiOnly).qName.test(str);

export { qName as q };
