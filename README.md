# Scratchpad

A practice desk for DSA / LeetCode problems: a runnable, debuggable code editor on the left, an Excalidraw whiteboard on the right, and a roadmap of questions to work through. Everything is saved in your browser and can be synced to a GitHub repository.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` starts both the web app and the local server.

For a single-process setup: `npm run build`, then `npm start`, then open http://localhost:8787.

## What it does

- **Editor**: Monaco (the VS Code editor) with 13 languages. `Ctrl/⌘ + Enter` runs, `Ctrl/⌘ + Shift + Enter` debugs.
- **Debugger**: records the whole run, then lets you step forwards *and backwards*, set breakpoints (click a line number), walk the call stack and expand every variable. Changed variables are highlighted.
  Keys: `F10` step over, `F11` step into, `Shift+F11` step out, `F8` continue, `F9` step back, `Shift+F8` run backwards.
- **Whiteboard**: Excalidraw, one drawing per problem.
- **Roadmap**: 119 starter LeetCode questions in 16 topics. Add, edit and delete your own, tick them off, filter and search.
- **Per problem**: code for each language, the drawing, notes and program input are stored together.
- **Saving**: automatic, in this browser (IndexedDB). The download/upload buttons export and restore a backup file.
- **GitHub sync**: sign in with GitHub, then push everything to a private repository (a folder per problem with solution files, `notes.md`, `drawing.excalidraw`, plus a progress README) and pull it back on another device.

## Languages

| Language | Runs | Step debugger |
| --- | --- | --- |
| Python, JavaScript, TypeScript | in the browser, no server needed | yes |
| Java, C++, C | on the local server | yes (needs `javac`/`java`, or `g++`/`gcc` + `gdb`) |
| Go, Rust, C#, Kotlin, Swift, Ruby, PHP | on the local server | not yet |

Server languages use whatever is installed on the machine running the server; Settings shows which were found. C# needs the .NET 10 SDK (`dotnet run file.cs`).

Programs read input from the **Input** tab: `input()` in Python, `Scanner`/`cin` in Java/C++, `readline()` in JavaScript.

Limits: browser runs stop after 15 s, server runs after 10 s; a debug recording holds up to 5000 steps in the browser and 3000 on the server.

## GitHub sign-in setup (once)

The "Connect GitHub" button uses the normal GitHub authorisation screen, which requires an OAuth app:

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**.
2. Authorization callback URL: `http://localhost:5173/api/github/callback` (use `:8787` if you run the built app, or your own domain when hosted).
3. Copy `.env.example` to `.env` and fill in `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
4. Restart the server.

The access token is kept in your browser only; the server just completes the sign-in.

## Hosting notes

The server executes whatever code it is sent, so it listens on `127.0.0.1` only by default. Do not expose it to the internet without putting execution in a sandbox (for example a container per run). The frontend alone (`dist/`) can be hosted on any static host; Python, JavaScript and TypeScript keep working there, and you can point it at your own server under Settings (add the site to `ALLOWED_ORIGINS`).

## Layout

```
src/                 React app
  runners/           in-browser JS/TS and Python runners + debug tracers
  components/        editor, debugger, whiteboard, roadmap, dialogs
  github.ts          OAuth popup + repository sync
server/
  index.js           API, GitHub OAuth, static hosting
  exec.js            compile/run with time and output limits
  tracers/           Java (JDI) and C/C++ (gdb) step recorders
```
