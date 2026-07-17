// ============================================
// C++ Code Visualizer — Parser (AST Generator)
// ============================================

import { TokenType } from './lexer.js';

/**
 * AST Node types
 */
export const NodeType = {
  Program: 'Program',
  FunctionDeclaration: 'FunctionDeclaration',
  VariableDeclaration: 'VariableDeclaration',
  Assignment: 'Assignment',
  CompoundAssignment: 'CompoundAssignment',
  IfStatement: 'IfStatement',
  ForStatement: 'ForStatement',
  WhileStatement: 'WhileStatement',
  DoWhileStatement: 'DoWhileStatement',
  ReturnStatement: 'ReturnStatement',
  BreakStatement: 'BreakStatement',
  ContinueStatement: 'ContinueStatement',
  ExpressionStatement: 'ExpressionStatement',
  Block: 'Block',
  BinaryExpression: 'BinaryExpression',
  UnaryExpression: 'UnaryExpression',
  PostfixExpression: 'PostfixExpression',
  CallExpression: 'CallExpression',
  MemberExpression: 'MemberExpression',
  IndexExpression: 'IndexExpression',
  Identifier: 'Identifier',
  NumericLiteral: 'NumericLiteral',
  StringLiteral: 'StringLiteral',
  CharLiteral: 'CharLiteral',
  BoolLiteral: 'BoolLiteral',
  ArrayLiteral: 'ArrayLiteral',
  CoutStatement: 'CoutStatement',
  TernaryExpression: 'TernaryExpression',
  ScopeResolution: 'ScopeResolution',
  CastExpression: 'CastExpression',
};

/**
 * Parser class — converts token stream to AST
 */
export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  // ---- Helpers ----

  peek(offset = 0) {
    return this.tokens[this.pos + offset] || { type: TokenType.EOF, value: '' };
  }

  current() {
    return this.peek();
  }

  advance() {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  expect(type, value) {
    const tok = this.current();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw new Error(`Parser Error at line ${tok.line}: Expected ${type}${value ? ` '${value}'` : ''}, got ${tok.type} '${tok.value}'`);
    }
    return this.advance();
  }

  match(type, value) {
    const tok = this.current();
    if (tok.type === type && (value === undefined || tok.value === value)) {
      return this.advance();
    }
    return null;
  }

  is(type, value) {
    const tok = this.current();
    return tok.type === type && (value === undefined || tok.value === value);
  }

  isType() {
    const tok = this.current();
    return tok.type === TokenType.TYPE || tok.type === TokenType.STL_TYPE ||
      (tok.type === TokenType.KEYWORD && (tok.value === 'auto' || tok.value === 'const' || tok.value === 'void'));
  }

  /**
   * Parse the entire source into a Program AST
   */
  parse() {
    const body = [];
    while (!this.is(TokenType.EOF)) {
      // Skip 'using namespace std;'
      if (this.is(TokenType.KEYWORD, 'using')) {
        while (!this.is(TokenType.SEMICOLON) && !this.is(TokenType.EOF)) this.advance();
        this.match(TokenType.SEMICOLON);
        continue;
      }
      body.push(this.parseTopLevel());
    }
    return { type: NodeType.Program, body, line: 1 };
  }

  /**
   * Top level: function declarations, global variables, or class wrappers
   */
  parseTopLevel() {
    // Handle LeetCode class wrappers: class Solution { public: ... };
    if (this.is(TokenType.KEYWORD, 'class') || this.is(TokenType.KEYWORD, 'struct')) {
      this.advance(); // consume 'class'
      const name = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.LBRACE);
      const members = [];
      while (!this.is(TokenType.RBRACE) && !this.is(TokenType.EOF)) {
        // Skip access specifiers like public:
        const tok = this.current();
        if (tok.type === TokenType.KEYWORD && (tok.value === 'public' || tok.value === 'private' || tok.value === 'protected')) {
          if (this.peek(1).type === TokenType.COLON) {
            this.advance();
            this.advance();
            continue;
          }
        }
        members.push(this.parseTopLevel());
      }
      this.expect(TokenType.RBRACE);
      this.match(TokenType.SEMICOLON);
      return { type: 'ClassDeclaration', name, members, line: this.current().line };
    }

    // Check if this looks like a function declaration
    // Pattern: TYPE IDENT ( ...
    if (this.isType()) {
      const savedPos = this.pos;
      try {
        return this.parseFunctionOrVarDecl();
      } catch {
        this.pos = savedPos;
        return this.parseStatement();
      }
    }
    return this.parseStatement();
  }

  parseFunctionOrVarDecl() {
    const returnType = this.parseTypeSpec();
    const name = this.expect(TokenType.IDENTIFIER).value;

    // Function declaration
    if (this.is(TokenType.LPAREN)) {
      return this.parseFunctionDeclaration(returnType, name);
    }

    // Variable declaration
    return this.parseVarDeclRest(returnType, name);
  }

  /**
   * Parse a type specification (e.g., int, vector<int>, unordered_map<string, int>)
   */
  parseTypeSpec() {
    let isConst = false;
    if (this.match(TokenType.KEYWORD, 'const')) {
      isConst = true;
    }

    let baseType = this.advance().value;

    // Handle template types like vector<int>, map<string, int>
    if (this.is(TokenType.LANGLE)) {
      this.advance(); // <
      let depth = 1;
      let template = '<';
      while (depth > 0 && !this.is(TokenType.EOF)) {
        const tok = this.advance();
        if (tok.type === TokenType.LANGLE || tok.value === '<') depth++;
        if (tok.type === TokenType.RANGLE || tok.value === '>') depth--;
        template += tok.value;
      }
      baseType += template;
    }

    // Handle reference (&) and pointer (*)
    let ref = '';
    while (this.is(TokenType.OPERATOR, '&') || this.is(TokenType.OPERATOR, '*')) {
      ref += this.advance().value;
    }

    return { baseType, ref, isConst };
  }

  /**
   * Parse function declaration
   */
  parseFunctionDeclaration(returnType, name) {
    const line = this.peek(-1)?.line || this.current().line;
    this.expect(TokenType.LPAREN);
    const params = [];

    while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
      if (params.length > 0) this.expect(TokenType.COMMA);
      const pType = this.parseTypeSpec();
      const pName = this.expect(TokenType.IDENTIFIER).value;
      params.push({ type: pType, name: pName });
    }
    this.expect(TokenType.RPAREN);

    const body = this.parseBlock();

    return {
      type: NodeType.FunctionDeclaration,
      returnType,
      name,
      params,
      body,
      line,
    };
  }

  /**
   * Parse a block { ... }
   */
  parseBlock() {
    const line = this.current().line;
    this.expect(TokenType.LBRACE);
    const body = [];

    while (!this.is(TokenType.RBRACE) && !this.is(TokenType.EOF)) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);

    return { type: NodeType.Block, body, line };
  }

  /**
   * Parse a single statement
   */
  parseStatement() {
    const tok = this.current();

    // Block
    if (tok.type === TokenType.LBRACE) {
      return this.parseBlock();
    }

    // If statement
    if (tok.type === TokenType.KEYWORD && tok.value === 'if') {
      return this.parseIfStatement();
    }

    // For loop
    if (tok.type === TokenType.KEYWORD && tok.value === 'for') {
      return this.parseForStatement();
    }

    // While loop
    if (tok.type === TokenType.KEYWORD && tok.value === 'while') {
      return this.parseWhileStatement();
    }

    // Do-while loop
    if (tok.type === TokenType.KEYWORD && tok.value === 'do') {
      return this.parseDoWhileStatement();
    }

    // Return statement
    if (tok.type === TokenType.KEYWORD && tok.value === 'return') {
      return this.parseReturnStatement();
    }

    // Break
    if (tok.type === TokenType.KEYWORD && tok.value === 'break') {
      this.advance();
      this.match(TokenType.SEMICOLON);
      return { type: NodeType.BreakStatement, line: tok.line };
    }

    // Continue
    if (tok.type === TokenType.KEYWORD && tok.value === 'continue') {
      this.advance();
      this.match(TokenType.SEMICOLON);
      return { type: NodeType.ContinueStatement, line: tok.line };
    }

    // Cout statement
    if (tok.type === TokenType.KEYWORD && tok.value === 'cout') {
      return this.parseCoutStatement();
    }
    // std::cout
    if (tok.type === TokenType.KEYWORD && tok.value === 'std' && this.peek(1).type === TokenType.SCOPE) {
      if (this.peek(2).value === 'cout') {
        this.advance(); // std
        this.advance(); // ::
        return this.parseCoutStatement();
      }
    }

    // Variable declaration (TYPE IDENT ...)
    if (this.isType()) {
      const savedPos = this.pos;
      try {
        const decl = this.parseVariableDeclaration();
        return decl;
      } catch {
        this.pos = savedPos;
      }
    }

    // Expression statement (assignments, function calls, etc.)
    return this.parseExpressionStatement();
  }

  /**
   * Parse variable declaration
   */
  parseVariableDeclaration() {
    const line = this.current().line;
    const typeSpec = this.parseTypeSpec();
    
    const declarations = [];

    while (true) {
      const name = this.expect(TokenType.IDENTIFIER).value;
      let init = null;

      if (this.match(TokenType.ASSIGN)) {
        init = this.parseExpression();
      } else if (this.is(TokenType.LPAREN)) {
        this.advance();
        const args = [];
        while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
          if (args.length > 0) this.expect(TokenType.COMMA);
          args.push(this.parseExpression());
        }
        this.expect(TokenType.RPAREN);
        init = { type: 'ConstructorInit', args, line };
      } else if (this.is(TokenType.LBRACE)) {
        init = this.parseArrayLiteral();
      }

      declarations.push({ name, init });

      if (!this.match(TokenType.COMMA)) {
        break;
      }
    }

    this.match(TokenType.SEMICOLON);

    if (declarations.length === 1) {
      return {
        type: NodeType.VariableDeclaration,
        varType: typeSpec,
        name: declarations[0].name,
        init: declarations[0].init,
        line,
      };
    }

    return {
      type: 'MultiVariableDeclaration',
      varType: typeSpec,
      declarations,
      line,
    };
  }

  /**
   * Parse if statement
   */
  parseIfStatement() {
    const line = this.current().line;
    this.expect(TokenType.KEYWORD, 'if');
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);

    const consequent = this.is(TokenType.LBRACE) ? this.parseBlock() : this.parseStatement();
    let alternate = null;

    if (this.match(TokenType.KEYWORD, 'else')) {
      alternate = this.is(TokenType.LBRACE) ? this.parseBlock() :
        this.is(TokenType.KEYWORD, 'if') ? this.parseIfStatement() : this.parseStatement();
    }

    return { type: NodeType.IfStatement, condition, consequent, alternate, line };
  }

  /**
   * Parse for statement
   */
  parseForStatement() {
    const line = this.current().line;
    this.expect(TokenType.KEYWORD, 'for');
    this.expect(TokenType.LPAREN);

    let init = null;
    let isRangeBased = false;
    let rangeVar = null;
    let rangeIterable = null;

    // init
    if (!this.is(TokenType.SEMICOLON)) {
      if (this.isType()) {
        init = this.parseVariableDeclaration();
      } else {
        init = this.parseExpression();
        this.match(TokenType.SEMICOLON);
      }
    } else {
      this.advance(); // skip ;
    }

    // Check for range-based for loop
    if (this.is(TokenType.COLON)) {
      isRangeBased = true;
      this.advance(); // skip ':'
      rangeVar = init;
      rangeIterable = this.parseExpression();
      this.expect(TokenType.RPAREN);
    }

    let condition = null;
    let update = null;

    if (!isRangeBased) {
      // condition
      if (!this.is(TokenType.SEMICOLON)) {
        condition = this.parseExpression();
      }
      this.expect(TokenType.SEMICOLON);

      // update
      if (!this.is(TokenType.RPAREN)) {
        update = this.parseExpression();
      }
      this.expect(TokenType.RPAREN);
    }

    const body = this.is(TokenType.LBRACE) ? this.parseBlock() : this.parseStatement();

    if (isRangeBased) {
      return { type: 'RangeForStatement', varDecl: rangeVar, iterable: rangeIterable, body, line };
    }

    return { type: NodeType.ForStatement, init, condition, update, body, line };
  }

  /**
   * Parse while statement
   */
  parseWhileStatement() {
    const line = this.current().line;
    this.expect(TokenType.KEYWORD, 'while');
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    const body = this.is(TokenType.LBRACE) ? this.parseBlock() : this.parseStatement();
    return { type: NodeType.WhileStatement, condition, body, line };
  }

  /**
   * Parse do-while statement
   */
  parseDoWhileStatement() {
    const line = this.current().line;
    this.expect(TokenType.KEYWORD, 'do');
    const body = this.parseBlock();
    this.expect(TokenType.KEYWORD, 'while');
    this.expect(TokenType.LPAREN);
    const condition = this.parseExpression();
    this.expect(TokenType.RPAREN);
    this.match(TokenType.SEMICOLON);
    return { type: NodeType.DoWhileStatement, condition, body, line };
  }

  /**
   * Parse return statement
   */
  parseReturnStatement() {
    const line = this.current().line;
    this.advance(); // 'return'
    let value = null;
    if (!this.is(TokenType.SEMICOLON)) {
      value = this.parseExpression();
    }
    this.match(TokenType.SEMICOLON);
    return { type: NodeType.ReturnStatement, value, line };
  }

  /**
   * Parse cout statement: cout << expr << expr << endl;
   */
  parseCoutStatement() {
    const line = this.current().line;
    this.advance(); // 'cout'
    const expressions = [];

    while (this.match(TokenType.STREAM, '<<')) {
      if (this.is(TokenType.KEYWORD, 'endl') || (this.is(TokenType.STRING) && this.current().value === '\\n')) {
        expressions.push({ type: 'Endl', line });
        this.advance();
      } else {
        expressions.push(this.parseExpression());
      }
    }

    this.match(TokenType.SEMICOLON);
    return { type: NodeType.CoutStatement, expressions, line };
  }

  /**
   * Parse expression statement
   */
  parseExpressionStatement() {
    const line = this.current().line;
    const expr = this.parseExpression();

    // Check for assignment: expr = value
    if (this.match(TokenType.ASSIGN)) {
      const value = this.parseExpression();
      this.match(TokenType.SEMICOLON);
      return { type: NodeType.Assignment, target: expr, value, line };
    }

    // Check for compound assignment: expr += value
    if (this.is(TokenType.COMPOUND_ASSIGN)) {
      const op = this.advance().value;
      const value = this.parseExpression();
      this.match(TokenType.SEMICOLON);
      return { type: NodeType.CompoundAssignment, target: expr, operator: op, value, line };
    }

    this.match(TokenType.SEMICOLON);
    return { type: NodeType.ExpressionStatement, expression: expr, line };
  }

  // ---- Expression Parsing (Precedence Climbing) ----

  parseExpression() {
    return this.parseTernary();
  }

  parseTernary() {
    let expr = this.parseLogicalOr();
    if (this.match(TokenType.QUESTION)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.COLON);
      const alternate = this.parseExpression();
      return { type: NodeType.TernaryExpression, condition: expr, consequent, alternate, line: expr.line };
    }
    return expr;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.is(TokenType.LOGICAL, '||')) {
      const op = this.advance().value;
      const right = this.parseLogicalAnd();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.is(TokenType.LOGICAL, '&&')) {
      const op = this.advance().value;
      const right = this.parseEquality();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (this.is(TokenType.COMPARISON, '==') || this.is(TokenType.COMPARISON, '!=')) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (
      this.is(TokenType.COMPARISON, '<=') || this.is(TokenType.COMPARISON, '>=') ||
      this.is(TokenType.LANGLE) || this.is(TokenType.RANGLE)
    ) {
      const tok = this.advance();
      const op = tok.value;
      const right = this.parseAdditive();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.is(TokenType.OPERATOR, '+') || this.is(TokenType.OPERATOR, '-')) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.is(TokenType.OPERATOR, '*') || this.is(TokenType.OPERATOR, '/') || this.is(TokenType.OPERATOR, '%')) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: NodeType.BinaryExpression, operator: op, left, right, line: left.line };
    }
    return left;
  }

  parseUnary() {
    // Prefix unary: !, -, ++, --
    if (this.is(TokenType.OPERATOR, '!') || this.is(TokenType.OPERATOR, '-') || this.is(TokenType.OPERATOR, '+')) {
      const line = this.current().line;
      const op = this.advance().value;
      const operand = this.parseUnary();
      return { type: NodeType.UnaryExpression, operator: op, operand, prefix: true, line };
    }
    if (this.is(TokenType.INCREMENT)) {
      const line = this.current().line;
      const op = this.advance().value;
      const operand = this.parsePostfix();
      return { type: NodeType.UnaryExpression, operator: op, operand, prefix: true, line };
    }

    // Type cast: (int)expr
    if (this.is(TokenType.LPAREN) && this.peek(1).type === TokenType.TYPE) {
      const savedPos = this.pos;
      try {
        const line = this.current().line;
        this.advance(); // (
        const castType = this.advance().value;
        this.expect(TokenType.RPAREN);
        const expr = this.parseUnary();
        return { type: NodeType.CastExpression, castType, expression: expr, line };
      } catch {
        this.pos = savedPos;
      }
    }

    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      const tok = this.current();

      // Method call: expr.method(args)
      if (tok.type === TokenType.DOT) {
        const line = tok.line;
        this.advance();
        const method = this.expect(TokenType.IDENTIFIER).value;

        if (this.is(TokenType.LPAREN)) {
          this.advance();
          const args = this.parseArgList();
          this.expect(TokenType.RPAREN);
          expr = { type: NodeType.CallExpression, object: expr, method, args, line };
        } else {
          expr = { type: NodeType.MemberExpression, object: expr, property: method, line };
        }
        continue;
      }

      // Index access: expr[index]
      if (tok.type === TokenType.LBRACKET) {
        const line = tok.line;
        this.advance();
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = { type: NodeType.IndexExpression, object: expr, index, line };
        continue;
      }

      // Postfix increment/decrement
      if (tok.type === TokenType.INCREMENT) {
        const line = tok.line;
        const op = this.advance().value;
        expr = { type: NodeType.PostfixExpression, operator: op, operand: expr, line };
        continue;
      }

      break;
    }

    return expr;
  }

  parsePrimary() {
    const tok = this.current();

    // Numeric literal
    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return { type: NodeType.NumericLiteral, value: parseFloat(tok.value), line: tok.line };
    }

    // String literal
    if (tok.type === TokenType.STRING) {
      this.advance();
      return { type: NodeType.StringLiteral, value: tok.value, line: tok.line };
    }

    // Char literal
    if (tok.type === TokenType.CHAR) {
      this.advance();
      return { type: NodeType.CharLiteral, value: tok.value, line: tok.line };
    }

    // Bool literal
    if (tok.type === TokenType.BOOL) {
      this.advance();
      return { type: NodeType.BoolLiteral, value: tok.value === 'true', line: tok.line };
    }

    // Array/brace initialization: {1, 2, 3}
    if (tok.type === TokenType.LBRACE) {
      return this.parseArrayLiteral();
    }

    // Parenthesized expression
    if (tok.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Identifiers, function calls, std::xyz
    if (tok.type === TokenType.IDENTIFIER || tok.type === TokenType.KEYWORD) {
      return this.parseIdentifierOrCall();
    }

    // STL type used as constructor: vector<int>(...)
    if (tok.type === TokenType.STL_TYPE || tok.type === TokenType.TYPE) {
      return this.parseTypeConstructor();
    }

    // INT_MAX, INT_MIN etc — treat as identifiers
    throw new Error(`Parser Error at line ${tok.line}: Unexpected token ${tok.type} '${tok.value}'`);
  }

  parseIdentifierOrCall() {
    const tok = this.advance();
    let name = tok.value;
    const line = tok.line;

    // Handle scope resolution: std::sort, std::min etc
    if (this.is(TokenType.SCOPE)) {
      this.advance();
      name = this.advance().value;
    }

    // Function call: name(args)
    if (this.is(TokenType.LPAREN)) {
      this.advance();
      const args = this.parseArgList();
      this.expect(TokenType.RPAREN);
      return { type: NodeType.CallExpression, object: null, method: name, args, line };
    }

    return { type: NodeType.Identifier, name, line };
  }

  parseTypeConstructor() {
    const tok = this.advance();
    const line = tok.line;
    let typeName = tok.value;

    // Skip template args
    if (this.is(TokenType.LANGLE)) {
      this.advance();
      let depth = 1;
      while (depth > 0 && !this.is(TokenType.EOF)) {
        const t = this.advance();
        if (t.type === TokenType.LANGLE || t.value === '<') depth++;
        if (t.type === TokenType.RANGLE || t.value === '>') depth--;
      }
    }

    // Constructor call
    if (this.is(TokenType.LPAREN)) {
      this.advance();
      const args = this.parseArgList();
      this.expect(TokenType.RPAREN);
      return { type: NodeType.CallExpression, object: null, method: typeName, args, isConstructor: true, line };
    }

    // Brace init
    if (this.is(TokenType.LBRACE)) {
      return this.parseArrayLiteral();
    }

    return { type: NodeType.Identifier, name: typeName, line };
  }

  parseArrayLiteral() {
    const line = this.current().line;
    this.expect(TokenType.LBRACE);
    const elements = [];

    while (!this.is(TokenType.RBRACE) && !this.is(TokenType.EOF)) {
      if (elements.length > 0) this.expect(TokenType.COMMA);
      // Handle nested brace init: {{1,2}, {3,4}}
      elements.push(this.parseExpression());
    }
    this.expect(TokenType.RBRACE);

    return { type: NodeType.ArrayLiteral, elements, line };
  }

  parseArgList() {
    const args = [];
    while (!this.is(TokenType.RPAREN) && !this.is(TokenType.EOF)) {
      if (args.length > 0) this.expect(TokenType.COMMA);
      args.push(this.parseExpression());
    }
    return args;
  }
}

/**
 * Convenience function to parse source tokens
 */
export function parse(tokens) {
  const parser = new Parser(tokens);
  return parser.parse();
}
