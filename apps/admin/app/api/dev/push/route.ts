import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  ⚠️ DEV-ONLY HELPER — delete this folder with the rest of app/api/dev once the API is
  stable. Companion to ../fix: that one starts the stack, this one pushes the schema.

  Why `db push` and NOT `migrate dev`:
    · the Item tables in this database were themselves created by a push, so there is no
      migration history to extend;
    · `db push` WITHOUT --accept-data-loss REFUSES to run the moment a change would drop
      a column or a table. That refusal is the safety net we want while a second chat
      session is touching the same schema file (21 Jul incident: a migration offered to
      drop Unit.baseUnitId holding real rows).

  Everything this route pushes is additive: a new ItemTypeMaster table and new nullable
  columns on Item. If it ever reports a data-loss warning instead of succeeding, STOP —
  that means the schema file no longer matches the database and someone must look.

  SAFETY: no request input reaches the shell. There are no parameters.
*/

const ROOT = "D:\\radian";

const STEPS: { label: string; cmd: string; timeoutMs: number }[] = [
  { label: "push schema (refuses on data loss)", cmd: "docker compose exec -T api npx prisma db push", timeoutMs: 180_000 },
  { label: "generate prisma client", cmd: "docker compose exec -T api npx prisma generate", timeoutMs: 120_000 },
  { label: "restart api", cmd: "docker compose restart api", timeoutMs: 120_000 },
];

async function ping(path: string) {
  try {
    const r = await fetch(`http://localhost:4000${path}`, { cache: "no-store" });
    return { path, status: r.status, sample: (await r.text()).slice(0, 200) };
  } catch (e) {
    return { path, status: 0, sample: e instanceof Error ? e.message : "unreachable" };
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }

  const log: { label: string; ok: boolean; out: string }[] = [];

  for (const step of STEPS) {
    try {
      const { stdout, stderr } = await run(step.cmd, { cwd: ROOT, timeout: step.timeoutMs, windowsHide: true });
      log.push({ label: step.label, ok: true, out: (stdout + stderr).trim().slice(-2000) });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      log.push({
        label: step.label,
        ok: false,
        out: ((err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? "")).trim().slice(-2000),
      });
      break; // a failed push makes the following steps meaningless
    }
  }

  await new Promise((r) => setTimeout(r, 18_000)); // let nest --watch recompile

  let apiLog = "";
  try {
    const { stdout, stderr } = await run("docker compose logs --tail 120 api", {
      cwd: ROOT, timeout: 60_000, windowsHide: true,
    });
    apiLog = (stdout + stderr).slice(-5000);
  } catch (e) {
    apiLog = e instanceof Error ? e.message : "could not read logs";
  }

  const checks = [];
  for (const p of ["/items", "/item-types", "/item-categories"]) checks.push(await ping(p));

  return NextResponse.json({ ranAt: new Date().toISOString(), log, checks, apiLog });
}
