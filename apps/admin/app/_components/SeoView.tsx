"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  WRAP, FinHeader, Card, Panel, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner, Bar,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, TONE, type Tone,
} from "./FinanceUI";
import {
  seoCoverage, seoPages, saveSeoPage, seoSettings, saveSeoSettings,
  seoRedirects, addSeoRedirect, bulkSeoRedirects, updateSeoRedirect, deleteSeoRedirect,
  ago,
  WEB_HOST,
  type ApiSeoCoverage, type ApiSeoPage, type ApiSeoSetting, type ApiSeoRedirect,
  type SeoPageKind,
} from "../_data/api";

/*
  SEO — the whole job, from this panel and nowhere else.

  The screen is built around one honest idea: an SEO tool that scores you out
  of 100 teaches nothing. So every page here says what is wrong in a sentence a
  shopkeeper can act on — "no description", "another page has this exact
  title", "Google cuts off around 60 characters" — and shows the live preview
  of what a search result will actually look like.

  What is deliberately absent: rank tracking. "Where do we sit for 'flower
  delivery dhaka'" needs somebody crawling Google every day from many places.
  Nothing built here could answer it honestly, and Search Console answers it
  free and better.
*/

const HEALTH_TONE: Record<string, Tone> = { ok: "emerald", watch: "amber", wrong: "rose" };
const TITLE_MAX = 60;
const DESC_MAX = 160;

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const tone: Tone = value === 0 ? "slate" : value > max ? "rose" : value > max * 0.9 ? "amber" : "emerald";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1"><Bar pct={pct} tone={tone} height={4} /></div>
      <span className="text-[11px] tabular-nums" style={{ color: TONE[tone].text }}>
        {value}/{max}
      </span>
      <span className="text-[10.5px] text-body-soft">{label}</span>
    </div>
  );
}

/* ---------------- one page's editor ---------------- */

function PageEditor({ row, onSaved }: { row: ApiSeoPage; onSaved: () => void }) {
  const [f, setF] = useState({
    metaTitle: row.metaTitle ?? "",
    metaDescription: row.metaDescription ?? "",
    ogTitle: row.ogTitle ?? "",
    ogDescription: row.ogDescription ?? "",
    ogImageUrl: row.ogImageUrl ?? "",
    noIndex: row.noIndex,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await saveSeoPage(row.kind, row.id, row.kind === "brand"
        ? { metaTitle: f.metaTitle, metaDescription: f.metaDescription }
        : f);
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const fill = () => setF({
    ...f,
    metaTitle: f.metaTitle || row.name,
    metaDescription: f.metaDescription || (row.description ?? ""),
  });

  return (
    <div className="px-5 py-4 border-t border-[#f3eef7]" style={{ background: "#fdfbfe" }}>
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        <div>
          <Lbl>Title — the blue line in a Google result</Lbl>
          <input className={input} value={f.metaTitle}
            onChange={(e) => setF({ ...f, metaTitle: e.target.value })}
            placeholder={row.name} />
          <Meter value={f.metaTitle.length} max={TITLE_MAX} label="characters" />

          <div className="mt-3">
            <Lbl>Description — the grey lines underneath</Lbl>
            <textarea className={`${input} min-h-[72px]`} value={f.metaDescription}
              onChange={(e) => setF({ ...f, metaDescription: e.target.value })}
              placeholder={row.description ?? "Fresh roses delivered across Dhaka in two hours…"} />
            <Meter value={f.metaDescription.length} max={DESC_MAX} label="characters" />
          </div>

          {row.kind !== "brand" && (
            <div className="mt-3">
              <Lbl>Share picture — what shows on WhatsApp and Facebook</Lbl>
              <input className={input} value={f.ogImageUrl}
                onChange={(e) => setF({ ...f, ogImageUrl: e.target.value })}
                placeholder="https://…" />
            </div>
          )}

          {row.kind !== "brand" && (
            <label className="flex items-center gap-2 mt-3 text-[13px] cursor-pointer">
              <input type="checkbox" checked={f.noIndex}
                onChange={(e) => setF({ ...f, noIndex: e.target.checked })} />
              <span>Keep this page out of Google</span>
            </label>
          )}

          {err && <div className="text-[12px] mt-2" style={{ color: TONE.rose.text }}>{err}</div>}

          <div className="flex items-center gap-2 mt-4">
            <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className={btnGhost} onClick={fill}>Fill from the page</button>
          </div>
        </div>

        {/* what it will actually look like */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-body-soft mb-2">
            How it will look in Google
          </div>
          <div className="rounded-xl border border-[#e7dff0] bg-white p-4">
            <div className="text-[12px] text-[#4d5156] truncate">{WEB_HOST} › {row.slug}</div>
            <div className="text-[17px] leading-snug mt-0.5" style={{ color: "#1a0dab" }}>
              {(f.metaTitle || row.name).slice(0, TITLE_MAX)}
              {(f.metaTitle || row.name).length > TITLE_MAX && "…"}
            </div>
            <div className="text-[13px] leading-snug mt-1 text-[#4d5156]">
              {(f.metaDescription || row.description || "Google will pick a line from the page itself.").slice(0, DESC_MAX)}
              {(f.metaDescription || row.description || "").length > DESC_MAX && "…"}
            </div>
          </div>

          {row.issues.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {row.issues.map((i, n) => (
                <div key={n} className="flex items-start gap-2 text-[12px]">
                  <span style={{ color: i.level === "wrong" ? TONE.rose.text : TONE.amber.text }}>
                    {i.level === "wrong" ? "✕" : "!"}
                  </span>
                  <span className="text-body-soft">{i.what}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- the screen ---------------- */

type SeoTab = "OVERVIEW" | "PAGES" | "REDIRECTS" | "SETTINGS";
const TAB_FROM_URL: Record<string, SeoTab> = {
  pages: "PAGES", redirects: "REDIRECTS", settings: "SETTINGS", overview: "OVERVIEW",
};

export function SeoView() {
  /*  The sidebar links straight to a tab (?tab=redirects). Without this the
      sub-menu would look like four screens and behave like one. */
  const params = useSearchParams();
  const urlTab = TAB_FROM_URL[params?.get("tab") ?? ""] ?? "OVERVIEW";
  const [tab, setTab] = useState<SeoTab>(urlTab);
  useEffect(() => { setTab(urlTab); }, [urlTab]);
  const [kind, setKind] = useState<SeoPageKind>("product");
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [search, setSearch] = useState("");
  const [cov, setCov] = useState<ApiSeoCoverage | null>(null);
  const [rows, setRows] = useState<ApiSeoPage[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [reds, setReds] = useState<ApiSeoRedirect[]>([]);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const loadCov = useCallback(async () => {
    try { setCov(await seoCoverage()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void loadCov(); }, [loadCov]);

  const loadPages = useCallback(async () => {
    if (tab !== "PAGES") return;
    try { setRows(await seoPages({ kind, missing: onlyProblems ? "1" : "", search })); }
    catch (e) { setErr((e as Error).message); }
  }, [tab, kind, onlyProblems, search]);
  useEffect(() => { void loadPages(); }, [loadPages]);

  const loadReds = useCallback(async () => {
    if (tab !== "REDIRECTS") return;
    try { setReds(await seoRedirects()); } catch (e) { setErr((e as Error).message); }
  }, [tab]);
  useEffect(() => { void loadReds(); }, [loadReds]);

  const done = (m: string) => { setOk(m); setErr(""); void loadCov(); void loadPages(); };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Settings"
        title="SEO"
        emoji="🔍"
        tone="sky"
      />
      <Flash ok={ok} err={err} />

      <Tabs value={tab} onChange={setTab} items={[
        { key: "OVERVIEW", label: "Where we stand", emoji: "◎", tone: "sky" },
        { key: "PAGES", label: "Pages", emoji: "📄", tone: "brand" },
        { key: "REDIRECTS", label: "Old links", emoji: "↪", tone: "amber" },
        { key: "SETTINGS", label: "Site-wide", emoji: "⚙", tone: "slate" },
      ]} />

      {tab === "OVERVIEW" && cov && (
        <>
          {!(cov.setup.length === 0) && (
            <Banner tone={cov.setup.some((s) => s.level === "wrong") ? "rose" : "amber"} emoji="⚙"
              title="Site-wide settings need attention"
              right={<button className={btnGhost} onClick={() => setTab("SETTINGS")}>Open</button>}>
              {cov.setup.map((s) => s.what).join(" · ")}
            </Banner>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {([["Products", cov.products], ["Categories", cov.categories], ["Brands", cov.brands]] as const).map(
              ([label, c]) => (
                <Kpi key={label} label={label}
                  value={`${c.ok}/${c.total}`}
                  emoji="📄"
                  tone={c.wrong > 0 ? "rose" : c.watch > 0 ? "amber" : "emerald"}
                  hint={c.wrong > 0 ? `${c.wrong} with nothing written` : c.watch > 0 ? `${c.watch} worth tidying` : "all set"} />
              ),
            )}
            <Kpi label="Old links kept alive" value={String(cov.redirects)} emoji="↪" tone="brand"
              hint="addresses that would 404" />
          </div>

          <Panel title="What needs doing" emoji="✎" tone="brand"
            right={<button className={btnGhost} onClick={() => { setTab("PAGES"); setOnlyProblems(true); }}>Start fixing</button>}>
            <div className="p-5 space-y-3">
              {cov.products.liveAndWrong > 0 && (
                <div className="text-[13.5px]">
                  <strong className="text-purple">{cov.products.liveAndWrong} products are live with no title or description.</strong>
                </div>
              )}
              {cov.categories.wrong > 0 && (
                <div className="text-[13.5px]">
                  <strong className="text-purple">{cov.categories.wrong} categories need a title.</strong>
                </div>
              )}
              {cov.redirects === 0 && (
                <div className="text-[13.5px]">
                  <strong className="text-purple">No redirects set up yet.</strong>
                </div>
              )}
              {cov.products.wrong === 0 && cov.categories.wrong === 0 && cov.redirects > 0 && (
                <div className="text-[13.5px] text-body-soft">Nothing urgent. Titles and descriptions are written.</div>
              )}
            </div>
          </Panel>

        </>
      )}

      {tab === "PAGES" && (
        <>
          <Card className="p-4 mb-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <Lbl>Which pages</Lbl>
                <select className={input} value={kind} onChange={(e) => setKind(e.target.value as SeoPageKind)}>
                  <option value="product">Products</option>
                  <option value="category">Categories</option>
                  <option value="brand">Brands</option>
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <Lbl>Search</Lbl>
                <input className={input} value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="name or address…" />
              </div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer pb-2.5">
                <input type="checkbox" checked={onlyProblems}
                  onChange={(e) => setOnlyProblems(e.target.checked)} />
                <span>Only the ones needing work</span>
              </label>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty emoji="✓" title={onlyProblems ? "Nothing needs work here" : "No pages"}
                sub={onlyProblems ? "Untick the box to see everything." : undefined} />
            ) : (
              <Table head={<><Th>Page</Th><Th>Title</Th><Th>Description</Th><Th>State</Th><Th right></Th></>}>
                {rows.map((r) => (
                  <>
                    <tr key={r.id}>
                      <Td>
                        <span className="font-semibold text-purple">{r.name}</span>
                        <div className="text-[11px] text-body-soft">/{r.slug}</div>
                      </Td>
                      <Td>
                        {r.metaTitle
                          ? <span className="text-[12.5px]">{r.metaTitle.slice(0, 42)}{r.metaTitle.length > 42 ? "…" : ""}</span>
                          : <span className="text-[12px]" style={{ color: TONE.rose.text }}>nothing written</span>}
                      </Td>
                      <Td>
                        {r.metaDescription
                          ? <span className="text-[12px] text-body-soft">{r.metaDescription.length} chars</span>
                          : <span className="text-[12px]" style={{ color: TONE.rose.text }}>nothing written</span>}
                      </Td>
                      <Td>
                        <Chip tone={HEALTH_TONE[r.health]}>
                          {r.health === "ok" ? "fine" : r.health === "watch" ? "could be better" : "needs work"}
                        </Chip>
                        {!r.published && <div className="text-[10.5px] text-body-soft mt-0.5">not live</div>}
                      </Td>
                      <Td right>
                        <button className={btnGhost} onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {open === r.id ? "Close" : "Write"}
                        </button>
                      </Td>
                    </tr>
                    {open === r.id && (
                      <tr key={`${r.id}-edit`}>
                        <td colSpan={5} className="p-0">
                          <PageEditor row={r} onSaved={() => { setOpen(null); done(`${r.name} saved`); }} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "REDIRECTS" && <RedirectsTab rows={reds} onChanged={() => { void loadReds(); void loadCov(); }} setOk={setOk} setErr={setErr} />}
      {tab === "SETTINGS" && <SettingsTab onSaved={() => { setOk("Saved"); void loadCov(); }} setErr={setErr} />}
    </div>
  );
}

/* ---------------- redirects ---------------- */

function RedirectsTab({
  rows, onChanged, setOk, setErr,
}: { rows: ApiSeoRedirect[]; onChanged: () => void; setOk: (s: string) => void; setErr: (s: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try { await addSeoRedirect({ fromPath: from, toPath: to }); setFrom(""); setTo(""); setOk("Added"); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const paste = async () => {
    setBusy(true);
    try {
      const r = await bulkSeoRedirects(bulk);
      setOk(`${r.added} of ${r.seen} added` + (r.failed.length ? ` — ${r.failed.length} could not be read` : ""));
      if (r.failed.length) setErr(r.failed.slice(0, 5).join(" | "));
      setBulk(""); onChanged();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="p-5 mb-4">
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div><Lbl>Old address</Lbl>
            <input className={input} value={from} placeholder="/category/Roses"
              onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Lbl>Send it to</Lbl>
            <input className={input} value={to} placeholder="/category/roses"
              onChange={(e) => setTo(e.target.value)} /></div>
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={add}
            disabled={busy || !from.trim() || !to.trim()}>Add</button>
        </div>

        <div className="mt-5">
          <Lbl>Or paste a list — one per line, old address then new</Lbl>
          <textarea className={`${input} min-h-[90px] font-mono text-[12px]`} value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={"/category/Roses, /category/roses\n/product/red-rose-12, /products/red-roses-bouquet"} />
          <button className={`${btnGhost} mt-2`} onClick={paste} disabled={busy || !bulk.trim()}>
            Add them all
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="↪" title="No old links yet"
            sub="Add them before changing any address — afterwards, the traffic is already gone." />
        ) : (
          <Table head={<><Th>Old address</Th><Th>Goes to</Th><Th>Kind</Th><Th right>Used</Th><Th right></Th></>}>
            {rows.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-55"}>
                <Td><code className="text-[12px]">{r.fromPath}</code></Td>
                <Td><code className="text-[12px] text-purple">{r.toPath}</code></Td>
                <Td>
                  <Chip tone={r.permanent ? "emerald" : "amber"}>
                    {r.permanent ? "permanent" : "temporary"}
                  </Chip>
                </Td>
                <Td right>
                  {r.hits}
                  {r.lastHitAt && <div className="text-[10.5px] text-body-soft">{ago(r.lastHitAt)}</div>}
                </Td>
                <Td right>
                  <div className="flex gap-1.5 justify-end">
                    <button className={btnGhost}
                      onClick={async () => { await updateSeoRedirect(r.id, { isActive: !r.isActive }); onChanged(); }}>
                      {r.isActive ? "Switch off" : "Switch on"}
                    </button>
                    <button className={btnGhost}
                      onClick={async () => { if (confirm(`Remove ${r.fromPath}?`)) { await deleteSeoRedirect(r.id); onChanged(); } }}>
                      Remove
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

/* ---------------- site-wide ---------------- */

function SettingsTab({ onSaved, setErr }: { onSaved: () => void; setErr: (s: string) => void }) {
  const [s, setS] = useState<ApiSeoSetting | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try { setS(await seoSettings()); } catch (e) { setErr((e as Error).message); }
    })();
  }, [setErr]);

  if (!s) return <Empty title="Loading…" />;

  const set = (k: keyof ApiSeoSetting, v: unknown) => setS({ ...s, [k]: v } as ApiSeoSetting);
  const save = async () => {
    setBusy(true);
    try { setS(await saveSeoSettings(s)); onSaved(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      {!s.allowIndexing && (
        <Banner tone="rose" emoji="⚠" title="The whole site is hidden from Google right now">
          Nothing on radianbd.com will appear in any search while this is off.
        </Banner>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="How every page is titled" emoji="✎" tone="brand">
          <div className="p-5 space-y-4">
            <div>
              <Lbl>Title pattern</Lbl>
              <input className={input} value={s.titleTemplate}
                onChange={(e) => set("titleTemplate", e.target.value)} />
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                <code>{"{page}"}</code> is replaced by the page&apos;s own title. Example:{" "}
                <em>{s.titleTemplate.replace("{page}", "Red Rose Bouquet")}</em>
              </p>
            </div>
            <div><Lbl>Shop name</Lbl>
              <input className={input} value={s.siteName} onChange={(e) => set("siteName", e.target.value)} /></div>
            <div>
              <Lbl>Fallback description</Lbl>
              <textarea className={`${input} min-h-[68px]`} value={s.defaultMetaDescription ?? ""}
                onChange={(e) => set("defaultMetaDescription", e.target.value)} />
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">Used when a page has none of its own.</p>
            </div>
            <div><Lbl>Fallback share picture</Lbl>
              <input className={input} value={s.defaultOgImageUrl ?? ""} placeholder="https://…"
                onChange={(e) => set("defaultOgImageUrl", e.target.value)} /></div>
          </div>
        </Panel>

        <Panel title="Proving the site is yours" emoji="🔑" tone="sky">
          <div className="p-5 space-y-4">
            <div>
              <Lbl>Google Search Console tag</Lbl>
              <input className={input} value={s.googleVerification ?? ""}
                placeholder="hNObJMJUvRrjkBlpXsk…"
                onChange={(e) => set("googleVerification", e.target.value)} />
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                Paste only the code, not the whole tag.
              </p>
            </div>
            <div><Lbl>Bing tag</Lbl>
              <input className={input} value={s.bingVerification ?? ""}
                onChange={(e) => set("bingVerification", e.target.value)} /></div>
            <div><Lbl>X / Twitter handle</Lbl>
              <input className={input} value={s.twitterHandle ?? ""} placeholder="@radian"
                onChange={(e) => set("twitterHandle", e.target.value)} /></div>
          </div>
        </Panel>

        <Panel title="What crawlers may look at" emoji="🤖" tone="slate" className="lg:col-span-2">
          <div className="p-5 grid md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.allowIndexing} className="mt-0.5"
                  onChange={(e) => set("allowIndexing", e.target.checked)} />
                <span>
                  <strong>Let search engines find the site</strong>
                  <div className="text-[11.5px] text-body-soft">Off puts “Disallow: /” in robots.txt — nothing gets indexed.</div>
                </span>
              </label>
              <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={s.sitemapEnabled} className="mt-0.5"
                  onChange={(e) => set("sitemapEnabled", e.target.checked)} />
                <span>
                  <strong>Publish a sitemap</strong>
                  <div className="text-[11.5px] text-body-soft">A list of every page, so Google does not have to guess.</div>
                </span>
              </label>
            </div>
            <div>
              <Lbl>Extra robots.txt lines</Lbl>
              <textarea className={`${input} min-h-[80px] font-mono text-[12px]`} value={s.robotsExtra ?? ""}
                onChange={(e) => set("robotsExtra", e.target.value)}
                placeholder="Disallow: /staging" />
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5">
        <button className={btnPrimary} style={btnPrimaryStyle} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
    </>
  );
}
