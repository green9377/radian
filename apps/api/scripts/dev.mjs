/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Radian API — the dev runner that does not take the site down.
 *
 *  WHY THIS EXISTS
 *
 *  `nest start --watch` compiles and runs in one step. That sounds tidy until
 *  a type error appears: the compile fails, so nothing is started, so the API
 *  answers nothing at all, and the admin panel shows "The API is not
 *  answering" — for a mistake that had nothing to do with the running code.
 *  A wrong type on a category page took the whole shop offline.
 *
 *  So the two jobs are separated here:
 *
 *    · tsc --watch   — always emits JavaScript. Type errors are printed, not
 *                      obeyed. Types are erased at runtime anyway, so the
 *                      emitted code for a badly-typed file is still the code
 *                      that was written.
 *    · this supervisor — restarts `node dist/main.js` whenever the emitted
 *                      output changes.
 *
 *  The result: a type error shows up in the log, in red, and the API keeps
 *  serving. Only a genuine crash stops it — and then the supervisor says so
 *  in plain words and restarts on the next save instead of dying quietly.
 *
 *  Nothing new is installed. tsc and node are both already in the image.
 *
 *  To go back to the old behaviour: `npm run start:dev:nest`, or point the
 *  api `command:` in docker-compose.yml at it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(APP, 'dist');
const ENTRY = path.join(DIST, 'main.js');

const RESTART_DEBOUNCE_MS = 400;
const FIRST_BUILD_WARN_MS = 180_000;

const say = (msg) => console.log(`\x1b[35m[radian]\x1b[0m ${msg}`);

/* ── 1. the compiler ─────────────────────────────────────────────────────── */

const tsc = spawn(
  process.execPath,
  [
    path.join(APP, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--watch',
    '--project',
    path.join(APP, 'tsconfig.build.json'),
    // keep the scrollback — the default wipes the terminal on every rebuild,
    // which is how a real error scrolls past unread
    '--preserveWatchOutput',
    // a type error is a message, not a veto: emit anyway
    '--noEmitOnError',
    'false',
  ],
  { cwd: APP, stdio: ['ignore', 'inherit', 'inherit'] },
);

tsc.on('exit', (code) => {
  say(`the TypeScript watcher stopped (code ${code}). Restart the container.`);
  process.exit(code ?? 1);
});

/* ── 2. the app ──────────────────────────────────────────────────────────── */

let child = null;
let restartTimer = null;
let startedOnce = false;

function stopChild() {
  if (!child) return;
  const dying = child;
  child = null;
  dying.removeAllListeners('exit');
  dying.kill('SIGTERM');
  // if it will not go quietly
  setTimeout(() => {
    try {
      dying.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }, 3000).unref();
}

function startChild() {
  if (!fs.existsSync(ENTRY)) return;

  child = spawn(process.execPath, [ENTRY], {
    cwd: APP,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });

  const started = child;
  started.on('exit', (code, signal) => {
    if (child !== started) return; // we replaced it on purpose
    child = null;
    if (signal) return;
    if (code === 0) {
      say('the API exited cleanly. Waiting for the next save.');
    } else {
      say(
        `the API crashed (exit ${code}). This is a RUNTIME fault, not a type ` +
          `error — read the stack above. Waiting for the next save; it will ` +
          `start again on its own.`,
      );
    }
  });
}

function scheduleRestart(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!fs.existsSync(ENTRY)) return;
    if (!startedOnce) {
      startedOnce = true;
      say('first build done — starting the API.');
    } else {
      say(`restarting the API (${reason}).`);
    }
    stopChild();
    startChild();
  }, RESTART_DEBOUNCE_MS);
}

/* ── 3. watch what the compiler emits ────────────────────────────────────── */

fs.mkdirSync(DIST, { recursive: true });

/*
  ⚠️ POLLING IS THE PRIMARY MECHANISM NOW, NOT THE FALLBACK — 4 Aug 2026.

  `fs.watch` was the primary and polling only ran if watch THREW. On Docker
  Desktop for Windows the bind-mounted `dist/` never throws — it just never
  fires. So tsc would finish emitting, no event arrived, and node kept serving
  last week's JavaScript until somebody restarted the container twice (the
  first restart raced the compile; the second finally picked it up). That
  two-restart ritual burned an afternoon of "why is my fix not live" three
  separate times on 3 Aug alone.

  A 2-second mtime sweep of dist/ is immeasurably cheap next to that. The
  fs.watch stays as a bonus for filesystems where it does work — a duplicate
  trigger is debounced away by `scheduleRestart` anyway.
*/
try {
  fs.watch(DIST, { recursive: true }, (_event, filename) => {
    if (filename && !filename.endsWith('.js')) return; // ignore .d.ts / .map churn
    scheduleRestart(filename ? `${filename} changed` : 'output changed');
  });
} catch {
  /* fine — the poller below is the one we actually rely on */
}

{
  let last = '';
  setInterval(() => {
    let stamp = '';
    try {
      stamp = fs
        .readdirSync(DIST, { recursive: true })
        .filter((f) => String(f).endsWith('.js'))
        .map((f) => {
          try {
            return `${f}:${fs.statSync(path.join(DIST, String(f))).mtimeMs}`;
          } catch {
            return '';
          }
        })
        .join('|');
    } catch {
      return; // dist/ mid-write — next tick will see it
    }
    if (stamp !== last) {
      const first = last === '';
      last = stamp;
      if (!first) scheduleRestart('output changed');
    }
  }, 2000).unref();
}

if (fs.existsSync(ENTRY)) scheduleRestart('startup');

setTimeout(() => {
  if (!startedOnce) {
    say(
      'still no dist/main.js after three minutes. The first compile is either ' +
        'very slow or failing hard — read the tsc output above.',
    );
  }
}, FIRST_BUILD_WARN_MS).unref();

/* ── 4. shut down together ───────────────────────────────────────────────── */

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopChild();
    tsc.removeAllListeners('exit');
    tsc.kill('SIGTERM');
    process.exit(0);
  });
}

say('watching. A type error will be printed but will NOT stop the API.');
