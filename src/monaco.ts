// Bundles Monaco locally (no CDN) and wires up its web workers.
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
  },
};

loader.config({ monaco });

const base = { inherit: true, rules: [] };
monaco.editor.defineTheme('algodesk-dark', {
  ...base,
  base: 'vs-dark',
  colors: { 'editor.background': '#12161c', 'editorGutter.background': '#12161c', 'editor.lineHighlightBackground': '#1a2029', 'editorLineNumber.foreground': '#4b5565' },
});
monaco.editor.defineTheme('algodesk-light', {
  ...base,
  base: 'vs',
  colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#ffffff' },
});

// The in-browser runner provides readline()/prompt() for reading the Input tab.
/* eslint-disable @typescript-eslint/no-explicit-any */
const ts: any = (monaco as any).typescript ?? (monaco.languages as any).typescript;
try {
  const lib = 'declare function readline(): string | null;';
  ts?.javascriptDefaults?.addExtraLib(lib, 'algodesk.d.ts');
  ts?.typescriptDefaults?.addExtraLib(lib, 'algodesk.d.ts');
} catch {
  /* optional nicety */
}

export { monaco };
