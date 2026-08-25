"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import type { ResolvedLine } from "../../_data/cart";
import Icon from "../Pdp/PdpIcons";
import QtyStepper from "../Common/QtyStepper";

/*
  Cart line — the line card on the cart board.

  ⚠️ The board had the gift message and "Edit message" inside the line. Per
  D14 the gift message is ORDER-level, not item-level, so it lives on the
  Checkout page and not here.

  What a line can edit (locked): qty · remove line · remove add-on · size
  upgrade. Changing the size/bundle/variant outright means "Edit" -> PDP,
  because a full configurator in the cart is a second copy of the PDP and
  breaks the rule that the cart stays light.
*/

export default function CartLine({
  line,
  onQty,
  onRemove,
  onRemoveAddon,
  onUpgrade,
  onSwitchToDhaka,
}: {
  line: ResolvedLine;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onRemoveAddon: (key: string) => void;
  onUpgrade: (sizeId: string) => void;
  onSwitchToDhaka: () => void;
}) {
  const { item, detail, product, size, variant, bundles, addons, nextSize, held } = line;
  const href = `/p/${product.slug}`;

  const upgradeCost = nextSize ? nextSize.pricePaisa - size.pricePaisa : 0;

  return (
    <div
      className={`bg-white border-[1.5px] rounded-[22px] p-4 sm:p-5 transition-colors ${
        held ? "border-[#F2D9A8]" : "border-lavender-deep"
      }`}
    >
      <div className="grid grid-cols-[84px_1fr] sm:grid-cols-[110px_1fr_auto] gap-4">
        {/* photo */}
        {/*  DEC-PRD-012 — the photo of the colour that was actually bought.
             Otherwise a red line and a pink line sit in the cart under the
             same picture and nobody can tell them apart.  */}
        <Link
          href={href}
          className="block aspect-square rounded-[16px] overflow-hidden"
          style={{
            background: variant?.imageUrl
              ? `url(${variant.imageUrl}) center/cover`
              : product.bg,
          }}
          aria-label={product.name}
        />

        {/* body */}
        <div className="min-w-0">
          <Link
            href={href}
            className="block font-display text-[16px] sm:text-[17px] text-purple font-semibold leading-snug hover:text-orchid transition-colors"
          >
            {product.name}
          </Link>

          <p className="text-[13px] text-body-soft mt-1">
            {variant && <b className="text-body font-semibold">{variant.label} · </b>}
            <b className="text-body font-semibold">{size.label}</b>
            {size.sub ? ` · ${size.sub}` : ""}
            {bundles.map((b) => ` · ${b.label}`).join("")}
          </p>

          {/* zone chip */}
          <span
            className={`inline-flex items-center gap-1.5 mt-2 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
              product.zone === "dhaka"
                ? "bg-orchid-soft text-orchid"
                : "bg-[#EEF1FB] text-[#3A4B8A]"
            }`}
          >
            <Icon
              name={product.zone === "dhaka" ? "bolt" : "truck"}
              className="w-3 h-3"
            />
            {product.zone === "dhaka" ? detail.deliveryChip : "Ships nationwide"}
          </span>

          {/* add-on chips — removable right here */}
          {addons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {addons.map((a) => (
                <span
                  key={a.key}
                  className="inline-flex items-center gap-1.5 bg-lavender border border-lavender-deep rounded-full pl-3 pr-1.5 py-1 text-[12px] text-body"
                >
                  {a.name} <b className="text-purple">+{formatTaka(a.pricePaisa)}</b>
                  <button
                    onClick={() => onRemoveAddon(a.key)}
                    aria-label={`Remove ${a.name}`}
                    className="w-[18px] h-[18px] grid place-items-center rounded-full bg-white text-body-soft text-[11px] leading-none hover:bg-purple hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* personalisation — what was written on the PDP */}
          {(item.persoText || item.persoImage) && (
            <div className="flex items-center gap-2.5 mt-2.5 bg-lavender border border-lavender-deep rounded-[12px] px-3 py-2">
              <Icon name="pen" className="w-3.5 h-3.5 text-orchid shrink-0" />
              <span className="text-[12.5px] text-body truncate">
                {item.persoText && (
                  <>
                    Your text: <b className="text-purple">“{item.persoText}”</b>
                  </>
                )}
                {item.persoText && item.persoImage ? " · " : ""}
                {item.persoImage && <>Photo attached: {item.persoImage}</>}
              </span>
            </div>
          )}

          {/* size upgrade nudge — the one inline edit that raises the price */}
          {nextSize && upgradeCost > 0 && !held && (
            <button
              onClick={() => onUpgrade(nextSize.id)}
              className="inline-flex items-center gap-1.5 mt-2.5 text-[12.5px] font-semibold text-orchid bg-orchid-soft border border-orchid-mid rounded-full px-3 py-1.5 hover:bg-orchid hover:text-white transition-colors"
            >
              <Icon name="sparkle" className="w-3.5 h-3.5" />
              Upgrade to {nextSize.label} for +{formatTaka(upgradeCost)}
            </button>
          )}
        </div>

        {/* right rail */}
        <div className="col-span-2 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between gap-3 sm:gap-2.5 pt-1">
          <div className="text-right">
            <div className="font-display text-[18px] text-purple font-semibold whitespace-nowrap">
              {formatTaka(line.linePaisa)}
            </div>
            {item.qty > 1 && (
              <div className="text-[11.5px] text-body-soft">
                {formatTaka(line.unitPaisa)} each
              </div>
            )}
          </div>

          <QtyStepper value={item.qty} onChange={onQty} min={1} />

          <div className="flex items-center gap-3 text-[12.5px]">
            <Link href={href} className="text-body-soft hover:text-orchid transition-colors">
              Edit
            </Link>
            <button
              onClick={onRemove}
              className="text-body-soft hover:text-[#C4172B] transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* ─── zone conflict flag — nothing is auto-deleted ─── */}
      {held && (
        <div className="mt-4 flex items-center gap-3 flex-wrap bg-[#FFF7E8] border border-[#F2D9A8] rounded-[14px] px-4 py-3">
          <Icon name="truck" className="w-[18px] h-[18px] text-[#8A5A00] shrink-0" />
          <span className="text-[13px] text-[#8A5A00] flex-1 min-w-[180px]">
            <b>Dhaka only.</b> {detail.ozReason}
          </span>
          <span className="flex items-center gap-3 text-[12.5px] font-semibold">
            <button
              onClick={onSwitchToDhaka}
              className="text-[#8A5A00] underline underline-offset-2 hover:text-purple"
            >
              Switch back to Dhaka
            </button>
            <button
              onClick={onRemove}
              className="text-[#8A5A00] underline underline-offset-2 hover:text-[#C4172B]"
            >
              Remove
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
