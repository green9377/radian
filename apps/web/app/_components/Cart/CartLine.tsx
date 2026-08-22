"use client";

import Link from "next/link";

import { formatTaka } from "../../_data/products";
import type { ResolvedLine } from "../../_data/cart";
import Icon from "../Pdp/PdpIcons";

/*
  Cart line — board-এর line card।

  ⚠️ Board-এ line-এর ভেতরে gift message আর "Edit message" ছিল।
  D14 অনুযায়ী gift message ORDER-level, item-level নয় → Checkout-এ।
  তাই এখানে নেই।

  Line-এ যা edit করা যায় (locked): qty · remove line · remove add-on ·
  size upgrade। Size/bundle/variant পুরো বদলাতে হলে "Edit" → PDP।
  কারণ: cart-এ পুরো configurator বসালে PDP-র নকল হয়, আর cart হালকা
  রাখার নিয়ম ভাঙে।
*/

function QtyStepper({
  qty,
  onQty,
}: {
  qty: number;
  onQty: (q: number) => void;
}) {
  return (
    <div className="inline-flex items-center border-[1.5px] border-lavender-deep rounded-full overflow-hidden bg-white">
      <button
        onClick={() => onQty(qty - 1)}
        disabled={qty <= 1}
        aria-label="Decrease quantity"
        className="w-9 h-9 grid place-items-center text-purple text-lg leading-none disabled:text-lavender-deep disabled:cursor-not-allowed hover:bg-lavender transition-colors"
      >
        −
      </button>
      <b className="w-8 text-center text-[14px] text-purple font-semibold tabular-nums">
        {qty}
      </b>
      <button
        onClick={() => onQty(qty + 1)}
        aria-label="Increase quantity"
        className="w-9 h-9 grid place-items-center text-purple text-lg leading-none hover:bg-lavender transition-colors"
      >
        +
      </button>
    </div>
  );
}

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
        {/*  DEC-PRD-012 — যে রঙটা কেনা হয়েছে সেটারই ছবি। নাহলে cart-এ
             লাল আর গোলাপি দুটো line-এ একই ছবি বসে থাকত আর কোনটা কোনটা
             বোঝা যেত না।  */}
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

          {/* add-on chips — এখানেই সরানো যায় */}
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

          {/* personalisation — PDP-তে যা লেখা হয়েছিল */}
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

          {/* size upgrade nudge — একটাই inline edit যা দাম বাড়ায় */}
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

          <QtyStepper qty={item.qty} onQty={onQty} />

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

      {/* ─── zone conflict flag — কিছু auto-delete হয় না ─── */}
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
