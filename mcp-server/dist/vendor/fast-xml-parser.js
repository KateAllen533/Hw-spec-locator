import { q as qName } from './xml-naming.js';
import { t as toNumber } from './strnum.js';
import { M as Matcher, E as ExpressionSet, a as Expression } from './path-expression-matcher.js';
import { i as isUnsafe, H as HTML_PATTERNS, X as XML_PATTERNS } from './is-unsafe.js';
import { E as EntityDecoder, a as ENTITY_ACTION, X as XML, C as CURRENCY, b as COMMON_HTML } from './nodable-entities.js';

const nameStartChar = ':A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const nameChar = nameStartChar + '\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const nameRegexp = '[' + nameStartChar + '][' + nameChar + ']*';
const regexName = new RegExp('^' + nameRegexp + '$');

function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}

const isName = function (string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === 'undefined');
};

function isExist(v) {
  return typeof v !== 'undefined';
}

/**
 * Dangerous property names that could lead to prototype pollution or security issues
 */
const DANGEROUS_PROPERTY_NAMES = [
  // '__proto__',
  // 'constructor',
  // 'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
];

const criticalProperties = ["__proto__", "constructor", "prototype"];

const defaultOptions$1 = {
  allowBooleanAttributes: false, //A tag can have attributes without any value
  unpairedTags: []
};

//const tagsPattern = new RegExp("<\\/?([\\w:\\-_\.]+)\\s*\/?>","g");
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions$1, options);

  //xmlData = xmlData.replace(/(\r\n|\n|\r)/gm,"");//make it single line
  //xmlData = xmlData.replace(/(^\s*<\?xml.*?\?>)/g,"");//Remove XML starting tag
  //xmlData = xmlData.replace(/(<!DOCTYPE[\s\w\"\.\/\-\:]+(\[.*\])*\s*>)/g,"");//Remove DOCTYPE
  const tags = [];
  let tagFound = false;

  //indicates that the root tag has been closed (aka. depth 0 has been reached)
  let reachedRoot = false;

  if (xmlData[0] === '\ufeff') {
    // check for byte order mark (BOM)
    xmlData = xmlData.substr(1);
  }

  for (let i = 0; i < xmlData.length; i++) {

    if (xmlData[i] === '<' && xmlData[i + 1] === '?') {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === '<') {
      //starting of tag
      //read until you reach to '>' avoiding any '>' in attribute value
      let tagStartPos = i;
      i++;

      if (xmlData[i] === '!') {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === '/') {
          //closing tag
          closingTag = true;
          i++;
        }
        //read tagname
        let tagName = '';
        for (; i < xmlData.length &&
          xmlData[i] !== '>' &&
          xmlData[i] !== ' ' &&
          xmlData[i] !== '\t' &&
          xmlData[i] !== '\n' &&
          xmlData[i] !== '\r'; i++
        ) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        //console.log(tagName);

        if (tagName[tagName.length - 1] === '/') {
          //self closing tag without attributes
          tagName = tagName.substring(0, tagName.length - 1);
          //continue;
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject('InvalidTag', msg, getLineNumberForPosition(xmlData, i));
        }

        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject('InvalidAttr', "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;

        if (attrStr[attrStr.length - 1] === '/') {
          //self closing tag
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
            //continue; //text may presents after self closing tag
          } else {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject('InvalidTag',
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos));
            }

            //when there are no more tags, we reached the root level.
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }

          //if the root level has been reached before ...
          if (reachedRoot === true) {
            return getErrorObject('InvalidXml', 'Multiple possible root nodes found.', getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) ; else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }

        //skip tag text value
        //It may include comments and CDATA value
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === '<') {
            if (xmlData[i + 1] === '!') {
              //comment or CADATA
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === '?') {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === '&') {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject('InvalidChar', "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject('InvalidXml', "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        } //end of reading tag text value
        if (xmlData[i] === '<') {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject('InvalidChar', "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }

  if (!tagFound) {
    return getErrorObject('InvalidXml', 'Start tag expected.', 1);
  } else if (tags.length == 1) {
    return getErrorObject('InvalidTag', "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject('InvalidXml', "Invalid '" +
      JSON.stringify(tags.map(t => t.tagName), null, 4).replace(/\r?\n/g, '') +
      "' found.", { line: 1, col: 1 });
  }

  return true;
}
function isWhiteSpace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
/**
 * Read Processing insstructions and skip
 * @param {*} xmlData
 * @param {*} i
 */
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == '?' || xmlData[i] == ' ') {
      //tagname
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === 'xml') {
        return getErrorObject('InvalidXml', 'XML declaration allowed only at the start of the document.', getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == '?' && xmlData[i + 1] == '>') {
        //check if valid attribut string
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}

function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === '-' && xmlData[i + 2] === '-') {
    //comment
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === '-' && xmlData[i + 1] === '-' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  } else if (
    xmlData.length > i + 8 &&
    xmlData[i + 1] === 'D' &&
    xmlData[i + 2] === 'O' &&
    xmlData[i + 3] === 'C' &&
    xmlData[i + 4] === 'T' &&
    xmlData[i + 5] === 'Y' &&
    xmlData[i + 6] === 'P' &&
    xmlData[i + 7] === 'E'
  ) {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === '<') {
        angleBracketsCount++;
      } else if (xmlData[i] === '>') {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (
    xmlData.length > i + 9 &&
    xmlData[i + 1] === '[' &&
    xmlData[i + 2] === 'C' &&
    xmlData[i + 3] === 'D' &&
    xmlData[i + 4] === 'A' &&
    xmlData[i + 5] === 'T' &&
    xmlData[i + 6] === 'A' &&
    xmlData[i + 7] === '['
  ) {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === ']' && xmlData[i + 1] === ']' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  }

  return i;
}

const doubleQuote = '"';
const singleQuote = "'";

/**
 * Keep reading xmlData until '<' is found outside the attribute value.
 * @param {string} xmlData
 * @param {number} i
 */
function readAttributeStr(xmlData, i) {
  let attrStr = '';
  let startChar = '';
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === '') {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) ; else {
        startChar = '';
      }
    } else if (xmlData[i] === '>') {
      if (startChar === '') {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== '') {
    return false;
  }

  return {
    value: attrStr,
    index: i,
    tagClosed: tagClosed
  };
}

/**
 * Walk `attrStr` once, left to right, splitting it into attribute tokens.
 *
 * This replaces a regex that used to do the same job
 * (`(\s*)([^\s=]+)(\s*=)?(\s*(['"])(([\s\S])*?)\5)?`). That regex led with an
 * optional whitespace group followed by a required "non-whitespace" group.
 * On a long run of whitespace that never resolves into an attribute name
 * (e.g. a tag with thousands of trailing spaces before `>`), the engine
 * backtracks the whitespace group one character at a time before giving up
 * and moving to the next starting position — one full backtrack per
 * position, which is quadratic in the length of the run.
 *
 * A single forward-only scan can never backtrack, so it can't be made slow
 * this way no matter how much whitespace the input contains — it's always
 * proportional to the length of the string, once.
 *
 * Each returned token mirrors the shape the old regex match array had, so
 * the validation logic below (which reads token[1]..token[6]) didn't need
 * to change:
 *   token.startIndex - where this token begins in attrStr
 *   token[1]          - leading whitespace before the name
 *   token[2]          - the attribute name
 *   token[3]          - whitespace + '=' if present, else undefined
 *   token[4]          - marker (any defined value) if a quoted value was found
 *   token[5]          - the quote character used ('"' or "'")
 *   token[6]          - the value's text, without the surrounding quotes
 *
 * A malformed leading character (e.g. a stray '=' with no name before it)
 * is simply skipped over, one character at a time — the same outcome the
 * old regex produced by failing to match at that position and retrying at
 * the next one.
 */
function scanAttributeTokens(attrStr) {
  const tokens = [];
  const len = attrStr.length;
  let i = 0;

  while (i < len) {
    const tokenStart = i;

    // Leading whitespace before the name.
    while (i < len && isWhiteSpace(attrStr[i])) i++;
    if (i >= len) break; // trailing whitespace only — nothing left to read

    if (attrStr[i] === '=') {
      // No name before this '=' — not a valid attribute start. Move past
      // just this one character and try again from the next position.
      i = tokenStart + 1;
      continue;
    }

    const leadingWs = attrStr.slice(tokenStart, i);

    // Attribute name — everything up to the next whitespace or '='.
    const nameStart = i;
    while (i < len && !isWhiteSpace(attrStr[i]) && attrStr[i] !== '=') i++;
    const name = attrStr.slice(nameStart, i);

    // Optional whitespace + '='.
    let equalsGroup; // whitespace + '=' text, or undefined if absent
    let j = i;
    while (j < len && isWhiteSpace(attrStr[j])) j++;
    if (j < len && attrStr[j] === '=') {
      equalsGroup = attrStr.slice(i, j + 1);
      i = j + 1;
    }

    // Optional whitespace + quoted value.
    let quoteChar;
    let value;
    let k = i;
    while (k < len && isWhiteSpace(attrStr[k])) k++;
    if (k < len && (attrStr[k] === '"' || attrStr[k] === "'")) {
      const valueStart = k + 1;
      const closeIdx = attrStr.indexOf(attrStr[k], valueStart);
      if (closeIdx !== -1) {
        quoteChar = attrStr[k];
        value = attrStr.slice(valueStart, closeIdx);
        i = closeIdx + 1;
      }
      // No closing quote found anywhere in the rest of the string — leave
      // quoteChar/value undefined, same as the old regex's group failing
      // to match a backreference-less run.
    }

    const token = { startIndex: tokenStart };
    token[1] = leadingWs;
    token[2] = name;
    token[3] = equalsGroup;
    token[4] = quoteChar !== undefined ? true : undefined;
    token[5] = quoteChar;
    token[6] = value;
    tokens.push(token);
  }

  return tokens;
}

//attr, ="sd", a="amit's", a="sd"b="saf", ab  cd=""

function validateAttributeString(attrStr, options) {
  //console.log("start:"+attrStr+":end");

  //if(attrStr.trim().length === 0) return true; //empty string

  const matches = scanAttributeTokens(attrStr);
  const attrNames = {};

  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      //nospace before attribute name: a="sd"b="saf"
      return getErrorObject('InvalidAttr', "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]))
    } else if (matches[i][3] !== undefined && matches[i][4] === undefined) {
      return getErrorObject('InvalidAttr', "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
      //independent attribute: ab
      return getErrorObject('InvalidAttr', "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    /* else if(matches[i][6] === undefined){//attribute without value: ab=
                    return { err: { code:"InvalidAttr",msg:"attribute " + matches[i][2] + " has no value assigned."}};
                } */
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject('InvalidAttr', "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      //check for duplicate attribute.
      attrNames[attrName] = 1;
    } else {
      return getErrorObject('InvalidAttr', "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }

  return true;
}

function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === 'x') {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ';')
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}

function validateAmpersand(xmlData, i) {
  // https://www.w3.org/TR/xml/#dt-charref
  i++;
  if (xmlData[i] === ';')
    return -1;
  if (xmlData[i] === '#') {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ';')
      break;
    return -1;
  }
  return i;
}

function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code: code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col,
    },
  };
}

function validateAttrName(attrName) {
  return isName(attrName);
}

// const startsWithXML = /^xml/i;

function validateTagName(tagname) {
  return isName(tagname) /* && !tagname.match(startsWithXML) */;
}

//this function returns the line number for the character at the given index
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,

    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}

//this function returns the position of the first character of match within attrStr
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}

const defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};


const defaultOptions = {
  preserveOrder: false,
  attributeNamePrefix: '@_',
  attributesGroupName: false,
  textNodeName: '#text',
  ignoreAttributes: true,
  removeNSPrefix: false, // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false, //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true, //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true,
    unicode: false
  },
  tagValueProcessor: function (tagName, val) {
    return val;
  },
  attributeValueProcessor: function (attrName, val) {
    return val;
  },
  stopNodes: [], //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  entityDecoder: null,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function (tagName, jPath, attrs) {
    return tagName
  },
  // skipEmptyListItem: false
  captureMetaData: false,
  maxNestedTags: 100,
  strictReservedNames: true,
  jPath: true, // if true, pass jPath string to callbacks; if false, pass matcher instance
  onDangerousProperty: defaultOnDangerousProperty
};


/**
 * Validates that a property name is safe to use
 * @param {string} propertyName - The property name to validate
 * @param {string} optionName - The option field name (for error message)
 * @throws {Error} If property name is dangerous
 */
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== 'string') {
    return; // Only validate string property names
  }

  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some(dangerous => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }

  if (criticalProperties.some(dangerous => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}

/**
 * Normalizes processEntities option for backward compatibility
 * @param {boolean|object} value 
 * @returns {object} Always returns normalized object
 */
function normalizeProcessEntities(value, htmlEntities) {
  // Boolean backward compatibility
  if (typeof value === 'boolean') {
    return {
      enabled: value, // true or false
      maxEntitySize: 10000,
      maxExpansionDepth: 10000,
      maxTotalExpansions: Infinity,
      maxExpandedLength: 100000,
      maxEntityCount: 1000,
      allowedTags: null,
      tagFilter: null,
      appliesTo: "all",
    };
  }

  // Object config - merge with defaults
  if (typeof value === 'object' && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 10000),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 10000),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 100000),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1000),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null,
      appliesTo: value.appliesTo ?? "all",
    };
  }

  // Default to enabled with limits
  return normalizeProcessEntities(true);
}

const buildOptions = function (options) {
  const built = Object.assign({}, defaultOptions, options);

  // Validate property names to prevent prototype pollution
  const propertyNameOptions = [
    { value: built.attributeNamePrefix, name: 'attributeNamePrefix' },
    { value: built.attributesGroupName, name: 'attributesGroupName' },
    { value: built.textNodeName, name: 'textNodeName' },
    { value: built.cdataPropName, name: 'cdataPropName' },
    { value: built.commentPropName, name: 'commentPropName' }
  ];

  for (const { value, name } of propertyNameOptions) {
    if (value) {
      validatePropertyName(value, name);
    }
  }

  if (built.onDangerousProperty === null) {
    built.onDangerousProperty = defaultOnDangerousProperty;
  }

  // Always normalize processEntities for backward compatibility and validation
  built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
  built.unpairedTagsSet = new Set(built.unpairedTags);
  // Convert old-style stopNodes for backward compatibility
  if (built.stopNodes && Array.isArray(built.stopNodes)) {
    built.stopNodes = built.stopNodes.map(node => {
      if (typeof node === 'string' && node.startsWith('*.')) {
        // Old syntax: *.tagname meant "tagname anywhere"
        // Convert to new syntax: ..tagname
        return '..' + node.substring(2);
      }
      return node;
    });
  }
  //console.debug(built.processEntities)
  return built;
};

let METADATA_SYMBOL$1;

if (typeof Symbol !== "function") {
  METADATA_SYMBOL$1 = "@@xmlMetadata";
} else {
  METADATA_SYMBOL$1 = Symbol("XML Node Metadata");
}

class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = []; //nested tags, text, cdata, comments in order
    this[":@"] = Object.create(null); //attributes map
  }
  add(key, val) {
    // this.child.push( {name : key, val: val, isCdata: isCdata });
    if (key === "__proto__") key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    // if requested, add the startIndex
    this.addStartIndex(startIndex);
  }

  addStartIndex(startIndex) {
    if (startIndex !== undefined) {
      // Note: for now we just overwrite the metadata. If we had more complex metadata,
      // we might need to do an object append here:  metadata = { ...metadata, startIndex }
      this.child[this.child.length - 1][METADATA_SYMBOL$1] = { startIndex };
    }
  }

  addEndIndex(endIndex) {
    const lastChild = this.child[this.child.length - 1];
    // endIndex is write-once: when updateTag drops a node, the last child is a
    // previously completed sibling whose endIndex must not be overwritten
    if (lastChild !== undefined && lastChild[METADATA_SYMBOL$1] !== undefined
      && lastChild[METADATA_SYMBOL$1].endIndex === undefined) {
      lastChild[METADATA_SYMBOL$1].endIndex = endIndex;
    }
  }
  /** symbol used for metadata */
  static getMetaDataSymbol() {
    return METADATA_SYMBOL$1;
  }
}

class DocTypeReader {
    constructor(options, xmlVersion) {
        this.suppressValidationErr = !options;
        this.options = options;
        this.xmlVersion = xmlVersion || 1.0;
    }

    setXmlVersion(xmlVersion = 1.0) {
        this.xmlVersion = xmlVersion;
    }
    readDocType(xmlData, i) {
        const entities = Object.create(null);
        let entityCount = 0;

        if (xmlData[i + 3] === 'O' &&
            xmlData[i + 4] === 'C' &&
            xmlData[i + 5] === 'T' &&
            xmlData[i + 6] === 'Y' &&
            xmlData[i + 7] === 'P' &&
            xmlData[i + 8] === 'E') {
            i = i + 9;
            let angleBracketsCount = 1;
            let hasBody = false, comment = false;
            let quoteChar = null; // tracks an open SYSTEM/PUBLIC literal before the '[' body
            let exp = "";
            for (; i < xmlData.length; i++) {
                // Inside a quoted external-identifier literal — XML allows '<'
                // and '>' as plain data here, so they must not be interpreted
                // as DOCTYPE structure until the matching quote closes.
                if (quoteChar !== null) {
                    if (xmlData[i] === quoteChar) quoteChar = null;
                    exp += xmlData[i];
                    continue;
                }
                if (!hasBody && !comment && (xmlData[i] === '"' || xmlData[i] === "'")) {
                    quoteChar = xmlData[i];
                    exp += xmlData[i];
                    continue;
                }

                if (xmlData[i] === '<' && !comment) { //Determine the tag type
                    if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
                        i += 7;
                        let entityName, val;
                        [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
                        if (val.indexOf("&") === -1) { //Parameter entities are not supported
                            if (this.options.enabled !== false &&
                                this.options.maxEntityCount != null &&
                                entityCount >= this.options.maxEntityCount) {
                                throw new Error(
                                    `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                                );
                            }
                            //const escaped = entityName.replace(/[.\-+*:]/g, '\\.');
                            //const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            entities[entityName] = val;
                            entityCount++;
                        }
                    }
                    else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
                        i += 8;//Not supported
                        const { index } = this.readElementExp(xmlData, i + 1);
                        i = index;
                    } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
                        i += 8;//Not supported
                        // const {index} = this.readAttlistExp(xmlData,i+1);
                        // i = index;
                    } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
                        i += 9;//Not supported
                        const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
                        i = index;
                    } else if (hasSeq(xmlData, "!--", i)) comment = true;
                    else throw new Error(`Invalid DOCTYPE`);

                    angleBracketsCount++;
                    exp = "";
                } else if (xmlData[i] === '>') { //Read tag content
                    if (comment) {
                        if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                            comment = false;
                            angleBracketsCount--;
                        }
                    } else {
                        angleBracketsCount--;
                    }
                    if (angleBracketsCount === 0) {
                        break;
                    }
                } else if (xmlData[i] === '[') {
                    hasBody = true;
                } else {
                    exp += xmlData[i];
                }
            }
            if (quoteChar !== null || angleBracketsCount !== 0) {
                throw new Error(`Unclosed DOCTYPE`);
            }
        } else {
            throw new Error(`Invalid Tag instead of DOCTYPE`);
        }
        return { entities, i };
    }
    readEntityExp(xmlData, i) {
        //External entities are not supported
        //    <!ENTITY ext SYSTEM "http://normal-website.com" >

        //Parameter entities are not supported
        //    <!ENTITY entityname "&anotherElement;">

        //Internal entities are supported
        //    <!ENTITY entityname "replacement text">

        // Skip leading whitespace after <!ENTITY
        i = skipWhitespace(xmlData, i);

        // Read entity name
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
            i++;
        }
        let entityName = xmlData.substring(startIndex, i);

        validateEntityName(entityName, { xmlVersion: this.xmlVersion });

        // Skip whitespace after entity name
        i = skipWhitespace(xmlData, i);

        // Check for unsupported constructs (external entities or parameter entities)
        if (!this.suppressValidationErr) {
            if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
                throw new Error("External entities are not supported");
            } else if (xmlData[i] === "%") {
                throw new Error("Parameter entities are not supported");
            }
        }

        // Read entity value (internal entity)
        let entityValue = "";
        [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");

        // Validate entity size
        if (this.options.enabled !== false &&
            this.options.maxEntitySize != null &&
            entityValue.length > this.options.maxEntitySize) {
            throw new Error(
                `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
            );
        }

        i--;
        return [entityName, entityValue, i];
    }

    readNotationExp(xmlData, i) {
        // Skip leading whitespace after <!NOTATION
        i = skipWhitespace(xmlData, i);

        // Read notation name

        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
        }
        let notationName = xmlData.substring(startIndex, i);

        !this.suppressValidationErr && validateEntityName(notationName, { xmlVersion: this.xmlVersion });

        // Skip whitespace after notation name
        i = skipWhitespace(xmlData, i);

        // Check identifier type (SYSTEM or PUBLIC)
        const identifierType = xmlData.substring(i, i + 6).toUpperCase();
        if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
            throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
        }
        i += identifierType.length;

        // Skip whitespace after identifier type
        i = skipWhitespace(xmlData, i);

        // Read public identifier (if PUBLIC)
        let publicIdentifier = null;
        let systemIdentifier = null;

        if (identifierType === "PUBLIC") {
            [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");

            // Skip whitespace after public identifier
            i = skipWhitespace(xmlData, i);

            // Optionally read system identifier
            if (xmlData[i] === '"' || xmlData[i] === "'") {
                [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
            }
        } else if (identifierType === "SYSTEM") {
            // Read system identifier (mandatory for SYSTEM)
            [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");

            if (!this.suppressValidationErr && !systemIdentifier) {
                throw new Error("Missing mandatory system identifier for SYSTEM notation");
            }
        }

        return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }

    readIdentifierVal(xmlData, i, type) {
        let identifierVal = "";
        const startChar = xmlData[i];
        if (startChar !== '"' && startChar !== "'") {
            throw new Error(`Expected quoted string, found "${startChar}"`);
        }
        i++;

        const startIndex = i;
        while (i < xmlData.length && xmlData[i] !== startChar) {
            i++;
        }
        identifierVal = xmlData.substring(startIndex, i);

        if (xmlData[i] !== startChar) {
            throw new Error(`Unterminated ${type} value`);
        }
        i++;
        return [i, identifierVal];
    }

    readElementExp(xmlData, i) {
        // <!ELEMENT br EMPTY>
        // <!ELEMENT div ANY>
        // <!ELEMENT title (#PCDATA)>
        // <!ELEMENT book (title, author+)>
        // <!ELEMENT name (content-model)>

        // Skip leading whitespace after <!ELEMENT
        i = skipWhitespace(xmlData, i);

        // Read element name
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
        }
        let elementName = xmlData.substring(startIndex, i);

        // Validate element name
        if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
            throw new Error(`Invalid element name: "${elementName}"`);
        }

        // Skip whitespace after element name
        i = skipWhitespace(xmlData, i);
        let contentModel = "";
        // Expect '(' to start content model
        if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
        else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
        else if (xmlData[i] === "(") {
            i++; // Move past '('

            // Read content model
            const startIndex = i;
            while (i < xmlData.length && xmlData[i] !== ")") {
                i++;
            }
            contentModel = xmlData.substring(startIndex, i);

            if (xmlData[i] !== ")") {
                throw new Error("Unterminated content model");
            }

        } else if (!this.suppressValidationErr) {
            throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
        }

        return {
            elementName,
            contentModel: contentModel.trim(),
            index: i
        };
    }

    readAttlistExp(xmlData, i) {
        // Skip leading whitespace after <!ATTLIST
        i = skipWhitespace(xmlData, i);

        // Read element name
        let startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
        }
        let elementName = xmlData.substring(startIndex, i);

        // Validate element name
        validateEntityName(elementName, { xmlVersion: this.xmlVersion });

        // Skip whitespace after element name
        i = skipWhitespace(xmlData, i);

        // Read attribute name
        startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
        }
        let attributeName = xmlData.substring(startIndex, i);

        // Validate attribute name
        if (!validateEntityName(attributeName, { xmlVersion: this.xmlVersion })) {
            throw new Error(`Invalid attribute name: "${attributeName}"`);
        }

        // Skip whitespace after attribute name
        i = skipWhitespace(xmlData, i);

        // Read attribute type
        let attributeType = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
            attributeType = "NOTATION";
            i += 8; // Move past "NOTATION"

            // Skip whitespace after "NOTATION"
            i = skipWhitespace(xmlData, i);

            // Expect '(' to start the list of notations
            if (xmlData[i] !== "(") {
                throw new Error(`Expected '(', found "${xmlData[i]}"`);
            }
            i++; // Move past '('

            // Read the list of allowed notations
            let allowedNotations = [];
            while (i < xmlData.length && xmlData[i] !== ")") {


                const startIndex = i;
                while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
                    i++;
                }
                let notation = xmlData.substring(startIndex, i);

                // Validate notation name
                notation = notation.trim();
                if (!validateEntityName(notation, { xmlVersion: this.xmlVersion })) {
                    throw new Error(`Invalid notation name: "${notation}"`);
                }

                allowedNotations.push(notation);

                // Skip '|' separator or exit loop
                if (xmlData[i] === "|") {
                    i++; // Move past '|'
                    i = skipWhitespace(xmlData, i); // Skip optional whitespace after '|'
                }
            }

            if (xmlData[i] !== ")") {
                throw new Error("Unterminated list of notations");
            }
            i++; // Move past ')'

            // Store the allowed notations as part of the attribute type
            attributeType += " (" + allowedNotations.join("|") + ")";
        } else {
            // Handle simple types (e.g., CDATA, ID, IDREF, etc.)
            const startIndex = i;
            while (i < xmlData.length && !/\s/.test(xmlData[i])) {
                i++;
            }
            attributeType += xmlData.substring(startIndex, i);

            // Validate simple attribute type
            const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
            if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
                throw new Error(`Invalid attribute type: "${attributeType}"`);
            }
        }

        // Skip whitespace after attribute type
        i = skipWhitespace(xmlData, i);

        // Read default value
        let defaultValue = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
            defaultValue = "#REQUIRED";
            i += 8;
        } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
            defaultValue = "#IMPLIED";
            i += 7;
        } else {
            [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
        }

        return {
            elementName,
            attributeName,
            attributeType,
            defaultValue,
            index: i
        }
    }
}



const skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
        index++;
    }
    return index;
};



function hasSeq(data, seq, i) {
    for (let j = 0; j < seq.length; j++) {
        if (seq[j] !== data[i + j + 1]) return false;
    }
    return true;
}

function validateEntityName(name, xmlVersion) {
    if (qName(name, { xmlVersion: xmlVersion }))
        return name;
    else
        throw new Error(`Invalid entity name ${name}`);
}

function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === 'function') {
        return ignoreAttributes
    }
    if (Array.isArray(ignoreAttributes)) {
        return (attrName) => {
            for (const pattern of ignoreAttributes) {
                if (typeof pattern === 'string' && attrName === pattern) {
                    return true
                }
                if (pattern instanceof RegExp && pattern.test(attrName)) {
                    return true
                }
            }
        }
    }
    return () => false
}

// const regx =
//   '<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)'
//   .replace(/NAME/g, util.nameRegexp);

//const tagsRegx = new RegExp("<(\\/?[\\w:\\-\._]+)([^>]*)>(\\s*"+cdataRegx+")*([^<]+)?","g");
//const tagsRegx = new RegExp("<(\\/?)((\\w*:)?([\\w:\\-\._]+))([^>]*)>([^<]*)("+cdataRegx+"([^<]*))*([^<]+)?","g");

// Helper functions for attribute and namespace handling

/**
 * Extract raw attributes (without prefix) from prefixed attribute map
 * @param {object} prefixedAttrs - Attributes with prefix from buildAttributesMap
 * @param {object} options - Parser options containing attributeNamePrefix
 * @returns {object} Raw attributes for matcher
 */
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};

  // Handle attributesGroupName option
  const attrs = options.attributesGroupName
    ? prefixedAttrs[options.attributesGroupName]
    : prefixedAttrs;

  if (!attrs) return {};

  const rawAttrs = {};
  for (const key in attrs) {
    // Remove the attribute prefix to get raw name
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      // Attribute without prefix (shouldn't normally happen, but be safe)
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}

/**
 * Extract namespace from raw tag name
 * @param {string} rawTagName - Tag name possibly with namespace (e.g., "soap:Envelope")
 * @returns {string|undefined} Namespace or undefined
 */
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== 'string') return undefined;

  const colonIndex = rawTagName.indexOf(':');
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    // Don't treat xmlns as a namespace
    if (ns !== 'xmlns') {
      return ns;
    }
  }
  return undefined;
}

class OrderedObjParser {
  constructor(options, externalEntities) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;
    this.doctypefound = false;
    let namedEntities = { ...XML };
    if (this.options.entityDecoder) {
      this.entityDecoder = this.options.entityDecoder;
    } else {
      if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
      else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
      this.entityDecoder = new EntityDecoder({
        namedEntities: { ...namedEntities, ...externalEntities },
        numericAllowed: this.options.htmlEntities,
        limit: {
          maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
          maxExpandedLength: this.options.processEntities.maxExpandedLength,
          applyLimitsTo: this.options.processEntities.appliesTo,
        },
        // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
        onInputEntity: (name, value) =>
          //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
          isUnsafe(value, [HTML_PATTERNS, XML_PATTERNS]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW,

        //postCheck: resolved => resolved
      });
    }

    // Initialize path matcher for path-expression-matcher
    this.matcher = new Matcher();
    this.readonlyMatcher = this.matcher.readOnly();

    // Flag to track if current node is a stop node (optimization)
    this.isCurrentNodeStopNode = false;

    // Pre-compile stopNodes expressions
    this.stopNodeExpressionsSet = new ExpressionSet();
    const stopNodesOpts = this.options.stopNodes;
    if (stopNodesOpts && stopNodesOpts.length > 0) {
      for (let i = 0; i < stopNodesOpts.length; i++) {
        const stopNodeExp = stopNodesOpts[i];
        if (typeof stopNodeExp === 'string') {
          // Convert string to Expression object
          this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
        } else if (stopNodeExp instanceof Expression) {
          // Already an Expression object
          this.stopNodeExpressionsSet.add(stopNodeExp);
        }
      }
      this.stopNodeExpressionsSet.seal();
    }
  }

}


/**
 * @param {string} val
 * @param {string} tagName
 * @param {string|Matcher} jPath - jPath string or Matcher instance based on options.jPath
 * @param {boolean} dontTrim
 * @param {boolean} hasAttributes
 * @param {boolean} isLeafNode
 * @param {boolean} escapeEntities
 */
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  const options = this.options;
  if (val !== undefined) {
    if (options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);

      // Pass jPath string or matcher based on options.jPath setting
      const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
      const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === undefined) {
        //don't parse
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        //overwrite
        return newval;
      } else if (options.trimValues) {
        return parseValue(val, options.parseTagValue, options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}

function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(':');
    const prefix = tagname.charAt(0) === '/' ? '/' : '';
    if (tags[0] === 'xmlns') {
      return '';
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}

//TODO: change regex to capture NS
//const attrsRegx = new RegExp("([\\w\\-\\.\\:]+)\\s*=\\s*(['\"])((.|\n)*?)\\2","gm");
const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

function buildAttributesMap(attrStr, jPath, tagName, force = false) {
  const options = this.options;
  if (force === true || (options.ignoreAttributes !== true && typeof attrStr === 'string')) {
    // attrStr = attrStr.replace(/\r?\n/g, ' ');
    //attrStr = attrStr || attrStr.trim();

    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length; //don't make it inline
    const attrs = {};

    // Pre-process values once: trim + entity replacement
    // Reused in both matcher update and second pass
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};

    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];

      if (attrName.length && oldVal !== undefined) {
        let val = oldVal;
        if (options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;

        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }

    // Update matcher ONCE before second pass, if applicable
    if (hasRawAttrs && typeof jPath === 'object' && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }

    // Hoist toString() once — path doesn't change during attribute processing
    const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;

    // Second pass: apply processors, build final attrs
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);

      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;

      let aName = options.attributeNamePrefix + attrName;

      if (attrName.length) {
        if (options.transformAttributeName) {
          aName = options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, options);

        if (matches[i][4] !== undefined) {
          // Reuse already-processed value — no double entity replacement
          const oldVal = processedVals[i];

          const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === undefined) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }

    if (!hasAttrs) return;

    if (options.attributesGroupName && !options.preserveOrder) {
      const attrCollection = {};
      attrCollection[options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
const parseXml = function (xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n"); //TODO: remove this line
  const xmlObj = new XmlNode('!xml');
  let currentNode = xmlObj;
  let textData = "";

  // Reset matcher for new document
  this.matcher.reset();
  this.entityDecoder.reset();

  // Reset entity expansion counters for this document
  this.entityExpansionCount = 0;
  this.currentExpandedLength = 0;
  this.doctypefound = false;
  const options = this.options;
  const docTypeReader = new DocTypeReader(options.processEntities);
  const xmlLen = xmlData.length;
  for (let i = 0; i < xmlLen; i++) {//for each char in XML data
    const ch = xmlData[i];
    if (ch === '<') {
      // const nextIndex = i+1;
      // const _2ndChar = xmlData[nextIndex];
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {//Closing Tag '/'
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();

        if (options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }

        tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;

        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        }

        //check if last tag of nested tag was unpaired tag
        const lastTagName = this.matcher.getCurrentTag();
        if (tagName && options.unpairedTagsSet.has(tagName)) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
          // Pop the unpaired tag
          this.matcher.pop();
          this.tagsNodeStack.pop();
        }
        // Pop the closing tag
        this.matcher.pop();
        this.isCurrentNodeStopNode = false; // Reset flag when closing tag

        //a closing tag with no matching opening tag leaves the stack empty
        currentNode = this.tagsNodeStack.pop() || xmlObj;//avoid recursion, set the parent tag scope

        if (options.captureMetaData && currentNode) {
          currentNode.addEndIndex(closeIndex + 1);
        }
        textData = "";
        i = closeIndex;
      } else if (c1 === 63) { //'?'

        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");

        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
        const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
        if (attsMap) {
          const ver = attsMap[this.options.attributeNamePrefix + "version"];
          this.entityDecoder.setXmlVersion(Number(ver) || 1.0);
          docTypeReader.setXmlVersion(Number(ver) || 1.0);
        }
        if ((options.ignoreDeclaration && tagData.tagName === "?xml") || options.ignorePiTags) ; else {

          const childNode = new XmlNode(tagData.tagName);
          childNode.add(options.textNodeName, "");

          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
            childNode[":@"] = attsMap;
          }
          this.addChild(currentNode, childNode, this.readonlyMatcher, i);

          if (options.captureMetaData) {
            // closeIndex points at '?' of the closing '?>'
            currentNode.addEndIndex(tagData.closeIndex + 2);
          }
        }


        i = tagData.closeIndex + 1;
      } else if (c1 === 33
        && xmlData.charCodeAt(i + 2) === 45
        && xmlData.charCodeAt(i + 3) === 45) { //'!--'
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);

          textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);

          currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (c1 === 33
        && xmlData.charCodeAt(i + 2) === 68) { //'!D'
        if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
        this.doctypefound = true;
        const result = docTypeReader.readDocType(xmlData, i);
        this.entityDecoder.addInputEntities(result.entities);
        i = result.i;
      } else if (c1 === 33
        && xmlData.charCodeAt(i + 2) === 91) { // '!['
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);

        textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);

        let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
        if (val == undefined) val = "";

        //cdata should be set even if it is 0 length string
        if (options.cdataPropName) {
          currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(options.textNodeName, val);
        }

        i = closeIndex + 2;
      } else {//Opening tag
        let result = readTagExp(xmlData, i, options.removeNSPrefix);

        // Safety check: readTagExp can return undefined
        if (!result) {
          // Log context for debugging
          const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
          throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
        }

        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;

        ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));

        if (options.strictReservedNames &&
          (tagName === options.commentPropName
            || tagName === options.cdataPropName
            || tagName === options.textNodeName
            || tagName === options.attributesGroupName
          )) {
          throw new Error(`Invalid tag name: ${tagName}`);
        }

        //save text as child node
        if (currentNode && textData) {
          if (currentNode.tagname !== '!xml') {
            //when nested tag is found
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
          }
        }

        //check if last tag was unpaired tag
        const lastTag = currentNode;
        if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
          currentNode = this.tagsNodeStack.pop();
          this.matcher.pop();
        }

        // Clean up self-closing syntax BEFORE processing attributes
        // This is where tagExp gets the trailing / removed
        let isSelfClosing = false;
        if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
          isSelfClosing = true;
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          } else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }

          // Re-check attrExpPresent after cleaning
          attrExpPresent = (tagName !== tagExp);
        }

        // Now process attributes with CLEAN tagExp (no trailing /)
        let prefixedAttrs = null;
        let namespace = undefined;

        // Extract namespace from rawTagName
        namespace = extractNamespace(rawTagName);

        // Push tag to matcher FIRST (with empty attrs for now) so callbacks see correct path
        if (tagName !== xmlObj.tagname) {
          this.matcher.push(tagName, {}, namespace);
        }

        // Now build attributes - callbacks will see correct matcher state
        if (tagName !== tagExp && attrExpPresent) {
          // Build attributes (returns prefixed attributes for the tree)
          // Note: buildAttributesMap now internally updates the matcher with raw attributes
          prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);

          if (prefixedAttrs) {
            // Extract raw attributes (without prefix) for our use
            //TODO: seems a performance overhead
            extractRawAttributes(prefixedAttrs, options);
          }
        }

        // Now check if this is a stop node (after attributes are set)
        if (tagName !== xmlObj.tagname) {
          this.isCurrentNodeStopNode = this.isItStopNode();
        }

        const startIndex = i;
        if (this.isCurrentNodeStopNode) {
          let tagContent = "";

          // For self-closing tags, content is empty
          if (isSelfClosing) {
            i = result.closeIndex;
          }
          //unpaired tag
          else if (options.unpairedTagsSet.has(tagName)) {
            i = result.closeIndex;
          }
          //normal tag
          else {
            //read until closing tag is found
            const result = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result.i;
            tagContent = result.tagContent;
          }

          const childNode = new XmlNode(tagName);

          if (prefixedAttrs) {
            childNode[":@"] = prefixedAttrs;
          }

          // For stop nodes, store raw content as-is without any processing
          childNode.add(options.textNodeName, tagContent);

          this.matcher.pop(); // Pop the stop node tag
          this.isCurrentNodeStopNode = false; // Reset flag

          this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);

          if (options.captureMetaData) {
            currentNode.addEndIndex(i + 1);
          }
        } else {
          //selfClosing tag
          if (isSelfClosing) {
            ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));

            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);

            if (options.captureMetaData) {
              currentNode.addEndIndex(closeIndex + 1);
            }
            this.matcher.pop(); // Pop self-closing tag
            this.isCurrentNodeStopNode = false; // Reset flag
          }
          else if (options.unpairedTagsSet.has(tagName)) {//unpaired tag
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);

            if (options.captureMetaData) {
              currentNode.addEndIndex(result.closeIndex + 1);
            }
            this.matcher.pop(); // Pop unpaired tag
            this.isCurrentNodeStopNode = false; // Reset flag
            i = result.closeIndex;
            // Continue to next iteration without changing currentNode
            continue;
          }
          //opening tag
          else {
            const childNode = new XmlNode(tagName);
            if (this.tagsNodeStack.length > options.maxNestedTags) {
              throw new Error("Maximum nested tags exceeded");
            }
            this.tagsNodeStack.push(currentNode);

            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};

function addChild(currentNode, childNode, matcher, startIndex) {
  // unset startIndex if not requested
  if (!this.options.captureMetaData) startIndex = undefined;

  // Pass jPath string or matcher based on options.jPath setting
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) ; else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}

/**
 * @param {object} val - Entity object with regex and val properties
 * @param {string} tagName - Tag name
 * @param {string|Matcher} jPath - jPath string or Matcher instance based on options.jPath
 */
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;

  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }

  // Check if tag is allowed to contain entities
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags)
      ? entityConfig.allowedTags.includes(tagName)
      : entityConfig.allowedTags(tagName, jPathOrMatcher);

    if (!allowed) {
      return val;
    }
  }

  // Apply custom tag filter if provided
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val; // Skip based on custom filter
    }
  }

  return this.entityDecoder.decode(val);
}


function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) { //store previously collected data as textNode
    if (isLeafNode === undefined) isLeafNode = parentNode.child.length === 0;

    textData = this.parseTextData(textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode);

    if (textData !== undefined && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}

/**
 * @param {Array<Expression>} stopNodeExpressions - Array of compiled Expression objects
 * @param {Matcher} matcher - Current path matcher
 */
function isItStopNode() {
  if (this.stopNodeExpressionsSet.size === 0) return false;

  return this.matcher.matchesAny(this.stopNodeExpressionsSet);
}

/**
 * Returns the tag Expression and where it is ending handling single-double quotes situation
 * @param {string} xmlData 
 * @param {number} i starting index
 * @returns 
 */
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  //TODO: ignore boolean attributes in tag expression
  //TODO: if ignore attributes, dont read full attribute expression but the end. But read for xml declaration
  let attrBoundary = 0;
  const len = xmlData.length;
  const closeCode0 = closingChar.charCodeAt(0);
  const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;

  let result = '';
  let segmentStart = i;

  for (let index = i; index < len; index++) {
    const code = xmlData.charCodeAt(index);

    if (attrBoundary) {
      if (code === attrBoundary) attrBoundary = 0;
    } else if (code === 34 || code === 39) { // " or '
      attrBoundary = code;
    } else if (code === closeCode0) {
      if (closeCode1 !== -1) {
        if (xmlData.charCodeAt(index + 1) === closeCode1) {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else {
        result += xmlData.substring(segmentStart, index);
        return { data: result, index };
      }
    } else if (code === 9 && !attrBoundary) { // \t - only replace with space outside attribute values
      // Flush accumulated segment, add space, start new segment
      result += xmlData.substring(segmentStart, index) + ' ';
      segmentStart = index + 1;
    }
  }
}

function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg)
  } else {
    return closingIndex + str.length - 1;
  }
}

function findClosingChar(xmlData, char, i, errMsg) {
  const closingIndex = xmlData.indexOf(char, i);
  if (closingIndex === -1) throw new Error(errMsg);
  return closingIndex; // no offset needed
}

function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {//separate tag name and attributes expression
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }

  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }

  return {
    tagName: tagName,
    tagExp: tagExp,
    closeIndex: closeIndex,
    attrExpPresent: attrExpPresent,
    rawTagName: rawTagName,
  }
}
/**
 * find paired tag for a stop node
 * @param {string} xmlData 
 * @param {string} tagName 
 * @param {number} i 
 */
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  // Starting at 1 since we already have an open tag
  let openTagCount = 1;

  const xmllen = xmlData.length;
  for (; i < xmllen; i++) {
    if (xmlData[i] === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {//close tag '/'
        const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            }
          }
        }
        i = closeIndex;
      } else if (c1 === 63) { //?
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33
        && xmlData.charCodeAt(i + 2) === 45
        && xmlData.charCodeAt(i + 3) === 45) { // '!--'
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33
        && xmlData.charCodeAt(i + 2) === 91) { // '!['
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, false);

        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }//end for loop
}

function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === 'string') {
    //console.log(options)
    const newval = val.trim();
    if (newval === 'true') return true;
    else if (newval === 'false') return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return '';
    }
  }
}

function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}



function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}

const METADATA_SYMBOL = XmlNode.getMetaDataSymbol();

/**
 * Helper function to strip attribute prefix from attribute map
 * @param {object} attrs - Attributes with prefix (e.g., {"@_class": "code"})
 * @param {string} prefix - Attribute prefix to remove (e.g., "@_")
 * @returns {object} Attributes without prefix (e.g., {"class": "code"})
 */
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== 'object') return {};
  if (!prefix) return attrs;

  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      // Attribute without prefix (shouldn't normally happen, but be safe)
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}

/**
 * 
 * @param {array} node 
 * @param {any} options 
 * @param {Matcher} matcher - Path matcher instance
 * @returns 
 */
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}

/**
 * @param {array} arr 
 * @param {object} options 
 * @param {Matcher} matcher - Path matcher instance
 * @returns object
 */
function compress(arr, options, matcher, readonlyMatcher) {
  let text;
  const compressedObj = {}; //This is intended to be a plain object
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);

    // Push current property to matcher WITH RAW ATTRIBUTES (no prefix)
    if (property !== undefined && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }

    if (property === options.textNodeName) {
      if (text === undefined) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === undefined) {
      continue;
    } else if (tagObj[property]) {

      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);

      if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
        val[options.textNodeName] = "";
      }

      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== undefined && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }

      if (tagObj[METADATA_SYMBOL] !== undefined && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL] = tagObj[METADATA_SYMBOL]; // copy over metadata
      }


      if (compressedObj[property] !== undefined && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        //TODO: if a node is not an array, then check if it should be an array
        //also determine if it is a leaf node

        // Pass jPath string or readonlyMatcher based on options.jPath setting
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }

      // Pop property from matcher after processing
      if (property !== undefined && property !== options.textNodeName) {
        matcher.pop();
      }
    }

  }
  // if(text && text.length > 0) compressedObj[options.textNodeName] = text;
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== undefined) compressedObj[options.textNodeName] = text;


  return compressedObj;
}

function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}

function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length; //don't make it inline
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];  // This is the PREFIXED name (e.g., "@_class")

      // Strip prefix for matcher path (for isArray callback)
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix)
        ? atrrName.substring(options.attributeNamePrefix.length)
        : atrrName;

      // For attributes, we need to create a temporary path
      // Pass jPath string or matcher based on options.jPath setting
      const jPathOrMatcher = options.jPath
        ? readonlyMatcher.toString() + "." + rawAttrName
        : readonlyMatcher;

      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}

function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;

  if (propCount === 0) {
    return true;
  }

  if (
    propCount === 1 &&
    (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)
  ) {
    return true;
  }

  return false;
}

/* global Uint8Array */

class XMLParser {

    constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);

    }
    /**
     * Parse XML dats to JS object 
     * @param {string|Uint8Array} xmlData 
     * @param {boolean|Object} validationOption 
     */
    parse(xmlData, validationOption) {
        if (typeof xmlData !== "string" && xmlData.toString) {
            if (xmlData instanceof Uint8Array &&
                !(typeof Buffer !== "undefined" && Buffer.isBuffer(xmlData))) {
                xmlData = new TextDecoder("utf-8", { ignoreBOM: true }).decode(xmlData);
            } else {
                xmlData = xmlData.toString();
            }
        } else if (typeof xmlData !== "string") {
            throw new Error("XML data is accepted in String or Bytes[] form.")
        }

        if (validationOption) {
            if (validationOption === true) validationOption = {}; //validate with default options

            const result = validate(xmlData, validationOption);
            if (result !== true) {
                throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`)
            }
        }
        const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
        // orderedObjParser.entityDecoder.setExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === undefined) return orderedResult;
        else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
    }

    /**
     * Add Entity which is not by default supported by this library
     * @param {string} key 
     * @param {string} value 
     */
    addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
            throw new Error("Entity value can't have '&'")
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
            throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'")
        } else if (value === "&") {
            throw new Error("An entity with value '&' is not permitted");
        } else {
            this.externalEntities[key] = value;
        }
    }

    /**
     * Returns a Symbol that can be used to access the metadata
     * property on a node.
     * 
     * If Symbol is not available in the environment, an ordinary property is used
     * and the name of the property is here returned.
     * 
     * The XMLMetaData property is only present when `captureMetaData`
     * is true in the options.
     */
    static getMetaDataSymbol() {
        return XmlNode.getMetaDataSymbol();
    }
}

export { XMLParser as X };
