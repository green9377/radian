import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  ⚠️ DEV-ONLY HELPER — delete this folder once the API is stable.

  Why it exists (21 Jul 2026): the owner asked not to be given terminal commands to
  type. The admin dev server already runs on his machine with Node, so this route can
  start the API container and report back, and Claude can trigger it from the browser.

  SAFETY: the command list below is HARD-CODED. Nothing from the request is ever put
  into a shell — there are no parameters at all. It refuses to run unless
  NODE_ENV !== "production".
*/

const ROOT = "D:\\radian";

const STEPS: { label: string; cmd: string; timeoutMs: number }[] = [
  { label: "docker version", cmd: "docker version --format \"{{.Server.Version}}\"", timeoutMs: 20_000 },
  { label: "start postgres + api", cmd: "docker compose up -d postgres api", timeoutMs: 180_000 },
  { label: "apply migrations", cmd: "docker compose run --rm api npx prisma migrate deploy", timeoutMs: 180_000 },
  { label: "generate prisma client", cmd: "docker compose exec -T api npx prisma generate", timeoutMs: 120_000 },
  { label: "restart api", cmd: "docker compose restart api", timeoutMs: 120_000 },
];

async function ping(path: string) {
  try {
    const r = await fetch(`http://localhost:4000${path}`, { cache: "no-store" });
    const body = await r.text();
    return { path, status: r.status, sample: body.slice(0, 160) };
  } catch (e) {
    return { path, status: 0, sample: e instanceof Error ? e.message : "unreachable" };
  }
}

/* ---- optional: put the starter categories + labels in, so the screens are not empty ---- */

const API = "http://localhost:4000";

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

const CATEGORIES: [string, string[]][] = [
  ["Fresh Flowers", ["Roses", "Lilies", "Fillers"]],
  ["Artificial Flowers", []],
  ["Packaging", ["Wrapping", "Ribbon", "Boxes"]],
  ["Gift Items", ["Chocolate", "Soft Toys"]],
  ["Workshop Supplies", []],
];

const LABELS: [string, { label: string; swatch?: string }[]][] = [
  ["Colour", [
    { label: "Red", swatch: "#c62828" }, { label: "White", swatch: "#fafafa" },
    { label: "Yellow", swatch: "#f9c623" }, { label: "Pink", swatch: "#e87ba4" },
    { label: "Orange", swatch: "#ef7028" }, { label: "Purple", swatch: "#7a2ea8" },
    { label: "Blue", swatch: "#2563a8" }, { label: "Mixed" },
  ]],
  ["Size", [{ label: "Small" }, { label: "Medium" }, { label: "Large" }, { label: "Extra Large" }]],
];

async function seed() {
  const done: string[] = [];
  const failed: string[] = [];

  for (const [top, kids] of CATEGORIES) {
    try {
      const parent = (await post("/item-categories", { name: top })) as { id: string };
      done.push(top);
      for (const k of kids) {
        try { await post("/item-categories", { name: k, parentId: parent.id }); done.push(`${top} › ${k}`); }
        catch { failed.push(`${top} › ${k}`); }
      }
    } catch { failed.push(top); }
  }

  for (const [name, values] of LABELS) {
    try {
      const attr = (await post("/item-attributes", { name })) as { id: string };
      done.push(name);
      for (const v of values) {
        try { await post(`/item-attributes/${attr.id}/values`, { label: v.label, swatch: v.swatch ?? null }); done.push(`${name}: ${v.label}`); }
        catch { failed.push(`${name}: ${v.label}`); }
      }
    } catch { failed.push(name); }
  }

  return { created: done.length, skipped: failed.length, done, failed };
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev only" }, { status: 403 });
  }

  // ?seed=1 — only fills the two masters; it does not restart anything
  if (new URL(req.url).searchParams.get("seed") === "1") {
    try { return NextResponse.json(await seed()); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "seed failed" }, { status: 500 }); }
  }

  const log: { label: string; ok: boolean; out: string }[] = [];

  for (const step of STEPS) {
    try {
      const { stdout, stderr } = await run(step.cmd, { cwd: ROOT, timeout: step.timeoutMs, windowsHide: true });
      log.push({ label: step.label, ok: true, out: (stdout + stderr).trim().slice(-1500) });
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      log.push({
        label: step.label,
        ok: false,
        out: ((err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? "")).trim().slice(-1500),
      });
      // docker missing or compose broken → the rest cannot help, stop and report
      if (step.label === "docker version") break;
    }
  }

  // give nest --watch time to compile before judging it
  await new Promise((r) => setTimeout(r, 20_000));

  let apiLog = "";
  try {
    const { stdout, stderr } = await run("docker compose logs --tail 150 api", {
      cwd: ROOT, timeout: 60_000, windowsHide: true,
    });
    apiLog = (stdout + stderr).slice(-6000);
  } catch (e) {
    apiLog = e instanceof Error ? e.message : "could not read logs";
  }

  const checks = [];
  for (const p of ["/items", "/item-categories", "/item-attributes", "/units", "/products"]) {
    checks.push(await ping(p));
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), log, checks, apiLog });
}
