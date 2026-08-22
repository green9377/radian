"use client";

import { useState } from "react";
import Link from "next/link";

import { resolveWishlist, type WishlistEntry } from "../../_data/wishlist";
import { formatTaka } from "../../_data/products";
import {
  useWishlistHydrated,
  useWishlistStore,
} from "../../_store/useWishlistStore";
import {
  useWishlistGroupHydrated,
  useWishlistGroupStore,
} from "../../_store/useWishlistGroupStore";
import { useZoneStore } from "../../_store/useZoneStore";
import Icon from "../Pdp/PdpIcons";

/*
  /account/wishlist — saved item + user-created folder (grouping)।
  slug useWishlistStore-এ, folder assign useWishlistGroupStore-এ,
  product resolveWishlist()-এ (দাম fresh)।
*/

export default function WishlistPanel() {
  const wlHydrated = useWishlistHydrated();
  const grpHydrated = useWishlistGroupHydrated();
  const slugs = useWishlistStore((s) => s.slugs);
  const removeSlug = useWishlistStore((s) => s.remove);
  const zone = useZoneStore((s) => s.zone);

  const groups = useWishlistGroupStore((s) => s.groups);
  const assign = useWishlistGroupStore((s) => s.assign);
  const createGroup = useWishlistGroupStore((s) => s.createGroup);
  const renameGroup = useWishlistGroupStore((s) => s.renameGroup);
  const deleteGroup = useWishlistGroupStore((s) => s.deleteGroup);
  const assignItem = useWishlistGroupStore((s) => s.assignItem);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const hydrated = wlHydrated && grpHydrated;
  const { entries } = resolveWishlist(slugs, zone);
  const groupIds = new Set(groups.map((g) => g.id));

  const inGroup = (id: string) =>
    entries.filter((e) => assign[e.product.slug] === id);
  const ungrouped = entries.filter(
    (e) => !assign[e.product.slug] || !groupIds.has(assign[e.product.slug]),
  );

  function createFolder() {
    if (newName.trim().length < 1) return;
    createGroup(newName);
    setNewName("");
    setNewOpen(false);
  }

  function removeItem(slug: string) {
    removeSlug(slug);
    assignItem(slug, null);
  }

  if (!hydrated) {
    return <p className="text-[13px] text-body-soft py-4">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[27px] sm:text-[32px] text-purple font-semibold">
            Wishlist
          </h1>
          <p className="text-[13px] text-body-soft mt-1">
            {entries.length} saved · organise them into folders.
          </p>
        </div>
        {!newOpen && (
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex items-center gap-2 h-[44px] px-5 rounded-[14px] bg-purple text-white font-semibold text-[13.5px] hover:bg-purple-deep transition-colors shrink-0"
          >
            <Icon name="tag" className="w-[16px] h-[16px]" />
            New folder
          </button>
        )}
      </div>

      {/* new folder */}
      {newOpen && (
        <div className="flex items-center gap-2 bg-white border-[1.5px] border-orchid-mid rounded-[16px] p-2.5 mt-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            placeholder="Folder name — e.g. Meem's birthday"
            className="ipt"
          />
          <button
            type="button"
            onClick={createFolder}
            className="h-[42px] px-4 rounded-[12px] bg-purple text-white font-semibold text-[13px] hover:bg-purple-deep transition-colors shrink-0"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setNewOpen(false);
              setNewName("");
            }}
            className="h-[42px] px-3 text-[13px] font-semibold text-body-soft hover:text-purple shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white border-[1.5px] border-dashed border-lavender-deep rounded-[22px] p-10 text-center mt-5">
          <span className="w-14 h-14 rounded-full bg-lavender text-orchid grid place-items-center mx-auto">
            <Icon name="heart" className="w-6 h-6" />
          </span>
          <p className="text-[14.5px] text-purple font-semibold mt-4">
            Nothing saved yet
          </p>
          <p className="text-[13px] text-body-soft mt-1">
            Tap the heart on any gift you love and it lives here.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center mt-5 h-[46px] px-6 bg-purple text-white rounded-[14px] font-semibold text-[14px] hover:bg-purple-deep transition-colors"
          >
            Browse best sellers
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {/* groups */}
          {groups.map((g) => (
            <section key={g.id}>
              <div className="flex items-center gap-2 mb-3">
                {editId === g.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameGroup(g.id, editName);
                          setEditId(null);
                        }
                      }}
                      className="ipt max-w-[240px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        renameGroup(g.id, editName);
                        setEditId(null);
                      }}
                      className="text-[12.5px] font-semibold text-orchid"
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-[18px] text-purple font-semibold">
                      {g.name}
                    </h2>
                    <span className="text-[12px] text-body-soft">
                      {inGroup(g.id).length}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditId(g.id);
                        setEditName(g.name);
                      }}
                      className="ml-2 text-[12px] font-semibold text-body-soft hover:text-purple transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteGroup(g.id)}
                      className="text-[12px] font-semibold text-body-soft hover:text-[#B42318] transition-colors"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
              <ItemGrid
                items={inGroup(g.id)}
                groups={groups}
                onMove={assignItem}
                onRemove={removeItem}
              />
            </section>
          ))}

          {/* ungrouped */}
          <section>
            {groups.length > 0 && (
              <h2 className="font-display text-[18px] text-purple font-semibold mb-3">
                Not in a folder{" "}
                <span className="text-[12px] text-body-soft font-normal">
                  {ungrouped.length}
                </span>
              </h2>
            )}
            <ItemGrid
              items={ungrouped}
              groups={groups}
              onMove={assignItem}
              onRemove={removeItem}
            />
          </section>
        </div>
      )}
    </div>
  );
}

/* ─────────── item grid ─────────── */
function ItemGrid({
  items,
  groups,
  onMove,
  onRemove,
}: {
  items: WishlistEntry[];
  groups: { id: string; name: string }[];
  onMove: (slug: string, groupId: string | null) => void;
  onRemove: (slug: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[12.5px] text-body-soft">Nothing here yet.</p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((e) => (
        <div
          key={e.product.slug}
          className="bg-white border-[1.5px] border-lavender-deep rounded-[20px] p-4"
        >
          <div className="flex items-start gap-3">
            <Link
              href={`/p/${e.product.slug}`}
              className="w-16 h-16 rounded-[14px] shrink-0"
              style={{ background: e.product.bg }}
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/p/${e.product.slug}`}
                className="block text-[13px] font-semibold text-purple leading-snug line-clamp-2 hover:text-orchid transition-colors"
              >
                {e.product.name}
              </Link>
              <p className="text-[13px] font-semibold text-purple mt-1">
                {formatTaka(e.product.pricePaisa)}
              </p>
              {!e.deliverable && (
                <p className="text-[11px] text-amber mt-0.5">
                  Inside Dhaka only
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-lavender">
            <select
              value={""}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === "__remove") onRemove(e.product.slug);
                else onMove(e.product.slug, v === "__none" ? null : v);
                ev.target.value = "";
              }}
              className="text-[12px] font-semibold text-purple bg-lavender border-[1.5px] border-lavender-deep rounded-[10px] px-2 py-1.5 outline-none"
            >
              <option value="">Move to…</option>
              <option value="__none">Not in a folder</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__remove">Remove from wishlist</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
