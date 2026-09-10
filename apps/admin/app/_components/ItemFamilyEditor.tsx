"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, ACCENT, msg, ErrBar, OkBar, ItemThumb, QuickSelect } from "./ItemUI";
import {
  Sect, Row, Pair, SwitchRow, Note, TakaInput, PercentInput, PhotoDrop, VariantPhoto,
} from "./ItemEditor";
import {
  listItems, updateItem, getItemSettings, loadItemCategoriesSafe, loadBrandsSafe,
  createItemCategory, createBrand,
  formatTaka, ITEM_TYPE_META,
  type ApiItem, type ApiItemCategory, type ApiBrand,
} from "../_data/api";

/*
  Edit a whole VARIANT FAMILY — the owner's ruling, 20 Aug 2026: clicking edit on a
  family must open the full page, the same shape as creating one, not a small dialog.

  What this screen is for: the ten colours of one flower share almost everything —
  category, profit, how they are used, where they are sold. Setting that ten times
  is how they drift apart. So the sections below write to EVERY member at once, and
  only the two things that are genuinely per-variant — its photo and, if you want
  it, its own fixed price — are listed one row per variant.

  Nothing is touched unless it is changed: each section is saved by the one Save
  button, and a field left alone is not sent.
*/

type Section = "basics" | "classify" | "photo" | "behaviour" | "price" | "stock" | "connect";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "basics", label: "Basics", icon: "edit" },
  { key: "classify", label: "Category & labels", icon: "grid" },
  { key: "photo", label: "Photos", icon: "photo" },
  { key: "behaviour", label: "How it is used", icon: "shield" },
  { key: "price", label: "Price & cost", icon: "cash" },
  { key: "stock", label: "Stock & alerts", icon: "box" },
  { key: "connect", label: "Sell online", icon: "link" },
];

/** the value every member agrees on, or null when they differ */
function shared<T>(members: ApiItem[], pick: (i: ApiItem) => T): T | null {
  if (!members.length) return null;
  const first = pick(members[0]);
  return members.every((m) => pick(m) === first) ? first : null;
}

export default function ItemFamilyEditor({ familyKey }: { familyKey: string }) {
  const [members, setMembers] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("basics");

  const [cats, setCats] = useState<ApiItemCategory[]>([]);
  const [brands, setBrands] = useState<ApiBrand[]>([]);
  const [shopMarkupBp, setShopMarkupBp] = useState<number | null>(null);

  /* ---- the edits, all optional: undefined = leave every member alone ---- */
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [isPurchasable, setIsPurchasable] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [markupPct, setMarkupPct] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<"keep" | "auto" | "fixed">("keep");
  const [priceTk, setPriceTk] = useState("");
  const [reorder, setReorder] = useState<string | null>(null);
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  /** per-variant photo, applied on save (itemId → url or null to clear) */
  const [photos, setPhotos] = useState<Record<string, string | null>>({});

  async function load() {
    setLoading(true);
    try {
      const all = await listItems();
      setMembers(all.filter((i) => i.familyKey === familyKey));
    } catch (e) { setErr(msg(e, "Could not load this family.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [familyKey]);

  useEffect(() => {
    loadItemCategoriesSafe().then((r) => setCats(r.groups)).catch(() => setCats([]));
    loadBrandsSafe().then((r) => setBrands(r.items)).catch(() => setBrands([]));
    getItemSettings().then((s) => setShopMarkupBp(s.defaultMarkupBp)).catch(() => setShopMarkupBp(null));
  }, []);

  const base = members[0]?.name.split(" — ")[0] ?? "Family";
  const typeMeta = members[0] ? ITEM_TYPE_META[members[0].itemType] : null;

  /* what the family currently agrees on — the starting state of every control */
  const cur = useMemo(() => ({
    isActive: shared(members, (i) => i.isActive),
    isPurchasable: shared(members, (i) => i.isPurchasable),
    isOnline: shared(members, (i) => i.isOnline ?? true),
    categoryId: shared(members, (i) => i.itemCategoryId ?? ""),
    brandId: shared(members, (i) => i.brandId ?? ""),
    markupBp: shared(members, (i) => i.markupBp ?? null),
    reorderLevel: shared(members, (i) => i.reorderLevel ?? null),
  }), [members]);

  const val = <T,>(edited: T | null, current: T | null): T | null => (edited === null ? current : edited);

  const dirty =
    isActive !== null || isPurchasable !== null || isOnline !== null ||
    categoryId !== null || brandId !== null || markupPct !== null ||
    priceMode !== "keep" || reorder !== null || groupPhoto !== null ||
    Object.keys(photos).length > 0;

  async function save() {
    if (!dirty || !members.length) return;
    setSaving(true); setErr(null); setOk(null);

    const common: Record<string, unknown> = {};
    if (isActive !== null) common.isActive = isActive;
    if (isPurchasable !== null) common.isPurchasable = isPurchasable;
    if (isOnline !== null) common.isOnline = isOnline;
    if (categoryId !== null) common.itemCategoryId = categoryId || null;
    if (brandId !== null) common.brandId = brandId || null;
    if (markupPct !== null) {
      common.markupBp = markupPct.trim() === ""
        ? null
        : Math.max(0, Math.round((parseFloat(markupPct) || 0) * 100));
    }
    if (priceMode === "auto") common.sellingPricePaisa = null;
    if (priceMode === "fixed") {
      common.sellingPricePaisa = Math.max(0, Math.round((parseFloat(priceTk) || 0) * 100));
    }
    if (reorder !== null) {
      common.reorderLevel = reorder.trim() === "" ? null : Math.max(0, Math.round(Number(reorder) || 0));
    }

    try {
      await Promise.all(members.map((m) => {
        const own: Record<string, unknown> = { ...common };
        // a variant's own picture wins; the group photo fills the ones left blank
        if (m.id in photos) own.imageUrl = photos[m.id];
        else if (groupPhoto !== null && !m.imageUrl) own.imageUrl = groupPhoto;
        return Object.keys(own).length ? updateItem(m.id, own) : Promise.resolve(null);
      }));
      setOk(`${members.length} variant${members.length === 1 ? "" : "s"} saved.`);
      setIsActive(null); setIsPurchasable(null); setIsOnline(null);
      setCategoryId(null); setBrandId(null); setMarkupPct(null);
      setPriceMode("keep"); setPriceTk(""); setReorder(null);
      setGroupPhoto(null); setPhotos({});
      await load();
    } catch (e) { setErr(msg(e, "Could not save the family.")); }
    finally { setSaving(false); }
  }

  if (loading) return <div className={WRAP}><p className="text-[13px] text-body-soft">Loading…</p></div>;
  if (!members.length) return (
    <div className={WRAP}>
      <p className="text-[13px] text-body-soft">
        This family no longer exists. <Link href="/items/list" className="underline">All items</Link>
      </p>
    </div>
  );

  const markupNow = val(markupPct === null ? null : markupPct, cur.markupBp === null ? null : String(cur.markupBp / 100));
  const catNow = val(categoryId, cur.categoryId ?? "") ?? "";
  const brandNow = val(brandId, cur.brandId ?? "") ?? "";

  return (
    <div className={WRAP}>
      {/* header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/items/list" className="w-[34px] h-[34px] rounded-[10px] border border-lavender-deep bg-white grid place-items-center text-purple hover:border-orchid">
            <Icon name="chevronLeft" size={16} />
          </Link>
          <div>
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: ACCENT }}>master data · item group</div>
            <h1 className="font-display text-[25px] text-purple mt-1 mb-0 leading-tight">{base}</h1>
            <span className="text-[12.5px] font-semibold mt-1 inline-flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ background: "#34163b", color: "#bd73e8" }}>
              <Icon name="sparkle" size={11} /> {members.length} variants
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/items/list" className="border border-lavender-deep bg-white text-purple text-[13.5px] font-medium px-4 py-2.5 rounded-[11px] hover:border-orchid">Cancel</Link>
          <button onClick={save} disabled={saving || !dirty}
            className="text-white text-[13.5px] font-medium px-5 py-2.5 rounded-[11px] shadow-soft inline-flex items-center gap-2 disabled:opacity-50"
            style={{ background: ACCENT }}>
            <Icon name="check" size={15} /> {saving ? "Saving…" : `Save all ${members.length}`}
          </button>
        </div>
      </div>

      {err && <ErrBar text={err} onClose={() => setErr(null)} />}
      {ok && <OkBar text={ok} onClose={() => setOk(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-[186px_minmax(0,1fr)_290px] gap-5 items-start">
        {/* ---- section rail ---- */}
        <nav className="bg-white border border-lavender-deep rounded-[16px] shadow-soft p-2 lg:sticky lg:top-5">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className="w-full text-left text-[13.5px] font-semibold px-3 py-2.5 rounded-[10px] flex items-center gap-2.5 mb-0.5"
              style={section === s.key ? { background: ACCENT, color: "#fff" } : { color: "#dfd2e4" }}>
              <Icon name={s.icon} size={14} /> {s.label}
            </button>
          ))}
        </nav>

        {/* ---- the sections ---- */}
        <div className="bg-white border border-lavender-deep rounded-[18px] shadow-soft p-5">
          {section === "basics" && (
            <Sect title="Basics" hint="Names and codes belong to each variant — open one to rename it.">
              <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: "#403149" }}>
                {members.map((m) => (
                  <Link key={m.id} href={`/items/${m.id}`}
                    className="px-3.5 py-2.5 flex items-center gap-3 border-b last:border-0 hover:bg-lavender/30"
                    style={{ borderColor: "#3f304b" }}>
                    <ItemThumb item={m} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-body truncate">{m.name}</span>
                      <span className="block font-mono text-[12px] text-body-soft truncate">{m.sku}</span>
                    </span>
                    <span className="text-[12.5px] text-body-soft">
                      {m.effectiveSellPricePaisa == null ? "no price" : formatTaka(m.effectiveSellPricePaisa)}
                    </span>
                    <Icon name="chevronDown" size={14} className="text-body-soft -rotate-90" />
                  </Link>
                ))}
              </div>
              {typeMeta && (
                <Note tone="grey">
                  Every variant is a <b>{typeMeta.label}</b>. Changing that is a per-item decision — open the one that needs it.
                </Note>
              )}
            </Sect>
          )}

          {section === "classify" && (
            <Sect title="Category & labels" hint="Applied to every variant at once.">
              <Pair>
                <Row label="Item category">
                  <QuickSelect
                    value={catNow}
                    placeholder={cur.categoryId === null ? "— they differ —" : "— no category —"}
                    onChange={(id) => setCategoryId(id)}
                    createLabel="Create category"
                    options={cats
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => ({
                        id: c.id,
                        label: c.parentId ? `${cats.find((x) => x.id === c.parentId)?.name ?? "?"} › ${c.name}` : c.name,
                      }))}
                    onCreate={async (label) => {
                      try {
                        const created = await createItemCategory({ name: label.trim() });
                        setCats((p) => [...p, created]);
                        return created.id;
                      } catch (e) { setErr(msg(e, "Could not create that category.")); return null; }
                    }}
                  />
                </Row>
                <Row label="Brand">
                  <QuickSelect
                    value={brandNow}
                    placeholder={cur.brandId === null ? "— they differ —" : "— none —"}
                    onChange={(id) => setBrandId(id)}
                    createLabel="Create brand"
                    options={brands.map((b) => ({ id: b.id, label: b.name }))}
                    onCreate={async (label) => {
                      try {
                        const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                        const created = await createBrand({ name: label.trim(), slug: slug || `brand-${Date.now()}` });
                        setBrands((p) => [...p, created]);
                        return created.id;
                      } catch (e) { setErr(msg(e, "Could not create that brand.")); return null; }
                    }}
                  />
                </Row>
              </Pair>
              <Note tone="grey">
                Colour and size are what make these variants different, so they stay on each one.
              </Note>
            </Sect>
          )}

          {section === "photo" && (
            <Sect title="Photos" hint="One picture per variant. The group photo fills any that are still empty.">
              <Row label="Group photo — fills the empty ones">
                <PhotoDrop
                  item={{ sku: base, name: base, imageUrl: groupPhoto }}
                  onImage={(u) => setGroupPhoto(u)}
                  onErr={setErr}
                />
              </Row>
              <div className="rounded-[16px] border overflow-hidden" style={{ borderColor: "#402e4c" }}>
                <div className="px-4 py-3" style={{ background: ACCENT }}>
                  <span className="text-[13.5px] font-bold text-white">{members.length} variants</span>
                </div>
                <div className="max-h-[340px] overflow-y-auto divide-y divide-lavender-deep">
                  {members.map((m) => {
                    const url = m.id in photos ? photos[m.id] : m.imageUrl ?? groupPhoto;
                    const own = m.id in photos ? !!photos[m.id] : !!m.imageUrl;
                    return (
                      <div key={m.id} className="px-3.5 py-2.5 grid grid-cols-[46px_minmax(0,1fr)_auto] gap-3 items-center">
                        <VariantPhoto name={m.name} url={url ?? null} own={own}
                          onPick={(u) => setPhotos((p) => ({ ...p, [m.id]: u }))}
                          onErr={setErr} />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold text-purple truncate">{m.name}</div>
                          <div className="font-mono text-[12px] text-body-soft truncate">{m.sku}</div>
                        </div>
                        <span className="text-[12px] font-semibold shrink-0"
                          style={{ color: own ? "#76efab" : "#b0a4b7" }}>
                          {own ? "own photo" : "uses group photo"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Sect>
          )}

          {section === "behaviour" && (
            <Sect title="How it is used" hint="Applied to every variant at once.">
              <div className="rounded-[14px] border overflow-hidden divide-y" style={{ borderColor: "#403149" }}>
                <SwitchRow on={val(isPurchasable, cur.isPurchasable) ?? false}
                  onClick={() => setIsPurchasable(!(val(isPurchasable, cur.isPurchasable) ?? false))}
                  icon="download" tone="#0e8f74"
                  title="We buy it" sub={cur.isPurchasable === null && isPurchasable === null ? "they differ — one press sets them all" : "Can go on a purchase order"} />
                <SwitchRow on={val(isActive, cur.isActive) ?? false}
                  onClick={() => setIsActive(!(val(isActive, cur.isActive) ?? false))}
                  icon="check" tone="#8b21c9"
                  title="Show in the shop" sub={cur.isActive === null && isActive === null ? "they differ — one press sets them all" : "Hidden variants sell nowhere"} />
              </div>
              <Note tone="grey">
                Everything in the item list is for selling (DEC-ITM-025); the counter shows whatever is shown in the shop.
              </Note>
            </Sect>
          )}

          {section === "price" && (
            <Sect title="Price & cost" hint="The cost is each variant's own purchase average; the rule below applies to all.">
              <Row label="Counter price">
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {([
                    ["keep", "Leave as they are"],
                    ["auto", "Automatic (cost + profit)"],
                    ["fixed", "One fixed price for all"],
                  ] as const).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setPriceMode(k)}
                      className="text-[12.5px] font-semibold px-3 py-1.5 rounded-[9px] border-2"
                      style={priceMode === k
                        ? { background: ACCENT, borderColor: ACCENT, color: "#fff" }
                        : { background: "#fff", borderColor: "#403149", color: "#dfd2e4" }}>
                      {label}
                    </button>
                  ))}
                </div>
                {priceMode === "fixed" && (
                  <div className="max-w-[220px]">
                    <TakaInput value={priceTk} onChange={setPriceTk} placeholder="0.00" />
                  </div>
                )}
              </Row>

              <Row label="Profit %" hint="Blank uses the shop default. Applied to every variant.">
                <div className="max-w-[140px]">
                  <PercentInput
                    value={markupNow ?? ""}
                    onChange={(v) => setMarkupPct(v)}
                    placeholder={String((shopMarkupBp ?? 2000) / 100)}
                  />
                </div>
              </Row>

              <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: "#403149" }}>
                <div className="px-4 py-2.5 border-b text-[12.5px] font-bold text-purple" style={{ background: "#291a35", borderColor: "#403149" }}>
                  What each one costs and sells for now
                </div>
                <div className="divide-y divide-lavender-deep">
                  {members.map((m) => (
                    <div key={m.id} className="px-4 py-2 grid grid-cols-[minmax(0,1fr)_100px_120px] gap-3 items-center text-[13px]">
                      <span className="truncate text-body">{m.name}</span>
                      <span className="text-right text-body-soft">{formatTaka(m.effectiveCostPaisa ?? 0)}</span>
                      <span className="text-right font-semibold" style={{ color: m.effectiveSellPricePaisa == null ? "#e1837a" : "#0e7a3d" }}>
                        {m.effectiveSellPricePaisa == null ? "no price" : formatTaka(m.effectiveSellPricePaisa)}
                        {m.sellPriceIsManual && <span className="text-[11px] font-normal text-body-soft"> fixed</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Sect>
          )}

          {section === "stock" && (
            <Sect title="Stock & alerts" hint="The count itself lives in Inventory; this is only the alert level.">
              <Row label="Low stock point">
                <div className="max-w-[200px]">
                  <input className="ipt w-full" inputMode="numeric"
                    placeholder={cur.reorderLevel === null ? "they differ" : "e.g. 20"}
                    value={reorder ?? (cur.reorderLevel != null ? String(cur.reorderLevel) : "")}
                    onChange={(e) => setReorder(e.target.value)} />
                </div>
              </Row>
            </Sect>
          )}

          {section === "connect" && (
            <Sect title="Sell online" hint="Whether these variants may sit behind a product page.">
              <div className="rounded-[14px] border overflow-hidden divide-y" style={{ borderColor: "#403149" }}>
                <SwitchRow on={val(isOnline, cur.isOnline) ?? false}
                  onClick={() => setIsOnline(!(val(isOnline, cur.isOnline) ?? false))}
                  icon="link" tone="#8b21c9"
                  title="Sell online" sub={cur.isOnline === null && isOnline === null ? "they differ — one press sets them all" : "Off keeps them off the product page; the counter still sells them"} />
              </div>
            </Sect>
          )}
        </div>

        {/* ---- what will change ---- */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-5">
          <div className="bg-white border border-lavender-deep rounded-[16px] shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 th border-b border-lavender-deep bg-lavender/30">What will change</div>
            <div className="p-4 text-[12.5px]">
              {!dirty && <span className="text-body-soft">Nothing yet — every field is as the family has it.</span>}
              <ul className="m-0 pl-4 space-y-1 text-body">
                {isActive !== null && <li>{isActive ? "Show" : "Hide"} all {members.length}</li>}
                {isPurchasable !== null && <li>{isPurchasable ? "Can" : "Cannot"} be bought</li>}
                {isOnline !== null && <li>{isOnline ? "Allowed" : "Not allowed"} on the website</li>}
                {categoryId !== null && <li>Category set for all</li>}
                {brandId !== null && <li>Brand set for all</li>}
                {markupPct !== null && <li>Profit {markupPct.trim() === "" ? "back to the shop default" : `${markupPct}%`}</li>}
                {priceMode === "auto" && <li>All prices follow cost + profit</li>}
                {priceMode === "fixed" && <li>All fixed at ৳{priceTk || "0"}</li>}
                {reorder !== null && <li>Low stock point for all</li>}
                {groupPhoto !== null && <li>Group photo on the ones with none</li>}
                {Object.keys(photos).length > 0 && <li>{Object.keys(photos).length} photo(s) changed</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
