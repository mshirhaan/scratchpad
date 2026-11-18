// Rewrites JavaScript so that running it records a debugger trace.
//
// Three hooks are inserted, all on the original lines so line numbers and
// error positions do not move:
//   __t(line, "a,b", getter)  before each statement: snapshot the locals
//   __e(name) / __x()         on function entry / exit: maintain the call stack
//   __w(name, line, ...)      around expression-bodied arrow functions
//   __r(line, value)          around each returned value: records the return
import { parse } from 'acorn';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Node = any;

interface Scope {
  names: string[];
  fn: boolean;
}

interface Edit {
  pos: number;
  text: string;
  close: boolean;
  seq: number;
}

function patternNames(p: Node, out: string[]) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': out.push(p.name); break;
    case 'ObjectPattern': for (const prop of p.properties) patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out); break;
    case 'ArrayPattern': for (const el of p.elements) patternNames(el, out); break;
    case 'RestElement': patternNames(p.argument, out); break;
    case 'AssignmentPattern': patternNames(p.left, out); break;
  }
}

const isFn = (n: Node) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';

/** `var` names anywhere inside a function body (not inside nested functions). */
function hoistedVars(node: Node, out: string[]) {
  if (!node || typeof node.type !== 'string') return;
  if (isFn(node)) return;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const d of node.declarations) patternNames(d.id, out);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => hoistedVars(c, out));
    else if (child && typeof child.type === 'string') hoistedVars(child, out);
  }
}

/** let/const names declared directly in a list of statements. */
function lexicalNames(stmts: Node[], out: string[]) {
  for (const s of stmts) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') for (const d of s.declarations) patternNames(d.id, out);
  }
}

export function instrument(code: string): string {
  const ast: Node = parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    locations: true,
  });

  const edits: Edit[] = [];
  let seq = 0;
  const open = (pos: number, text: string) => edits.push({ pos, text, close: false, seq: seq++ });
  const close = (pos: number, text: string) => edits.push({ pos, text, close: true, seq: seq++ });
  const scopes: Scope[] = [];

  function trace(line: number): string {
    const names: string[] = [];
    for (let i = scopes.length - 1; i >= 0; i--) {
      for (const n of scopes[i].names) if (!names.includes(n)) names.push(n);
      if (scopes[i].fn) break;
    }
    if (!names.length) return `__t(${line})`;
    const cases = names.map((n, i) => `case ${i}:return ${n};`).join('');
    return `__t(${line},"${names.join(',')}",__k=>{switch(__k){${cases}}})`;
  }

  function fnName(node: Node, parent: Node): string {
    if (node.id) return node.id.name;
    if (parent) {
      if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
      if ((parent.type === 'MethodDefinition' || parent.type === 'Property' || parent.type === 'PropertyDefinition') && !parent.computed) {
        return parent.key.name ?? String(parent.key.value);
      }
      if (parent.type === 'AssignmentExpression' && parent.left.type === 'Identifier') return parent.left.name;
    }
    return node.type === 'ArrowFunctionExpression' ? 'λ' : 'anonymous';
  }

  function visitFunction(node: Node, parent: Node) {
    const names: string[] = [];
    for (const p of node.params) patternNames(p, names);
    const name = JSON.stringify(fnName(node, parent));
    for (const p of node.params) visit(p, node);
    if (node.body.type === 'BlockStatement') {
      hoistedVars(node.body, names);
      lexicalNames(node.body.body, names);
      scopes.push({ names, fn: true });
      open(node.body.start + 1, `__e(${name});try{`);
      close(node.body.end - 1, `}finally{__x()}`);
      visitStatements(node.body.body);
      scopes.pop();
    } else {
      scopes.push({ names, fn: true });
      const t = trace(node.body.loc.start.line).slice(4, -1); // arguments of __t(...)
      open(node.body.start, `__w(${name},${t.includes(',') ? t : `${t},"",null`},${node.async ? 'async' : ''}()=>(`);
      close(node.body.end, '))');
      visit(node.body, node);
      scopes.pop();
    }
  }

  function visitStatements(stmts: Node[]) {
    for (const s of stmts) {
      if (s.type !== 'FunctionDeclaration' && s.type !== 'EmptyStatement' && s.type !== 'BlockStatement' && s.type !== 'ClassDeclaration') {
        open(s.start, `${trace(s.loc.start.line)};`);
      }
      visit(s, null);
    }
  }

  /** A statement used as a loop/if body. Braces are added if it has none. */
  function visitBody(s: Node) {
    if (!s) return;
    if (s.type === 'BlockStatement') {
      visit(s, null);
    } else if (s.type === 'EmptyStatement') {
      /* nothing to trace */
    } else {
      open(s.start, `{${trace(s.loc.start.line)};`);
      close(s.end, '}');
      visit(s, null);
    }
  }

  function traceTest(test: Node) {
    if (!test) return;
    open(test.start, `(${trace(test.loc.start.line)},(`);
    close(test.end, '))');
  }

  function visit(node: Node, parent: Node) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        visitFunction(node, parent);
        return;
      case 'Program': {
        const names: string[] = [];
        hoistedVars(node, names);
        lexicalNames(node.body, names);
        scopes.push({ names, fn: true });
        visitStatements(node.body);
        scopes.pop();
        return;
      }
      case 'BlockStatement':
      case 'StaticBlock': {
        const names: string[] = [];
        lexicalNames(node.body, names);
        scopes.push({ names, fn: false });
        visitStatements(node.body);
        scopes.pop();
        return;
      }
      case 'ReturnStatement': {
        // `return x` becomes `return __r(line,(x))`, `return;` becomes `return __r(line);`.
        const line = node.loc.start.line;
        if (node.argument) {
          open(node.argument.start, `__r(${line},(`);
          close(node.argument.end, '))');
          visit(node.argument, node);
        } else {
          open(node.start + 'return'.length, ` __r(${line})`);
        }
        return;
      }
      case 'IfStatement':
        visit(node.test, node);
        visitBody(node.consequent);
        visitBody(node.alternate);
        return;
      case 'ForStatement': {
        const names: string[] = [];
        if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var') for (const d of node.init.declarations) patternNames(d.id, names);
        visit(node.init, node);
        scopes.push({ names, fn: false });
        traceTest(node.test);
        visit(node.test, node);
        visit(node.update, node);
        visitBody(node.body);
        scopes.pop();
        return;
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const names: string[] = [];
        if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') for (const d of node.left.declarations) patternNames(d.id, names);
        visit(node.right, node);
        scopes.push({ names, fn: false });
        visitBody(node.body);
        scopes.pop();
        return;
      }
      case 'WhileStatement':
        traceTest(node.test);
        visit(node.test, node);
        visitBody(node.body);
        return;
      case 'DoWhileStatement':
        visitBody(node.body);
        traceTest(node.test);
        visit(node.test, node);
        return;
      case 'LabeledStatement':
        // The label must stay attached to its loop, so no braces here.
        visit(node.body, node);
        return;
      case 'WithStatement':
        visit(node.object, node);
        visitBody(node.body);
        return;
      case 'SwitchStatement': {
        visit(node.discriminant, node);
        const names: string[] = [];
        for (const c of node.cases) lexicalNames(c.consequent, names);
        scopes.push({ names, fn: false });
        for (const c of node.cases) {
          visit(c.test, c);
          visitStatements(c.consequent);
        }
        scopes.pop();
        return;
      }
      case 'CatchClause': {
        const names: string[] = [];
        patternNames(node.param, names);
        scopes.push({ names, fn: false });
        visit(node.body, node);
        scopes.pop();
        return;
      }
      default:
        for (const key of Object.keys(node)) {
          if (key === 'loc' || key === 'type') continue;
          const child = node[key];
          if (Array.isArray(child)) child.forEach((c) => visit(c, node));
          else if (child && typeof child.type === 'string') visit(child, node);
        }
    }
  }

  visit(ast, null);

  // At one position, text that closes something goes before text that opens
  // something; closers apply innermost first, openers outermost first.
  edits.sort((a, b) => a.pos - b.pos || Number(b.close) - Number(a.close) || (a.close ? b.seq - a.seq : a.seq - b.seq));
  let out = '';
  let last = 0;
  for (const e of edits) {
    out += code.slice(last, e.pos) + e.text;
    last = e.pos;
  }
  return out + code.slice(last);
}
