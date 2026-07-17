// ============================================
// C++ Code Visualizer — Lexer (Tokenizer)
// ============================================

/**
 * Token types produced by the lexer
 */
export const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  CHAR: 'CHAR',
  BOOL: 'BOOL',

  // Identifiers & keywords
  IDENTIFIER: 'IDENTIFIER',
  KEYWORD: 'KEYWORD',
  TYPE: 'TYPE',
  STL_TYPE: 'STL_TYPE',

  // Operators
  OPERATOR: 'OPERATOR',
  ASSIGN: 'ASSIGN',
  COMPOUND_ASSIGN: 'COMPOUND_ASSIGN',
  COMPARISON: 'COMPARISON',
  LOGICAL: 'LOGICAL',
  INCREMENT: 'INCREMENT',
  ARROW: 'ARROW',
  SCOPE: 'SCOPE',
  STREAM: 'STREAM',

  // Punctuation
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  SEMICOLON: 'SEMICOLON',
  COMMA: 'COMMA',
  DOT: 'DOT',
  COLON: 'COLON',
  QUESTION: 'QUESTION',
  LANGLE: 'LANGLE',
  RANGLE: 'RANGLE',

  // Special
  COMMENT: 'COMMENT',
  EOF: 'EOF',
};

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue',
  'switch', 'case', 'default', 'const', 'auto', 'sizeof', 'new', 'delete',
  'true', 'false', 'nullptr', 'NULL',
  'class', 'struct', 'public', 'private', 'protected', 'void',
  'using', 'namespace', 'std', 'include',
  'cout', 'cin', 'endl', 'cerr',
]);

const TYPES = new Set([
  'int', 'float', 'double', 'char', 'bool', 'string', 'long', 'short',
  'unsigned', 'signed', 'size_t', 'void',
]);

const STL_TYPES = new Set([
  'vector', 'array', 'deque',
  'map', 'unordered_map', 'multimap', 'unordered_multimap',
  'set', 'unordered_set', 'multiset', 'unordered_multiset',
  'stack', 'queue', 'priority_queue',
  'pair', 'tuple',
  'list', 'forward_list',
]);

/**
 * Creates a token object
 */
function makeToken(type, value, line, column) {
  return { type, value, line, column };
}

/**
 * Tokenizes C++ source code into an array of tokens
 * @param {string} source - C++ source code
 * @returns {Token[]} Array of tokens
 */
export function lex(source) {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  const peek = (offset = 0) => source[pos + offset];
  const advance = () => {
    const ch = source[pos++];
    if (ch === '\n') { line++; col = 1; } else { col++; }
    return ch;
  };
  const isAtEnd = () => pos >= source.length;
  const isDigit = (c) => c >= '0' && c <= '9';
  const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  const isAlphaNumeric = (c) => isAlpha(c) || isDigit(c);

  while (!isAtEnd()) {
    const startLine = line;
    const startCol = col;
    const ch = peek();

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    // Skip #include and #define preprocessor directives
    if (ch === '#') {
      while (!isAtEnd() && peek() !== '\n') advance();
      continue;
    }

    // Comments
    if (ch === '/' && peek(1) === '/') {
      // Single-line comment
      while (!isAtEnd() && peek() !== '\n') advance();
      continue;
    }
    if (ch === '/' && peek(1) === '*') {
      // Multi-line comment
      advance(); advance();
      while (!isAtEnd() && !(peek() === '*' && peek(1) === '/')) advance();
      if (!isAtEnd()) { advance(); advance(); }
      continue;
    }

    // Numbers
    if (isDigit(ch) || (ch === '.' && peek(1) && isDigit(peek(1)))) {
      let num = '';
      let hasDecimal = false;
      while (!isAtEnd() && (isDigit(peek()) || peek() === '.')) {
        if (peek() === '.') {
          if (hasDecimal) break;
          hasDecimal = true;
        }
        num += advance();
      }
      // Skip type suffixes (e.g., 1.0f, 1L)
      if (!isAtEnd() && (peek() === 'f' || peek() === 'F' || peek() === 'l' || peek() === 'L')) {
        advance();
      }
      tokens.push(makeToken(TokenType.NUMBER, num, startLine, startCol));
      continue;
    }

    // String literals
    if (ch === '"') {
      advance(); // opening "
      let str = '';
      while (!isAtEnd() && peek() !== '"') {
        if (peek() === '\\') { str += advance(); } // escape char
        str += advance();
      }
      if (!isAtEnd()) advance(); // closing "
      tokens.push(makeToken(TokenType.STRING, str, startLine, startCol));
      continue;
    }

    // Char literals
    if (ch === '\'') {
      advance(); // opening '
      let chr = '';
      if (!isAtEnd() && peek() === '\\') {
        chr += advance(); // backslash
      }
      if (!isAtEnd()) chr += advance(); // character
      if (!isAtEnd()) advance(); // closing '
      tokens.push(makeToken(TokenType.CHAR, chr, startLine, startCol));
      continue;
    }

    // Identifiers and keywords
    if (isAlpha(ch)) {
      let ident = '';
      while (!isAtEnd() && isAlphaNumeric(peek())) {
        ident += advance();
      }

      if (ident === 'true' || ident === 'false') {
        tokens.push(makeToken(TokenType.BOOL, ident, startLine, startCol));
      } else if (TYPES.has(ident)) {
        tokens.push(makeToken(TokenType.TYPE, ident, startLine, startCol));
      } else if (STL_TYPES.has(ident)) {
        tokens.push(makeToken(TokenType.STL_TYPE, ident, startLine, startCol));
      } else if (KEYWORDS.has(ident)) {
        tokens.push(makeToken(TokenType.KEYWORD, ident, startLine, startCol));
      } else {
        tokens.push(makeToken(TokenType.IDENTIFIER, ident, startLine, startCol));
      }
      continue;
    }

    // Two-character operators
    if (pos + 1 < source.length) {
      const two = ch + peek(1);
      if (two === '::') { advance(); advance(); tokens.push(makeToken(TokenType.SCOPE, '::', startLine, startCol)); continue; }
      if (two === '->') { advance(); advance(); tokens.push(makeToken(TokenType.ARROW, '->', startLine, startCol)); continue; }
      if (two === '<<') { advance(); advance(); tokens.push(makeToken(TokenType.STREAM, '<<', startLine, startCol)); continue; }
      if (two === '>>') { advance(); advance(); tokens.push(makeToken(TokenType.STREAM, '>>', startLine, startCol)); continue; }
      if (two === '++') { advance(); advance(); tokens.push(makeToken(TokenType.INCREMENT, '++', startLine, startCol)); continue; }
      if (two === '--') { advance(); advance(); tokens.push(makeToken(TokenType.INCREMENT, '--', startLine, startCol)); continue; }
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        advance(); advance();
        tokens.push(makeToken(TokenType.COMPARISON, two, startLine, startCol));
        continue;
      }
      if (two === '&&' || two === '||') {
        advance(); advance();
        tokens.push(makeToken(TokenType.LOGICAL, two, startLine, startCol));
        continue;
      }
      if (two === '+=' || two === '-=' || two === '*=' || two === '/=' || two === '%=') {
        advance(); advance();
        tokens.push(makeToken(TokenType.COMPOUND_ASSIGN, two, startLine, startCol));
        continue;
      }
    }

    // Single character tokens
    switch (ch) {
      case '(': advance(); tokens.push(makeToken(TokenType.LPAREN, '(', startLine, startCol)); continue;
      case ')': advance(); tokens.push(makeToken(TokenType.RPAREN, ')', startLine, startCol)); continue;
      case '{': advance(); tokens.push(makeToken(TokenType.LBRACE, '{', startLine, startCol)); continue;
      case '}': advance(); tokens.push(makeToken(TokenType.RBRACE, '}', startLine, startCol)); continue;
      case '[': advance(); tokens.push(makeToken(TokenType.LBRACKET, '[', startLine, startCol)); continue;
      case ']': advance(); tokens.push(makeToken(TokenType.RBRACKET, ']', startLine, startCol)); continue;
      case ';': advance(); tokens.push(makeToken(TokenType.SEMICOLON, ';', startLine, startCol)); continue;
      case ',': advance(); tokens.push(makeToken(TokenType.COMMA, ',', startLine, startCol)); continue;
      case '.': advance(); tokens.push(makeToken(TokenType.DOT, '.', startLine, startCol)); continue;
      case ':': advance(); tokens.push(makeToken(TokenType.COLON, ':', startLine, startCol)); continue;
      case '?': advance(); tokens.push(makeToken(TokenType.QUESTION, '?', startLine, startCol)); continue;
      case '=': advance(); tokens.push(makeToken(TokenType.ASSIGN, '=', startLine, startCol)); continue;
      case '<': advance(); tokens.push(makeToken(TokenType.LANGLE, '<', startLine, startCol)); continue;
      case '>': advance(); tokens.push(makeToken(TokenType.RANGLE, '>', startLine, startCol)); continue;
      case '!': advance(); tokens.push(makeToken(TokenType.OPERATOR, '!', startLine, startCol)); continue;
      case '+': advance(); tokens.push(makeToken(TokenType.OPERATOR, '+', startLine, startCol)); continue;
      case '-': advance(); tokens.push(makeToken(TokenType.OPERATOR, '-', startLine, startCol)); continue;
      case '*': advance(); tokens.push(makeToken(TokenType.OPERATOR, '*', startLine, startCol)); continue;
      case '/': advance(); tokens.push(makeToken(TokenType.OPERATOR, '/', startLine, startCol)); continue;
      case '%': advance(); tokens.push(makeToken(TokenType.OPERATOR, '%', startLine, startCol)); continue;
      case '&': advance(); tokens.push(makeToken(TokenType.OPERATOR, '&', startLine, startCol)); continue;
      case '|': advance(); tokens.push(makeToken(TokenType.OPERATOR, '|', startLine, startCol)); continue;
      case '~': advance(); tokens.push(makeToken(TokenType.OPERATOR, '~', startLine, startCol)); continue;
      case '^': advance(); tokens.push(makeToken(TokenType.OPERATOR, '^', startLine, startCol)); continue;
      default:
        advance(); // skip unknown characters
        continue;
    }
  }

  tokens.push(makeToken(TokenType.EOF, '', line, col));
  return tokens;
}
