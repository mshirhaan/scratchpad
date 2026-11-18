export type LangId =
  | 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'c' | 'go' | 'rust'
  | 'csharp' | 'kotlin' | 'swift' | 'ruby' | 'php';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Status = 'todo' | 'attempted' | 'solved';

export interface Problem {
  id: string;
  number?: number;
  title: string;
  url?: string;
  difficulty: Difficulty;
  topic: string;
  status: Status;
  solvedAt?: number;
  custom?: boolean;
}

export interface Scene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** One editor tab. Code is kept per language so switching languages is lossless. */
export interface CodeFile {
  id: string;
  name: string;
  language: LangId;
  code: Partial<Record<LangId, string>>;
  /** Breakpoint line numbers, per language like the code. */
  breakpoints?: Partial<Record<LangId, number[]>>;
  /** Lines marked with the highlighter, per language like the code. */
  highlights?: Partial<Record<LangId, number[]>>;
  /** Notes for this file (approach, complexity, mistakes). */
  notes: string;
}

/** One whiteboard tab. */
export interface Canvas {
  id: string;
  name: string;
  scene: Scene | null;
}

/** Everything saved for one problem (or the free-practice workspace). */
export interface Workspace {
  id: string;
  files: CodeFile[];
  activeFile: string;
  canvases: Canvas[];
  activeCanvas: string;
  stdin: string;
  updatedAt: number;
}

/** Shape saved before multiple files/canvases existed; migrated on load. */
export interface LegacyWorkspace {
  id: string;
  language: LangId;
  code: Partial<Record<LangId, string>>;
  stdin: string;
  notes: string;
  scene: Scene | null;
  updatedAt: number;
}

export interface Settings {
  theme: 'dark' | 'light';
  fontSize: number;
  backendUrl: string;
  split: number;
  bottomHeight: number;
  defaultLanguage: LangId;
  githubRepo: string;
  /** Right-hand side of the debugger: drawn data structures, or the variable tree. */
  debugView?: 'visual' | 'calls' | 'vars';
  lastSync?: number;
}

// ---- Debugger trace (same shape from every language backend) ----

export type Val =
  | { k: 'num' | 'str' | 'bool' | 'null' | 'fn' | 'other'; v: string }
  | { k: 'obj'; label: string; e: [string, Val][]; more?: number };

export interface Frame {
  name: string;
  line: number;
  vars: [string, Val][];
  /** Unique per call, when the tracer can tell (Python, JS). Used to build the call tree. */
  id?: number;
}

export interface Step {
  line: number;
  stack: Frame[];
  /** Length of stdout produced before this step. */
  out: number;
  ev?: 'exception' | 'return';
  msg?: string;
}

export interface Trace {
  steps: Step[];
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: string;
  exitCode?: number | null;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timeMs: number;
  note?: string | null;
  phase?: 'compile' | 'run';
}
