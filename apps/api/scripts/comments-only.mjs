/* eslint-disable no-console */
/**
 * COMMENTS-ONLY CHECK — proof that a translation changed nothing but words.
 *
 *   node apps/api/scripts/comments-only.mjs <file> [file...]
 *   node apps/api/scripts/comments-only.mjs --staged
 *
 * WHY THIS EXISTS (17 August 2026)
 *
 * The owner asked for every Bengali comment in the project to become English -
 * about 12,000 lines across 318 files. Touching that many files by hand, the
 * question that matters is not "does it read well" but "did I change anything
 * that RUNS". A stray character inside a Prisma model or a TypeScript function
 * would be a real bug arriving dressed as a translation.
 *
 * So: strip every comment from the committed version and from the working
 * version, and compare what is left. Identical means only comments moved.
 *
 * The first version of this check was an inline sed that removed `//` lines
 * only. It cried wolf on the first block comment it met - and a check that
 * cries wolf is a check people stop reading. Both comment shapes are handled
 * here, which is the whole reason it is a file and not a one-liner.
 *
 * Exits 1 on any real difference, so it can gate a commit.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/*  Strip comments without a full parser. The risk of a dumb stripper is a
    `//` or a `/*` INSIDE a string literal, so strings are consumed first and
    kept verbatim - that way a URL like "https://x" is never mistaken for the
    start of a comment. Template literals included; Prisma has none but the
    .ts files certainly do.  */
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    out += c;
    i++;
  }
  /*  Whitespace and blank lines are noise once the comments are gone: removing
      a comment leaves the indentation that used to precede it.  */
  return out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const args = process.argv.slice(2);
const files = args.includes('--staged')
  ? execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|prisma|css)$/.test(f))
  : args;

if (files.length === 0) {
  console.log('\nnothing to check\n');
  process.exit(0);
}

let bad = 0;
console.log('\nCOMMENTS-ONLY CHECK\n');
for (const file of files) {
  let head;
  try {
    head = execSync(`git show HEAD:${file}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    console.log(`  \x1b[33mNEW\x1b[0m   ${file}  (not in HEAD, nothing to compare)`);
    continue;
  }
  const a = stripComments(head);
  const b = stripComments(readFileSync(file, 'utf8'));
  if (a === b) {
    console.log(`  \x1b[32mSAFE\x1b[0m  ${file}  (only comments changed)`);
  } else {
    bad++;
    console.log(`  \x1b[31mCODE\x1b[0m  ${file}  <- something OUTSIDE a comment changed`);
    const al = a.split('\n');
    const bl = b.split('\n');
    for (let n = 0; n < Math.max(al.length, bl.length); n++) {
      if (al[n] !== bl[n]) {
        console.log(`          was: ${al[n] ?? '(nothing)'}`);
        console.log(`          now: ${bl[n] ?? '(nothing)'}`);
        break;
      }
    }
  }
}

if (bad) {
  console.log(`\n  ${bad} file(s) changed real code. Check before committing.\n`);
  process.exit(1);
}
console.log('\n  Every file changed comments only.\n');
