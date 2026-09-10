// ============================================
// C++ Code Visualizer — Step-by-Step Interpreter
// ============================================

import { NodeType } from './parser.js';

const MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 5000;

/**
 * Deep clone a value (handles arrays, objects, Maps, Sets)
 */
function deepClone(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(deepClone);
  if (val instanceof Map) return new Map([...val].map(([k, v]) => [deepClone(k), deepClone(v)]));
  if (val instanceof Set) return new Set([...val].map(deepClone));
  // Plain object
  const clone = {};
  for (const key in val) clone[key] = deepClone(val[key]);
  return clone;
}

/**
 * Convert a runtime value to display format
 */
function toDisplay(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val;
  if (val instanceof Map) return val; // Keep as Map for proper rendering
  if (val instanceof Set) return val; // Keep as Set for proper rendering
  return val;
}

/**
 * Determine display type for visualization
 */
function getDisplayType(varType, val) {
  const bt = (varType?.baseType || '').toLowerCase();

  if (bt.startsWith('vector') || bt.startsWith('array') || bt.startsWith('deque')) return 'array';
  if (bt.startsWith('map') || bt.startsWith('unordered_map')) return 'map';
  if (bt.startsWith('set') || bt.startsWith('unordered_set')) return 'set';
  if (bt.startsWith('stack')) return 'stack';
  if (bt.startsWith('queue') || bt.startsWith('priority_queue')) return 'queue';
  if (bt === 'string' || bt === 'std::string') {
    if (typeof val === 'string' && val.length > 1) return 'string-array';
    return 'scalar';
  }
  if (bt.startsWith('pair')) return 'pair';
  if (Array.isArray(val)) return 'array';

  return 'scalar';
}

/**
 * Signal classes for control flow
 */
class ReturnSignal {
  constructor(value) { this.value = value; }
}
class BreakSignal {}
class ContinueSignal {}

/**
 * Interpreter — walks AST and produces execution snapshots
 */
export class Interpreter {
  constructor(ast, inputArgs = []) {
    this.ast = ast;
    this.inputArgs = inputArgs;
    this.steps = [];
    this.stepCount = 0;
    this.scopes = [new Map()]; // scope stack
    this.varTypes = new Map(); // variable name -> type spec
    this.functions = new Map(); // function name -> AST node
    this.consoleOutput = [];
    this.highlights = {};
    this.pointers = {};
    this.lastDescription = '';
    // Track which scalar vars are used as indices into which arrays
    // e.g. { "prices": ["l", "r", "i"] }
    this.indexUsageMap = new Map();
  }

  /**
   * Run the interpreter and return execution steps
   */
  run() {
    // First pass: collect function declarations
    for (const node of this.ast.body) {
      if (node.type === NodeType.FunctionDeclaration) {
        this.functions.set(node.name, node);
      } else if (node.type === 'ClassDeclaration') {
        for (const member of node.members) {
          if (member.type === NodeType.FunctionDeclaration) {
            this.functions.set(member.name, member);
          }
        }
      }
    }

    // Find main function or the first/only function
    const mainFn = this.functions.get('main');

    if (mainFn) {
      this.executeFunction(mainFn, []);
    } else if (this.functions.size > 0) {
      // If no main, execute the first function with inputArgs
      const firstFn = this.functions.values().next().value;
      this.executeFunction(firstFn, this.inputArgs);
    } else {
      // Execute top-level statements
      for (const node of this.ast.body) {
        if (node.type !== NodeType.FunctionDeclaration) {
          this.executeStatement(node);
        }
      }
    }

    return this.steps;
  }

  // ---- Scope Management ----

  pushScope() {
    this.scopes.push(new Map());
  }

  popScope() {
    const scope = this.scopes.pop();
    // Clean up varTypes for out-of-scope variables
    for (const name of scope.keys()) {
      // Only delete if it was the innermost definition
      if (!this.lookupScope(name)) {
        this.varTypes.delete(name);
      }
    }
  }

  setVar(name, value) {
    // Set in the innermost scope that has it, or current scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        this.scopes[i].set(name, value);
        return;
      }
    }
    // New variable in current scope
    this.scopes[this.scopes.length - 1].set(name, value);
  }

  getVar(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
    // Built-in constants
    if (name === 'INT_MAX') return 2147483647;
    if (name === 'INT_MIN') return -2147483648;
    if (name === 'LLONG_MAX') return Number.MAX_SAFE_INTEGER;
    if (name === 'LLONG_MIN') return Number.MIN_SAFE_INTEGER;
    if (name === 'npos' || name === 'string::npos') return -1;

    throw new Error(`Runtime Error: Undefined variable '${name}'`);
  }

  lookupScope(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return true;
    }
    return false;
  }

  declareVar(name, value, typeSpec) {
    this.scopes[this.scopes.length - 1].set(name, value);
    if (typeSpec) this.varTypes.set(name, typeSpec);
  }

  // ---- Step Recording ----

  recordStep(line, description, extraHighlights = {}, extraPointers = {}) {
    if (this.stepCount >= MAX_STEPS) {
      throw new Error('Execution limit exceeded (too many steps). Possible infinite loop.');
    }
    this.stepCount++;

    // Capture current variable state
    const variables = {};
    const allVars = new Map();

    for (const scope of this.scopes) {
      for (const [name, val] of scope) {
        allVars.set(name, val);
      }
    }

    for (const [name, val] of allVars) {
      const typeSpec = this.varTypes.get(name);
      const displayType = getDisplayType(typeSpec, val);
      variables[name] = {
        type: typeSpec?.baseType || 'auto',
        value: deepClone(toDisplay(val)),
        displayType,
        raw: deepClone(val),
      };
    }

    // Auto-generate pointer metadata from indexUsageMap
    const mergedHighlights = { ...extraHighlights };
    for (const [arrName, indexVars] of this.indexUsageMap) {
      if (allVars.has(arrName)) {
        const arrVal = allVars.get(arrName);
        if (Array.isArray(arrVal) || typeof arrVal === 'string') {
          const pointers = {};
          for (const varName of indexVars) {
            if (allVars.has(varName)) {
              const idx = allVars.get(varName);
              if (typeof idx === 'number' && idx >= 0) {
                pointers[varName] = idx;
              }
            }
          }
          if (Object.keys(pointers).length > 0) {
            // Merge with existing highlights for this array
            if (mergedHighlights[arrName] && typeof mergedHighlights[arrName] === 'object') {
              mergedHighlights[arrName] = { ...mergedHighlights[arrName], pointers };
            } else {
              mergedHighlights[arrName] = { pointers };
            }
          }
        }
      }
    }

    const step = {
      step: this.stepCount,
      line: line || 0,
      description: description || '',
      variables,
      highlights: mergedHighlights,
      pointers: { ...extraPointers },
      console: [...this.consoleOutput],
    };

    this.steps.push(step);
    return step;
  }

  // ---- Statement Execution ----

  executeStatement(node) {
    if (this.stepCount >= MAX_STEPS) return;

    const result = this._execStmt(node);

    if (result instanceof ReturnSignal || result instanceof BreakSignal || result instanceof ContinueSignal) {
      return result;
    }
    return undefined;
  }

  _execStmt(node) {
    switch (node.type) {
      case NodeType.VariableDeclaration:
        return this.execVarDecl(node);
      case 'MultiVariableDeclaration':
        return this.execMultiVarDecl(node);
      case NodeType.Assignment:
        return this.execAssignment(node);
      case NodeType.CompoundAssignment:
        return this.execCompoundAssignment(node);
      case NodeType.IfStatement:
        return this.execIf(node);
      case NodeType.ForStatement:
        return this.execFor(node);
      case 'RangeForStatement':
        return this.execRangeFor(node);
      case NodeType.WhileStatement:
        return this.execWhile(node);
      case NodeType.DoWhileStatement:
        return this.execDoWhile(node);
      case NodeType.ReturnStatement:
        return this.execReturn(node);
      case NodeType.BreakStatement:
        return new BreakSignal();
      case NodeType.ContinueStatement:
        return new ContinueSignal();
      case NodeType.Block:
        return this.execBlock(node);
      case NodeType.CoutStatement:
        return this.execCout(node);
      case NodeType.ExpressionStatement:
        this.evalExpression(node.expression);
        return;
      default:
        return;
    }
  }

  execBlock(node) {
    this.pushScope();
    for (const stmt of node.body) {
      const result = this.executeStatement(stmt);
      if (result instanceof ReturnSignal || result instanceof BreakSignal || result instanceof ContinueSignal) {
        this.popScope();
        return result;
      }
    }
    this.popScope();
  }

  execVarDecl(node) {
    let value;
    const bt = (node.varType?.baseType || '').toLowerCase();

    if (node.init) {
      if (node.init.type === 'ConstructorInit') {
        value = this.handleConstructorInit(bt, node.init.args);
      } else {
        value = this.evalExpression(node.init);
      }
    } else {
      // Default initialization
      value = this.getDefaultValue(bt);
    }

    // If it's a string type and value is a string, keep as is
    // If it's an STL container, ensure proper type
    if ((bt.startsWith('vector') || bt.startsWith('array') || bt.startsWith('deque')) && !Array.isArray(value)) {
      value = [];
    }
    if ((bt.startsWith('set') || bt.startsWith('unordered_set')) && !(value instanceof Set)) {
      value = value ? new Set(Array.isArray(value) ? value : []) : new Set();
    }
    if ((bt.startsWith('map') || bt.startsWith('unordered_map')) && !(value instanceof Map)) {
      value = value ? new Map() : new Map();
    }
    if ((bt.startsWith('stack') || bt.startsWith('queue') || bt.startsWith('priority_queue')) && !Array.isArray(value)) {
      value = [];
    }

    this.declareVar(node.name, value, node.varType);

    const displayVal = this.formatValueForDesc(value);
    this.recordStep(node.line, `Declare ${node.varType?.baseType || 'auto'} ${node.name} = ${displayVal}`, {
      [node.name]: true,
    });
  }

  execMultiVarDecl(node) {
    const descriptions = [];
    const highlights = {};

    for (const decl of node.declarations) {
      let value;
      const bt = (node.varType?.baseType || '').toLowerCase();

      if (decl.init) {
        if (decl.init.type === 'ConstructorInit') {
          value = this.handleConstructorInit(bt, decl.init.args);
        } else {
          value = this.evalExpression(decl.init);
        }
      } else {
        value = this.getDefaultValue(bt);
      }

      if ((bt.startsWith('vector') || bt.startsWith('array') || bt.startsWith('deque')) && !Array.isArray(value)) value = [];
      if ((bt.startsWith('set') || bt.startsWith('unordered_set')) && !(value instanceof Set)) value = new Set();
      if ((bt.startsWith('map') || bt.startsWith('unordered_map')) && !(value instanceof Map)) value = new Map();
      if ((bt.startsWith('stack') || bt.startsWith('queue') || bt.startsWith('priority_queue')) && !Array.isArray(value)) value = [];

      this.declareVar(decl.name, value, node.varType);
      
      const displayVal = this.formatValueForDesc(value);
      descriptions.push(`${decl.name} = ${displayVal}`);
      highlights[decl.name] = true;
    }

    this.recordStep(node.line, `Declare ${node.varType?.baseType || 'auto'} ${descriptions.join(', ')}`, highlights);
  }

  handleConstructorInit(baseType, args) {
    const evArgs = args.map(a => this.evalExpression(a));

    if (baseType.startsWith('vector') || baseType.startsWith('array') || baseType.startsWith('deque')) {
      if (evArgs.length === 1 && typeof evArgs[0] === 'number') {
        return new Array(evArgs[0]).fill(0);
      }
      if (evArgs.length === 2 && typeof evArgs[0] === 'number') {
        return new Array(evArgs[0]).fill(evArgs[1]);
      }
      return evArgs;
    }
    if (baseType.startsWith('set') || baseType.startsWith('unordered_set')) {
      return new Set(evArgs);
    }
    if (baseType.startsWith('map') || baseType.startsWith('unordered_map')) {
      return new Map();
    }
    if (baseType.startsWith('stack') || baseType.startsWith('queue') || baseType.startsWith('priority_queue')) {
      return [];
    }
    if (baseType === 'string') {
      if (evArgs.length === 2) return String(evArgs[1]).repeat(evArgs[0]);
      return evArgs[0]?.toString() || '';
    }
    if (baseType.startsWith('pair')) {
      return [evArgs[0], evArgs[1]];
    }
    return evArgs[0];
  }

  getDefaultValue(baseType) {
    if (baseType.startsWith('vector') || baseType.startsWith('array') || baseType.startsWith('deque')) return [];
    if (baseType.startsWith('set') || baseType.startsWith('unordered_set')) return new Set();
    if (baseType.startsWith('map') || baseType.startsWith('unordered_map')) return new Map();
    if (baseType.startsWith('stack') || baseType.startsWith('queue') || baseType.startsWith('priority_queue')) return [];
    if (baseType.startsWith('pair')) return [0, 0];
    if (baseType === 'string') return '';
    if (baseType === 'bool') return false;
    if (baseType === 'char') return '\0';
    return 0; // int, float, double, etc.
  }

  execAssignment(node) {
    const value = this.evalExpression(node.value);
    this.assignToTarget(node.target, value, node.line);
  }

  execCompoundAssignment(node) {
    const currentVal = this.evalExpression(node.target);
    const rhs = this.evalExpression(node.value);
    let newVal;

    switch (node.operator) {
      case '+=': newVal = (typeof currentVal === 'string') ? currentVal + rhs : currentVal + rhs; break;
      case '-=': newVal = currentVal - rhs; break;
      case '*=': newVal = currentVal * rhs; break;
      case '/=': newVal = Math.trunc(currentVal / rhs); break;
      case '%=': newVal = currentVal % rhs; break;
      default: newVal = rhs;
    }

    this.assignToTarget(node.target, newVal, node.line);
  }

  assignToTarget(target, value, line) {
    if (target.type === NodeType.Identifier) {
      this.setVar(target.name, value);
      const displayVal = this.formatValueForDesc(value);
      this.recordStep(line, `Set ${target.name} = ${displayVal}`, { [target.name]: true });
    } else if (target.type === NodeType.IndexExpression) {
      const obj = this.evalExpression(target.object);
      const idx = this.evalExpression(target.index);

      if (Array.isArray(obj)) {
        obj[idx] = value;
        const arrName = this.getExprName(target.object);
        this.recordStep(line, `Set ${arrName}[${idx}] = ${this.formatValueForDesc(value)}`, {
          [arrName]: { indices: [idx] },
        });
      } else if (obj instanceof Map) {
        obj.set(idx, value);
        const mapName = this.getExprName(target.object);
        this.recordStep(line, `Set ${mapName}[${this.formatValueForDesc(idx)}] = ${this.formatValueForDesc(value)}`, {
          [mapName]: { keys: [idx] },
        });
      } else if (typeof obj === 'string') {
        // Strings in C++ can be modified by index
        const name = this.getExprName(target.object);
        const strArr = obj.split('');
        strArr[idx] = typeof value === 'number' ? String.fromCharCode(value) : value;
        this.setVar(name, strArr.join(''));
        this.recordStep(line, `Set ${name}[${idx}] = '${value}'`, { [name]: { indices: [idx] } });
      }
    } else if (target.type === NodeType.MemberExpression) {
      const obj = this.evalExpression(target.object);
      const prop = target.property;
      if (Array.isArray(obj) && prop === 'first') obj[0] = value;
      else if (Array.isArray(obj) && prop === 'second') obj[1] = value;
    }
  }

  execIf(node) {
    const condition = this.evalExpression(node.condition);
    const condStr = this.exprToStringWithValues(node.condition);

    this.recordStep(node.line, `Check if ${condStr} → ${condition ? 'true' : 'false'}`);

    if (condition) {
      return this.executeStatement(node.consequent);
    } else if (node.alternate) {
      return this.executeStatement(node.alternate);
    }
  }

  execFor(node) {
    this.pushScope();

    // Init
    if (node.init) {
      if (node.init.type === NodeType.VariableDeclaration) {
        this.execVarDecl(node.init);
      } else {
        this.evalExpression(node.init);
        this.recordStep(node.line, `Initialize loop`);
      }
    }

    let iterations = 0;
    while (iterations < MAX_LOOP_ITERATIONS) {
      // Condition
      if (node.condition) {
        const cond = this.evalExpression(node.condition);
        const condStr = this.exprToStringWithValues(node.condition);
        this.recordStep(node.line, `Loop condition: ${condStr} → ${cond ? 'true' : 'false'}`);
        if (!cond) break;
      }

      // Body
      const result = this.executeStatement(node.body);
      if (result instanceof ReturnSignal) { this.popScope(); return result; }
      if (result instanceof BreakSignal) break;

      // Update
      if (node.update) {
        this.evalExpression(node.update);
        // Record the update
        const updateStr = this.exprToString(node.update);
        this.recordStep(node.line, `Loop update: ${updateStr}`);
      }

      iterations++;
    }

    this.popScope();
  }

  execRangeFor(node) {
    const iterable = this.evalExpression(node.iterable);
    const iterableName = this.exprToString(node.iterable);
    const varName = node.varDecl.name;
    const varType = node.varDecl.varType;

    let items = [];
    if (Array.isArray(iterable)) items = iterable;
    else if (typeof iterable === 'string') items = iterable.split('');
    else if (iterable instanceof Set) items = [...iterable];
    else if (iterable instanceof Map) items = [...iterable]; 

    this.recordStep(node.line, `Range-based for loop over ${iterableName}`);

    this.pushScope();

    let iterations = 0;
    for (const item of items) {
      if (iterations >= MAX_LOOP_ITERATIONS) break;

      // Ensure variable is declared in inner scope each iteration
      this.declareVar(varName, item, varType);
      this.recordStep(node.line, `Iteration: ${varName} = ${this.formatValueForDesc(item)}`, {
        [varName]: true
      });

      const result = this.executeStatement(node.body);

      if (result instanceof BreakSignal) {
        this.recordStep(node.line, `Break loop`);
        break;
      }
      if (result instanceof ReturnSignal) {
        this.popScope();
        return result;
      }
      // Continue simply ignores the rest of the body and goes to next iteration
      
      iterations++;
    }

    this.popScope();
  }

  execWhile(node) {
    let iterations = 0;
    while (iterations < MAX_LOOP_ITERATIONS) {
      const cond = this.evalExpression(node.condition);
      const condStr = this.exprToStringWithValues(node.condition);
      this.recordStep(node.line, `While ${condStr} → ${cond ? 'true' : 'false'}`);
      if (!cond) break;

      const result = this.executeStatement(node.body);
      if (result instanceof ReturnSignal) return result;
      if (result instanceof BreakSignal) break;

      iterations++;
    }
  }

  execDoWhile(node) {
    let iterations = 0;
    do {
      const result = this.executeStatement(node.body);
      if (result instanceof ReturnSignal) return result;
      if (result instanceof BreakSignal) break;

      const cond = this.evalExpression(node.condition);
      this.recordStep(node.line, `Do-while condition → ${cond ? 'true' : 'false'}`);
      if (!cond) break;

      iterations++;
    } while (iterations < MAX_LOOP_ITERATIONS);
  }

  execReturn(node) {
    let value = undefined;
    if (node.value) {
      value = this.evalExpression(node.value);
      this.recordStep(node.line, `Return ${this.formatValueForDesc(value)}`);
    } else {
      this.recordStep(node.line, 'Return');
    }
    return new ReturnSignal(value);
  }

  execCout(node) {
    let output = '';
    for (const expr of node.expressions) {
      if (expr.type === 'Endl') {
        output += '\n';
      } else {
        const val = this.evalExpression(expr);
        output += this.formatValueForDesc(val);
      }
    }
    this.consoleOutput.push(output);
    this.recordStep(node.line, `Output: ${output.trim()}`);
  }

  // ---- Expression Evaluation ----

  evalExpression(node) {
    switch (node.type) {
      case NodeType.NumericLiteral: return node.value;
      case NodeType.StringLiteral: return node.value;
      case NodeType.CharLiteral: return node.value.length === 2 && node.value[0] === '\\' ? this.unescapeChar(node.value) : node.value;
      case NodeType.BoolLiteral: return node.value;
      case NodeType.ArrayLiteral: return node.elements.map(e => this.evalExpression(e));
      case NodeType.Identifier: return this.getVar(node.name);
      case NodeType.BinaryExpression: return this.evalBinary(node);
      case NodeType.UnaryExpression: return this.evalUnary(node);
      case NodeType.PostfixExpression: return this.evalPostfix(node);
      case NodeType.TernaryExpression: return this.evalExpression(node.condition) ? this.evalExpression(node.consequent) : this.evalExpression(node.alternate);
      case NodeType.CallExpression: return this.evalCall(node);
      case NodeType.IndexExpression: return this.evalIndex(node);
      case NodeType.MemberExpression: return this.evalMember(node);
      case NodeType.CastExpression: return this.evalCast(node);
      case NodeType.Assignment: {
        const val = this.evalExpression(node.value);
        this.assignToTarget(node.target, val, node.line);
        return val;
      }
      case NodeType.CompoundAssignment: {
        this.execCompoundAssignment(node);
        return this.evalExpression(node.target);
      }
      default:
        return undefined;
    }
  }

  evalBinary(node) {
    const left = this.evalExpression(node.left);
    const right = this.evalExpression(node.right);

    switch (node.operator) {
      case '+': return (typeof left === 'string' || typeof right === 'string') ? String(left) + String(right) : left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/':
        if (Number.isInteger(left) && Number.isInteger(right)) return Math.trunc(left / right);
        return left / right;
      case '%': return left % right;
      case '==': return left === right || (left == right);
      case '!=': return left !== right && (left != right);
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      case '&&': return left && right;
      case '||': return left || right;
      case '&': return left & right;
      case '|': return left | right;
      case '^': return left ^ right;
      default: return 0;
    }
  }

  evalUnary(node) {
    if (node.prefix) {
      if (node.operator === '++') {
        const name = this.getExprName(node.operand);
        let val = this.evalExpression(node.operand);
        val++;
        if (name) this.setVar(name, val);
        return val;
      }
      if (node.operator === '--') {
        const name = this.getExprName(node.operand);
        let val = this.evalExpression(node.operand);
        val--;
        if (name) this.setVar(name, val);
        return val;
      }
      const operand = this.evalExpression(node.operand);
      switch (node.operator) {
        case '-': return -operand;
        case '+': return +operand;
        case '!': return !operand;
        case '~': return ~operand;
        default: return operand;
      }
    }
    return this.evalExpression(node.operand);
  }

  evalPostfix(node) {
    const name = this.getExprName(node.operand);
    let val = this.evalExpression(node.operand);
    const oldVal = val;

    if (node.operator === '++') {
      if (name) this.setVar(name, val + 1);
    } else if (node.operator === '--') {
      if (name) this.setVar(name, val - 1);
    }

    return oldVal; // postfix returns old value
  }

  evalIndex(node) {
    const obj = this.evalExpression(node.object);
    const idx = this.evalExpression(node.index);

    // Track index usage for pointer annotations
    const arrName = this.getExprName(node.object);
    const idxName = this.getExprName(node.index);
    if (arrName && idxName && typeof idx === 'number' && (Array.isArray(obj) || typeof obj === 'string')) {
      if (!this.indexUsageMap.has(arrName)) {
        this.indexUsageMap.set(arrName, new Set());
      }
      this.indexUsageMap.get(arrName).add(idxName);
    }

    if (typeof obj === 'string') return obj[idx];
    if (Array.isArray(obj)) return obj[idx];
    if (obj instanceof Map) {
      if (!obj.has(idx)) obj.set(idx, 0); // auto-insert for maps
      return obj.get(idx);
    }

    return undefined;
  }

  evalMember(node) {
    const obj = this.evalExpression(node.object);
    const prop = node.property;

    if (Array.isArray(obj)) {
      if (prop === 'first') return obj[0];
      if (prop === 'second') return obj[1];
      if (prop === 'size') return obj.length;
      if (prop === 'length') return obj.length;
    }
    if (typeof obj === 'string') {
      if (prop === 'size' || prop === 'length') return obj.length;
    }

    return undefined;
  }

  evalCall(node) {
    const method = node.method;
    const args = node.args.map(a => this.evalExpression(a));
    const obj = node.object ? this.evalExpression(node.object) : null;
    const objName = node.object ? this.getExprName(node.object) : null;

    // Method calls on objects
    if (obj !== null) {
      return this.evalMethodCall(obj, objName, method, args, node.line);
    }

    // Free-standing function calls
    return this.evalFreeCall(method, args, node.line);
  }

  evalMethodCall(obj, objName, method, args, line) {
    // Array/Vector methods
    if (Array.isArray(obj)) {
      switch (method) {
        case 'push_back':
        case 'push':
        case 'emplace_back':
          obj.push(args[0]);
          this.recordStep(line, `${objName}.${method}(${this.formatValueForDesc(args[0])})`, {
            [objName]: { indices: [obj.length - 1] },
          });
          return;
        case 'pop_back':
        case 'pop': {
          const popped = obj.pop();
          this.recordStep(line, `${objName}.${method}() → removed ${this.formatValueForDesc(popped)}`, {
            [objName]: true,
          });
          return popped;
        }
        case 'front': return obj[0];
        case 'back': return obj[obj.length - 1];
        case 'top': return obj[obj.length - 1]; // stack top
        case 'size': return obj.length;
        case 'empty': return obj.length === 0;
        case 'clear': obj.length = 0; return;
        case 'erase': {
          const idx = typeof args[0] === 'number' ? args[0] : 0;
          obj.splice(idx, 1);
          this.recordStep(line, `${objName}.erase(${idx})`, { [objName]: true });
          return;
        }
        case 'insert': {
          if (args.length >= 2) {
            obj.splice(args[0], 0, args[1]);
          }
          return;
        }
        case 'resize': {
          const newSize = args[0];
          const fillVal = args.length > 1 ? args[1] : 0;
          while (obj.length < newSize) obj.push(fillVal);
          while (obj.length > newSize) obj.pop();
          return;
        }
        case 'begin': return 0;
        case 'end': return obj.length;
        case 'rbegin': return obj.length - 1;
        case 'rend': return -1;
        case 'at': return obj[args[0]];
        case 'swap': {
          const temp = obj.slice();
          const other = args[0];
          if (Array.isArray(other)) {
            obj.length = 0;
            obj.push(...other);
            other.length = 0;
            other.push(...temp);
          }
          return;
        }
      }

      // pair methods
      if (method === 'first') return obj[0];
      if (method === 'second') return obj[1];
    }

    // String methods
    if (typeof obj === 'string') {
      switch (method) {
        case 'size':
        case 'length': return obj.length;
        case 'empty': return obj.length === 0;
        case 'substr': return args.length === 1 ? obj.substring(args[0]) : obj.substring(args[0], args[0] + args[1]);
        case 'find': {
          const idx = obj.indexOf(args[0]);
          return idx === -1 ? -1 : idx;
        }
        case 'push_back': {
          const newStr = obj + (typeof args[0] === 'string' ? args[0] : String.fromCharCode(args[0]));
          if (objName) this.setVar(objName, newStr);
          return;
        }
        case 'pop_back': {
          const newStr = obj.slice(0, -1);
          if (objName) this.setVar(objName, newStr);
          return;
        }
        case 'at': return obj[args[0]];
        case 'front': return obj[0];
        case 'back': return obj[obj.length - 1];
        case 'begin': return 0;
        case 'end': return obj.length;
        case 'erase': {
          let newStr;
          if (args.length === 1) newStr = obj.slice(0, args[0]) + obj.slice(args[0] + 1);
          else newStr = obj.slice(0, args[0]) + obj.slice(args[0] + args[1]);
          if (objName) this.setVar(objName, newStr);
          return;
        }
        case 'insert': {
          const newStr = obj.slice(0, args[0]) + args[1] + obj.slice(args[0]);
          if (objName) this.setVar(objName, newStr);
          return;
        }
      }
    }

    // Set methods
    if (obj instanceof Set) {
      switch (method) {
        case 'insert':
        case 'emplace':
          obj.add(args[0]);
          this.recordStep(line, `${objName}.insert(${this.formatValueForDesc(args[0])})`, {
            [objName]: { items: [args[0]] },
          });
          return;
        case 'erase':
        case 'remove':
          obj.delete(args[0]);
          this.recordStep(line, `${objName}.erase(${this.formatValueForDesc(args[0])})`, { [objName]: true });
          return;
        case 'count':
        case 'contains':
          return obj.has(args[0]) ? 1 : 0;
        case 'find':
          return obj.has(args[0]) ? args[0] : -1; // simplified
        case 'size': return obj.size;
        case 'empty': return obj.size === 0;
        case 'clear': obj.clear(); return;
      }
    }

    // Map methods
    if (obj instanceof Map) {
      switch (method) {
        case 'insert': {
          // insert({key, value}) or insert(pair)
          if (Array.isArray(args[0])) {
            obj.set(args[0][0], args[0][1]);
            this.recordStep(line, `${objName}.insert({${this.formatValueForDesc(args[0][0])}, ${this.formatValueForDesc(args[0][1])}})`, {
              [objName]: { keys: [args[0][0]] },
            });
          }
          return;
        }
        case 'emplace': {
          obj.set(args[0], args[1]);
          return;
        }
        case 'erase':
          obj.delete(args[0]);
          this.recordStep(line, `${objName}.erase(${this.formatValueForDesc(args[0])})`, { [objName]: true });
          return;
        case 'count':
        case 'contains':
          return obj.has(args[0]) ? 1 : 0;
        case 'find':
          return obj.has(args[0]) ? args[0] : -1;
        case 'size': return obj.size;
        case 'empty': return obj.size === 0;
        case 'clear': obj.clear(); return;
        case 'at': return obj.get(args[0]);
      }
    }

    return undefined;
  }

  evalFreeCall(name, args, line) {
    // Built-in functions
    switch (name) {
      case 'sort': {
        if (args.length >= 1 && Array.isArray(args[0])) {
          args[0].sort((a, b) => a - b);
          return;
        }
        // sort with begin/end iterators — the parent array was the first arg's object
        // We'll handle the common sort(arr.begin(), arr.end()) pattern
        return;
      }
      case 'reverse': {
        if (Array.isArray(args[0])) args[0].reverse();
        return;
      }
      case 'min': return Math.min(args[0], args[1]);
      case 'max': return Math.max(args[0], args[1]);
      case 'abs': return Math.abs(args[0]);
      case 'swap': {
        // swap(a, b) — this is tricky without references, handle common case
        return;
      }
      case 'to_string': return String(args[0]);
      case 'stoi':
      case 'atoi': return parseInt(args[0], 10);
      case 'stof':
      case 'stod': return parseFloat(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'pow': return Math.pow(args[0], args[1]);
      case 'log': return Math.log(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'floor': return Math.floor(args[0]);
      case 'round': return Math.round(args[0]);
      case 'tolower': return typeof args[0] === 'string' ? args[0].toLowerCase() : String.fromCharCode(args[0]).toLowerCase();
      case 'toupper': return typeof args[0] === 'string' ? args[0].toUpperCase() : String.fromCharCode(args[0]).toUpperCase();
      case 'isalpha': return typeof args[0] === 'string' ? /^[a-zA-Z]$/.test(args[0]) : false;
      case 'isdigit': return typeof args[0] === 'string' ? /^[0-9]$/.test(args[0]) : false;
      case 'isalnum': return typeof args[0] === 'string' ? /^[a-zA-Z0-9]$/.test(args[0]) : false;
      case 'make_pair': return [args[0], args[1]];
      case 'lower_bound': {
        // Simplified lower_bound on sorted array
        if (Array.isArray(args[0])) {
          const arr = args[0];
          const target = args[args.length - 1];
          let lo = 0, hi = arr.length;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (arr[mid] < target) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        }
        return 0;
      }
      case 'upper_bound': {
        if (Array.isArray(args[0])) {
          const arr = args[0];
          const target = args[args.length - 1];
          let lo = 0, hi = arr.length;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (arr[mid] <= target) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        }
        return 0;
      }
      case 'fill': {
        if (Array.isArray(args[0])) {
          args[0].fill(args[args.length - 1]);
        }
        return;
      }
    }

    // User-defined function
    if (this.functions.has(name)) {
      const fn = this.functions.get(name);
      const result = this.executeFunction(fn, args);
      if (result !== undefined) {
        this.recordStep(line, `${name}() returned ${this.formatValueForDesc(result)}`);
      }
      return result;
    }

    return undefined;
  }

  executeFunction(fn, args) {
    this.pushScope();

    // Bind parameters
    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i];
      const value = i < args.length ? deepClone(args[i]) : this.getDefaultValue(param.type?.baseType || 'int');
      this.declareVar(param.name, value, param.type);
    }

    // Record function entry
    const paramStr = fn.params.map((p, i) =>
      `${p.name} = ${this.formatValueForDesc(i < args.length ? args[i] : 0)}`
    ).join(', ');
    this.recordStep(fn.line, `Call ${fn.name}(${paramStr})`);

    // Execute body
    let returnValue;
    for (const stmt of fn.body.body) {
      const result = this.executeStatement(stmt);
      if (result instanceof ReturnSignal) {
        returnValue = result.value;
        break;
      }
    }

    this.popScope();
    return returnValue;
  }

  evalCast(node) {
    const val = this.evalExpression(node.expression);
    switch (node.castType) {
      case 'int': return Math.trunc(val);
      case 'float':
      case 'double': return Number(val);
      case 'char': return typeof val === 'number' ? String.fromCharCode(val) : val;
      case 'bool': return !!val;
      case 'string': return String(val);
      default: return val;
    }
  }

  unescapeChar(str) {
    switch (str) {
      case '\\n': return '\n';
      case '\\t': return '\t';
      case '\\\\': return '\\';
      case '\\\'': return "'";
      case '\\"': return '"';
      case '\\0': return '\0';
      default: return str[1] || str;
    }
  }

  // ---- Utility ----

  getExprName(node) {
    if (node.type === NodeType.Identifier) return node.name;
    if (node.type === NodeType.IndexExpression) return this.getExprName(node.object);
    if (node.type === NodeType.MemberExpression) return this.getExprName(node.object);
    return null;
  }

  formatValueForDesc(val) {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val.toString();
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'string') return val.length <= 20 ? `"${val}"` : `"${val.slice(0, 17)}..."`;
    if (Array.isArray(val)) {
      if (val.length <= 8) return `[${val.map(v => this.formatValueForDesc(v)).join(', ')}]`;
      return `[${val.slice(0, 5).map(v => this.formatValueForDesc(v)).join(', ')}, ...]`;
    }
    if (val instanceof Set) return `{${[...val].map(v => this.formatValueForDesc(v)).join(', ')}}`;
    if (val instanceof Map) return `{${[...val].map(([k, v]) => `${k}: ${v}`).join(', ')}}`;
    return String(val);
  }

  exprToString(node) {
    if (!node) return '';
    switch (node.type) {
      case NodeType.NumericLiteral: return node.value.toString();
      case NodeType.StringLiteral: return `"${node.value}"`;
      case NodeType.CharLiteral: return `'${node.value}'`;
      case NodeType.BoolLiteral: return node.value.toString();
      case NodeType.Identifier: {
        try {
          const val = this.getVar(node.name);
          if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
            return `${node.name}(${val})`;
          }
        } catch { /* ignore */ }
        return node.name;
      }
      case NodeType.BinaryExpression:
        return `${this.exprToString(node.left)} ${node.operator} ${this.exprToString(node.right)}`;
      case NodeType.UnaryExpression:
        return node.prefix ? `${node.operator}${this.exprToString(node.operand)}` : `${this.exprToString(node.operand)}${node.operator}`;
      case NodeType.PostfixExpression:
        return `${this.exprToString(node.operand)}${node.operator}`;
      case NodeType.CallExpression: {
        const argStr = node.args.map(a => this.exprToString(a)).join(', ');
        if (node.object) return `${this.exprToString(node.object)}.${node.method}(${argStr})`;
        return `${node.method}(${argStr})`;
      }
      case NodeType.IndexExpression:
        return `${this.exprToString(node.object)}[${this.exprToString(node.index)}]`;
      case NodeType.MemberExpression:
        return `${this.exprToString(node.object)}.${node.property}`;
      default:
        return '...';
    }
  }

  /**
   * Like exprToString but shows actual resolved values for index expressions
   * e.g. "prices[r] (5) > prices[l] (1)" instead of "prices[r(2)] > prices[l(1)]"
   */
  exprToStringWithValues(node) {
    if (!node) return '';
    switch (node.type) {
      case NodeType.NumericLiteral: return node.value.toString();
      case NodeType.StringLiteral: return `"${node.value}"`;
      case NodeType.CharLiteral: return `'${node.value}'`;
      case NodeType.BoolLiteral: return node.value.toString();
      case NodeType.Identifier: {
        try {
          const val = this.getVar(node.name);
          if (typeof val === 'number' || typeof val === 'boolean') {
            return `${node.name} (${val})`;
          }
          if (typeof val === 'string' && val.length <= 5) {
            return `${node.name} ("${val}")`;
          }
        } catch { /* ignore */ }
        return node.name;
      }
      case NodeType.IndexExpression: {
        const objStr = this.exprToString(node.object);
        const idxName = this.getExprName(node.index);
        try {
          const obj = this.evalExpression(node.object);
          const idx = this.evalExpression(node.index);
          const val = Array.isArray(obj) ? obj[idx] : typeof obj === 'string' ? obj[idx] : undefined;
          if (val !== undefined && idxName) {
            return `${objStr}[${idxName}] (${this.formatValueForDesc(val)})`;
          }
          if (val !== undefined) {
            return `${objStr}[${idx}] (${this.formatValueForDesc(val)})`;
          }
        } catch { /* ignore */ }
        return `${objStr}[${this.exprToStringWithValues(node.index)}]`;
      }
      case NodeType.BinaryExpression:
        return `${this.exprToStringWithValues(node.left)} ${node.operator} ${this.exprToStringWithValues(node.right)}`;
      case NodeType.UnaryExpression:
        return node.prefix ? `${node.operator}${this.exprToStringWithValues(node.operand)}` : `${this.exprToStringWithValues(node.operand)}${node.operator}`;
      case NodeType.PostfixExpression:
        return `${this.exprToStringWithValues(node.operand)}${node.operator}`;
      case NodeType.CallExpression: {
        const argStr = node.args.map(a => this.exprToStringWithValues(a)).join(', ');
        if (node.object) return `${this.exprToStringWithValues(node.object)}.${node.method}(${argStr})`;
        return `${node.method}(${argStr})`;
      }
      case NodeType.MemberExpression:
        return `${this.exprToStringWithValues(node.object)}.${node.property}`;
      default:
        return this.exprToString(node);
    }
  }
}

/**
 * Convenience function: interpret AST and return steps
 */
export function interpret(ast, inputArgs = []) {
  const interpreter = new Interpreter(ast, inputArgs);
  return interpreter.run();
}
