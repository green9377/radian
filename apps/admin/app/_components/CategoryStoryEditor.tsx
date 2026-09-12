"use client";

import { useEffect, useState } from "react";

import Icon from "./Icon";
import { Info } from "./ItemEditor";
import ShopIconPreview, { ICON_NAMES, hasClearBackground } from "./ShopIconPreview";
import {
  uploadImage,
  listCategoryBadges,
  addCategoryBadge,
  updateCategoryBadge,
  removeCategoryBadge,
  addCategorySpec,
  updateCategorySpec,
  removeCategorySpec,
  /*  DEC-PRD-046 — a category holds several named "What's inside" lists.  */
  listCategorySpecLists,
  addCategorySpecList,
  updateCategorySpecList,
  removeCategorySpecList,
  listCategoryFaqs,
  addCategoryFaq,
  updateCategoryFaq,
  removeCategoryFaq,
  type ApiCategoryFaq,
  type ApiCategoryTrustBadge,
  type ApiCategorySpec,
  type ApiCategorySpecList,
} from "../_data/api";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CATEGORY STORY — product page-এর trust badge আর "What's inside"

  DEC-PRD-023, মালিক ২ আগস্ট ২০২৬:
  > *"trust badges, what's inside, faq আসতাছে — কিন্তু এগুলা admin panel-এর
  >  কোথা থেকে আসতাছে? আমি তো কোথাও করি নাই... trust badge-এ তো আমি কোন icon
  >  কিছুই custom করে বানাতে পারছি না, তুমি নিজের মতো করে দিয়ে দিছ।"*

  ⚠️ ঠিক ধরেছেন। এতদিন এই দুটোর সারি তৈরি হতো product editor-এর **হাতে লেখা
  template** থেকে — আমার বেছে দেওয়া icon আর শব্দ, বদলানোর কোনো পর্দা নেই।

  ⚠️ Storefront → Trust আলাদা জিনিস: ওটা homepage-এর strip, গোটা সাইটের।
  এটা product page-এর, category ধরে।

  সব বদল সাথে সাথেই save হয় — একটা badge মানে দুটো ছোট ঘর, তার জন্য
  আলাদা "Save" বোতাম রাখা মানে অকারণে একটা ধাপ বাড়ানো। TrustStripView-ও
  এই একই কারণে এভাবেই কাজ করে।
  ═══════════════════════════════════════════════════════════════════════════
*/

export default function CategoryStoryEditor({
  categoryId,
  only,
}: {
  categoryId: string;
  only?: "badges" | "inside" | "faqs";
}) {
  const [badges, setBadges] = useState<ApiCategoryTrustBadge[]>([]);
  /*  DEC-PRD-046 — the named lists, each with its rows. The single `specs`
      array is gone: "the category's list" is no longer one thing.  */
  const [lists, setLists] = useState<ApiCategorySpecList[]>([]);
  const [openList, setOpenList] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<ApiCategoryFaq[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listCategoryBadges(categoryId),
      listCategorySpecLists(categoryId).catch(() => [] as ApiCategorySpecList[]),
      listCategoryFaqs(categoryId).catch(() => [] as ApiCategoryFaq[]),
    ])
      .then(([b, s, f]) => {
        if (!alive) return;
        setBadges(b);
        setLists(s);
        /*  Open the first one, so the screen is never a row of chips with
            nothing underneath them.  */
        setOpenList((cur) => (s.some((x) => x.id === cur) ? cur : (s[0]?.id ?? null)));
        setFaqs(f);
      })
      .catch(() => {
        if (!alive) return;
        setBadges([]);
        setLists([]);
        setOpenList(null);
        setFaqs([]);
      });
    return () => {
      alive = false;
    };
  }, [categoryId]);

  const open = lists.find((t) => t.id === openList) ?? null;

  function patchRow(listId: string, rowId: string, body: Partial<ApiCategorySpec>) {
    setLists((r) =>
      r.map((t) =>
        t.id === listId
          ? { ...t, rows: (t.rows ?? []).map((x) => (x.id === rowId ? { ...x, ...body } : x)) }
          : t,
      ),
    );
  }
  function dropRow(listId: string, rowId: string) {
    setLists((r) =>
      r.map((t) => (t.id === listId ? { ...t, rows: (t.rows ?? []).filter((x) => x.id !== rowId) } : t)),
    );
  }

  function patchBadge(id: string, body: Partial<ApiCategoryTrustBadge>) {
    setBadges((r) => r.map((x) => (x.id === id ? { ...x, ...body } : x)));
    updateCategoryBadge(id, body).catch((e: Error) => setErr(e.message));
  }

  async function pickFile(id: string, file: File | null) {
    if (!file) return;
    setBusy(id);
    setErr(null);
    try {
      const { url } = await uploadImage(file, "icons");
      /*  ⚠️ নিজের ছবি বসলে built-in নামটা মুছে যায় — server-ও ঠিক এটাই
          করে। দুটো একসাথে থাকলে সারিটা দেখে বলা যেত না কোনটা দেখাবে।  */
      patchBadge(id, { iconUrl: url, icon: null });
      setPicking(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {err && <div className="text-[13px] text-[var(--t-bad)]">{err}</div>}

      {/* ─────────────── TRUST BADGES ─────────────── */}
      {(!only || only === "badges") && (
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-1.5">
          Trust badges
        </div>
        <div className="flex flex-col gap-2.5">
          {badges.map((b) => (
            <div key={b.id} className="border border-lavender-deep rounded-[12px] bg-white">
              <div className="flex items-start gap-3 p-3">
                <button
                  type="button"
                  onClick={() => setPicking(picking === b.id ? null : b.id)}
                  title="Change the icon"
                  className="w-[42px] h-[42px] rounded-[11px] border border-lavender-deep grid place-items-center text-orchid shrink-0 hover:border-orchid transition-colors"
                >
                  {busy === b.id ? (
                    <Icon name="upload" size={16} />
                  ) : (
                    <ShopIconPreview name={b.icon} url={b.iconUrl} size={22} />
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    className="ipt font-semibold text-purple"
                    defaultValue={b.label}
                    placeholder="2-Hour Delivery"
                    onBlur={(e) =>
                      e.target.value !== b.label && patchBadge(b.id, { label: e.target.value })
                    }
                  />
                  <input
                    className="ipt"
                    defaultValue={b.sub ?? ""}
                    placeholder="inside Dhaka"
                    onBlur={(e) =>
                      e.target.value !== (b.sub ?? "") && patchBadge(b.id, { sub: e.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    type="button"
                    title={b.isActive ? "Showing" : "Hidden"}
                    onClick={() => patchBadge(b.id, { isActive: !b.isActive })}
                    className={
                      "w-[32px] h-[32px] rounded-[9px] grid place-items-center transition-colors " +
                      (b.isActive
                        ? "bg-lavender text-purple hover:bg-purple hover:text-white"
                        : "bg-[var(--s-accent)] text-body-soft")
                    }
                  >
                    <Icon name="eye" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBadges((r) => r.filter((x) => x.id !== b.id));
                      removeCategoryBadge(b.id).catch(() => {});
                    }}
                    className="w-[32px] h-[32px] rounded-[9px] grid place-items-center bg-lavender text-body-soft hover:bg-[var(--s-bad)] hover:text-[var(--t-bad)] transition-colors"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              {picking === b.id && (
                <div className="px-3 pb-3">
                  <div className="rounded-[12px] bg-lavender/40 border border-lavender-deep p-3">
                    {/*  ⚠️ Said BEFORE the picker, never under the upload
                        button — read after a file is chosen it is too late to
                        be of any use. (Learned in TrustStripView.)

                        ⚠️ And it is no longer about the SIZE. The owner
                        uploaded at exactly the size this used to print and the
                        row still looked wrong: the shop draws his file and a
                        built-in at the same 24px, and what differs is the
                        file. (9 Sep 2026)  */}
                    <div className="flex items-start gap-2 bg-white border border-lavender-deep rounded-[9px] px-3 py-2 mb-3">
                      <span className="text-orchid shrink-0 mt-0.5">
                        <Icon name="upload" size={14} />
                      </span>
                      <span className="text-[12px] text-body leading-relaxed">
                        <b className="text-purple font-semibold">Square, edge to edge, on a
                        see-through background</b> — SVG or PNG, max 50 KB.
                      </span>
                    </div>

                    <div className="text-[12px] text-body-soft mb-2">Pick a symbol</div>
                    <div
                      className="grid gap-1.5 mb-3"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(38px, 1fr))" }}
                    >
                      {ICON_NAMES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            patchBadge(b.id, { icon: n, iconUrl: null });
                            setPicking(null);
                          }}
                          title={n}
                          className={
                            "aspect-square rounded-[10px] grid place-items-center border transition-colors " +
                            (b.icon === n
                              ? "border-orchid text-orchid bg-white"
                              : "border-transparent bg-white text-body hover:border-orchid hover:text-orchid")
                          }
                        >
                          <ShopIconPreview name={n} size={19} />
                        </button>
                      ))}
                    </div>

                    <div className="flex items-baseline gap-3 flex-wrap border-t border-lavender-deep pt-3">
                      <label className="inline-flex items-center gap-1.5 text-[12.5px] text-purple font-medium cursor-pointer hover:text-purple-deep">
                        <Icon name="upload" size={14} /> Upload your own
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => pickFile(b.id, e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>

                    {/*  The verdict the moment it is known, from the stored
                        file's own name — what the uploader found in the pixels
                        (`media.ts`), not a guess from the extension.  */}
                    {b.iconUrl && (
                      hasClearBackground(b.iconUrl) ? null : (
                        <p className="mt-2.5 text-[12px] text-[var(--t-warn)] bg-[var(--s-warn)] border border-[var(--l-warn)] rounded-[9px] px-3 py-2">
                          <b>This file has no see-through background.</b>
                        </p>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              const row = await addCategoryBadge({ categoryId, icon: "bolt", label: "" });
              setBadges((r) => [...r, row]);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple border border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors"
        >
          <Icon name="plus" size={15} /> Add a badge
        </button>
      </div>
      )}

      {/* ─────────────── WHAT'S INSIDE · the named lists (DEC-PRD-046) ─────── */}
      {(!only || only === "inside") && (
      <div className={only ? "" : "border-t border-lavender-deep pt-5"}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid">
            What&rsquo;s inside
          </div>
          <Info text="The table under “Before You Order”." />
        </div>

        {/*  ── which list ──
            Owner, 23 Aug 2026: *"what's inside a to akhon aktai template kra
            jay. onk time dekha jay akta category te 4-5 ta thakle subida
            hoy."* One category, several contents lists.  */}
        <div className="flex flex-wrap gap-2 mb-3">
          {lists.map((t) => {
            const on = t.id === openList;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenList(t.id)}
                className={`inline-flex items-center gap-2 text-[13.5px] font-bold px-4 py-2.5 rounded-[12px] border-2 transition-all ${
                  on
                    ? "bg-purple border-purple text-white shadow-[0_4px_14px_rgba(71,0,102,.3)]"
                    : "bg-white border-lavender-deep text-purple hover:border-orchid"
                }`}
              >
                {t.name.trim() || "Untitled list"}
                <span
                  className={`inline-grid place-items-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11.5px] font-extrabold ${
                    on ? "bg-white/25 text-white" : "bg-orchid-soft text-purple"
                  }`}
                >
                  {(t.rows ?? []).length}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={async () => {
              try {
                const t = await addCategorySpecList(categoryId, "");
                setLists((r) => [...r, { ...t, rows: [] }]);
                setOpenList(t.id);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-bold px-4 py-2.5 rounded-[12px] border-2 border-dashed border-orchid-mid bg-white text-orchid hover:bg-orchid-soft/40 transition-colors"
          >
            <Icon name="plus" size={15} /> New list
          </button>
        </div>

        {open && (
          <div className="rounded-[14px] border-2 border-lavender-deep bg-white overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[linear-gradient(135deg,var(--a-solid),#fff)] border-b border-lavender-deep">
              <input
                className="ipt font-bold text-purple flex-1 min-w-0"
                style={{ minHeight: 40 }}
                defaultValue={open.name}
                key={`name-${open.id}`}
                placeholder="Name this list — Rose bouquet"
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v === open.name) return;
                  setLists((r) => r.map((x) => (x.id === open.id ? { ...x, name: v } : x)));
                  updateCategorySpecList(open.id, { name: v }).catch((x: Error) => setErr(x.message));
                }}
              />
              {/*  Removing a list takes its rows with it. Nothing that was
                  already copied onto a product is touched — those rows belong
                  to the product now.  */}
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Remove “${open.name.trim() || "this list"}” and its ${(open.rows ?? []).length} row(s)? Products that already copied it keep what they have.`,
                    )
                  )
                    return;
                  const id = open.id;
                  setLists((r) => r.filter((x) => x.id !== id));
                  setOpenList(null);
                  removeCategorySpecList(id).catch((e: Error) => setErr(e.message));
                }}
                className="text-[12.5px] font-bold px-3 py-2 rounded-[10px] border-2 border-lavender-deep bg-white text-body-soft hover:border-[var(--l-bad)] hover:text-[var(--t-bad)] shrink-0"
              >
                Remove list
              </button>
            </div>

            <div className="p-3">
              <div className="flex flex-col gap-2">
                {(open.rows ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2.5 border border-lavender-deep rounded-[11px] bg-white px-3 py-2"
                  >
                    <input
                      className="ipt"
                      defaultValue={s.item}
                      placeholder="Red Rose (fresh cut)"
                      onBlur={(e) => {
                        if (e.target.value === s.item) return;
                        const v = e.target.value;
                        patchRow(open.id, s.id, { item: v });
                        updateCategorySpec(s.id, { item: v }).catch(() => {});
                      }}
                    />
                    <input
                      className="ipt"
                      style={{ width: 180 }}
                      defaultValue={s.qty}
                      placeholder="24 sticks"
                      onBlur={(e) => {
                        if (e.target.value === s.qty) return;
                        const v = e.target.value;
                        patchRow(open.id, s.id, { qty: v });
                        updateCategorySpec(s.id, { qty: v }).catch(() => {});
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        dropRow(open.id, s.id);
                        removeCategorySpec(s.id).catch(() => {});
                      }}
                      className="w-[32px] h-[32px] rounded-[9px] grid place-items-center text-body-soft hover:text-[var(--t-bad)] shrink-0"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const row = await addCategorySpec({
                      categoryId,
                      templateId: open.id,
                      item: "",
                      qty: "",
                    });
                    setLists((r) =>
                      r.map((x) => (x.id === open.id ? { ...x, rows: [...(x.rows ?? []), row] } : x)),
                    );
                  } catch (e) {
                    setErr((e as Error).message);
                  }
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-purple border-2 border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors"
              >
                <Icon name="plus" size={15} /> Add a row
              </button>
            </div>
          </div>
        )}

        {lists.length === 0 && (
          <p className="text-[13px] text-body-soft m-0">
            No list yet — press <b className="font-bold text-purple">New list</b>.
          </p>
        )}
      </div>
      )}

      {/*
        ─────────────── FAQ ───────────────
        DEC-PRD-037, owner 9 Aug 2026: *"product upload page-এ যে FAQ আছে, যা
        category-wise load হয় — কিন্তু এই FAQ কোথায় template বানাব সেটা তো
        কোথাও দেখলাম না। Category create বা edit page-এও FAQ নেই।"*

        ⚠️ He was right, and the gap was ours. `CategoryFaq` has had a table, a
        service and four endpoints since the category work; the storefront has
        been merging them under "Before You Order" all along. The one thing
        never built was the screen to write them — so the only FAQ anybody
        could reach was the product editor's "Template" loader, which read the
        MOCK catalogue (its dropdown still lists eight category names that do
        not exist in this shop). Invented answers, no way to author real ones.

        This is that screen. The mock loader goes at the same time.
      */}
      {(!only || only === "faqs") && (
      <div className={only ? "" : "border-t border-lavender-deep pt-5"}>
        <div className="text-[11px] font-bold uppercase tracking-[0.09em] text-orchid mb-1.5">
          FAQ
        </div>
        <div className="flex flex-col gap-2.5">
          {faqs.map((f) => (
            <div key={f.id} className="border border-lavender-deep rounded-[12px] bg-white p-3">
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    className="ipt font-semibold text-purple"
                    defaultValue={f.question}
                    placeholder="How long do the flowers last?"
                    onBlur={(e) => {
                      if (e.target.value === f.question) return;
                      const v = e.target.value;
                      setFaqs((r) => r.map((x) => (x.id === f.id ? { ...x, question: v } : x)));
                      updateCategoryFaq(f.id, { question: v }).catch((err: Error) =>
                        setErr(err.message),
                      );
                    }}
                  />
                  <textarea
                    className="ipt min-h-[74px] py-2"
                    defaultValue={f.answer}
                    placeholder="Five to seven days with a daily water change…"
                    onBlur={(e) => {
                      if (e.target.value === f.answer) return;
                      const v = e.target.value;
                      setFaqs((r) => r.map((x) => (x.id === f.id ? { ...x, answer: v } : x)));
                      updateCategoryFaq(f.id, { answer: v }).catch((err: Error) =>
                        setErr(err.message),
                      );
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFaqs((r) => r.filter((x) => x.id !== f.id));
                    removeCategoryFaq(f.id).catch(() => {});
                  }}
                  className="w-[32px] h-[32px] shrink-0 rounded-[9px] grid place-items-center text-body-soft hover:bg-[var(--s-bad)] hover:text-[var(--t-bad)] transition-colors"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          /*  ⚠️ NOT an empty row. Badges and specs are allowed to start blank,
              but this endpoint refuses one ("a question needs both a question
              and an answer") — so the button did nothing at all, silently.
              Caught live, 9 Aug 2026. A new row starts as a real, editable
              question instead; the shop only shows what is written anyway.  */
          onClick={async () => {
            try {
              const row = await addCategoryFaq(categoryId, {
                question: "New question",
                answer: "Write the answer here.",
              });
              setFaqs((r) => [...r, row]);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-purple border border-lavender-deep bg-white rounded-[10px] px-3 py-2 hover:border-orchid transition-colors"
        >
          <Icon name="plus" size={15} /> Add a question
        </button>
      </div>
      )}
    </div>
  );
}
