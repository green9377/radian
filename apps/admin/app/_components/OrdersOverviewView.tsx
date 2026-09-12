"use client";

/*  ORDERS OVERVIEW — the day on the shop floor, and the run behind it.

    Rebuilt on OverviewKit (12 Sep 2026) so it matches the Business and
    Accounts dashboards. It replaces the one dark-canvas screen in the admin:
    that page carried its own colour table, which meant the Day skin could not
    reach it. Every colour here is a token.

    ⚠️ TWO PERIODS, BECAUSE THE ENDPOINT HAS TWO.
    `/orders/overview` takes a `date` and a `range`, and the range ALWAYS ends
    tonight - `monthStart` is computed from today, not from the chosen date. So
    this screen shows them as the two separate things they are: a DAY switch
    that moves the slot board, and a LAST-N-DAYS switch for the figures that
    look back. Folding them into one control would have put a chosen date in
    the heading over figures measured from today. Until the endpoint accepts an
    exact window, "pick dates" is not offered here - a period you cannot
    measure must not be offered.

    ⚠️ WEBSITE ORDERS ONLY. The endpoint filters `fulfillmentType` to DELIVERY
    and PICKUP, so counter bills are not here. The scope marks say so; the
    Business dashboard is where the two shops are added together.  */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { WRAP, Header } from "./DeliveryUI";
import { ErrorBox } from "./OrderViews";
import {
  ordersOverview, deliveryMoney, formatTaka,
  type ApiOrdersOverview, type ApiMoney, type ApiOverviewWatch,
} from "../_data/api";
import {
  BarChart, Card, Chip, Delta, Empty, Kpi, KpiRow, NowBand, Rule, Scope, Seg, SourceNote,
  Stat, SubHead, Table, Td, TrackRow, bdDay, count, dayLabel, useLoadState,
  type NowJob, type Point,
} from "./OverviewKit";

type DayKey = "today" | "yesterday";
type RangeKey = "7" | "30" | "90";

const WATCH_LABEL: Record<ApiOverviewWatch["kind"], { text: string; tone: "bad" | "warn" | "mute" }> = {
  LATE: { text: "Late", tone: "bad" },
  FAILED: { text: "Failed", tone: "bad" },
  COD_CALL: { text: "Cash to confirm", tone: "warn" },
  PHOTO: { text: "Photo missing", tone: "warn" },
  UNCONFIRMED: { text: "Not confirmed", tone: "warn" },
};

export default function OrdersOverviewView() {
  const [day, setDay] = useState<DayKey>("today");
  const [range, setRange] = useState<RangeKey>("30");
  const [o, setO] = useState<ApiOrdersOverview | null>(null);
  const [prev, setPrev] = useState<ApiOrdersOverview | null>(null);
  const [money, setMoney] = useState<ApiMoney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { settle, begin, at } = useLoadState();

  const load = useCallback(async (d: DayKey, r: RangeKey) => {
    begin("overview", "money");
    setError(null);
    const date = d === "today" ? bdDay(0) : bdDay(1);
    const [a, b, m] = await Promise.allSettled([
      ordersOverview(date, r),
      /*  the same window, one window earlier, so the deltas compare like with
          like. The endpoint only gives "the last N days", so the earlier one is
          asked for as 2N and the first half taken by subtraction below.  */
      ordersOverview(date, String(Number(r) * 2)),
      deliveryMoney(Number(r)),
    ]);
    if (a.status === "fulfilled") setO(a.value);
    else { setO(null); setError(a.reason instanceof Error ? a.reason.message : "The order list did not answer."); }
    setPrev(b.status === "fulfilled" ? b.value : null);
    setMoney(m.status === "fulfilled" ? m.value : null);
    settle({ overview: a, money: m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(day, range); }, [day, range, load]);

  const state = at("overview");
  const days = Number(range);

  /*  the double window minus the single one IS the window before it  */
  /*  `undefined` means the earlier period was not read, so no badge is drawn  */
  const prevOrders = o && prev ? prev.daily.reduce((t, x) => t + x.n, 0) - o.daily.reduce((t, x) => t + x.n, 0) : undefined;
  const prevRevenue = o && prev ? prev.money.revenueMonth - o.money.revenueMonth : undefined;
  const ordersNow = o ? o.daily.reduce((t, x) => t + x.n, 0) : null;

  const pts: Point[] = (o?.daily ?? []).map((x) => ({ date: x.day, value: x.n }));

  const jobs: NowJob[] = o ? [
    { key: "toConfirm", label: "To confirm", count: o.counts.toConfirm, href: "/orders/list?seg=placed", tone: "warn" },
    { key: "preparing", label: "Being prepared", count: o.counts.preparing, href: "/orders/list?seg=fulfilling", tone: "info" },
    { key: "photo", label: "Photo missing", count: o.counts.photoPending, href: "/delivery", tone: "warn" },
    { key: "notAssigned", label: "No rider yet", count: o.counts.notAssigned, href: "/delivery", tone: "danger" },
    { key: "onRoad", label: "On the road", count: o.counts.onRoad, href: "/delivery/tracking", tone: "info" },
    { key: "late", label: "Late", count: o.counts.late, href: "/delivery", tone: "danger" },
    { key: "failed", label: "Failed", count: o.counts.failed, href: "/delivery/failed", tone: "danger" },
  ] : [];

  const mix = o?.mix;
  const zoneMax = Math.max(1, ...(o?.zones ?? []).map((z) => z.paisa));
  const prodMax = Math.max(1, ...(o?.topProducts ?? []).map((p) => p.paisa));

  return (
    <div className={WRAP}>
      <Header
        eyebrow="Orders"
        title="Orders overview"
        desc="What is on the floor today, and how the last few days have run."
      />

      {/* two periods, named as two things */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <SubHead>The board</SubHead>
            <Seg<DayKey> label="Which day" value={day} onPick={setDay}
              options={[{ v: "today", label: "Today" }, { v: "yesterday", label: "Yesterday" }]} />
          </div>
          <div className="flex items-center gap-2">
            <SubHead>The figures</SubHead>
            <Seg<RangeKey> label="How far back" value={range} onPick={setRange}
              options={[{ v: "7", label: "7 days" }, { v: "30", label: "30 days" }, { v: "90", label: "90 days" }]} />
          </div>
        </div>
        <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
          Board: {o ? dayLabel(o.date) : "—"} · Figures: last {days} days to today
        </div>
      </div>

      {error ? <div className="mb-4"><ErrorBox error={error} onRetry={() => void load(day, range)} /></div> : null}

      <NowBand
        title={o?.isToday ? "Today, live" : "That day"}
        figures={[
          { label: "Orders that day", value: o ? count(o.slots.reduce((t, s) => t + s.total, 0)) : "—", quiet: !o },
          { label: "Going out", value: o ? count(o.counts.goingOutToday) : "—", quiet: !o },
          { label: "Delivered", value: o ? count(o.counts.deliveredToday) : "—", quiet: !o },
          { label: "Cash with riders", value: money ? formatTaka(money.totals.withCarrier) : "—", quiet: !money },
        ]}
        jobs={jobs}
        loading={state === "loading"}
        failed={state === "error"}
        note="Counter bills are not on this screen - the Business dashboard adds both shops together."
      />

      <KpiRow>
        <Kpi icon={<Icon name="bag" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Orders" value={ordersNow === null ? "—" : count(ordersNow)}
          scope={<Scope text="website only" />}
          delta={<Delta now={ordersNow} before={prevOrders} />} />

        <Kpi icon={<Icon name="cash" size={18} />} iconBg="var(--s-accent)" iconColor="var(--t-accent)"
          label="Money taken" value={o ? formatTaka(o.money.revenueMonth) : "—"}
          scope={<Scope text="delivered only" />}
          delta={<Delta now={o ? o.money.revenueMonth : null} before={prevRevenue} />}>
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {o ? `${count(o.money.deliveredMonth)} delivered · ${formatTaka(o.money.aov)} an order` : ""}
          </div>
        </Kpi>

        <Kpi icon={<Icon name="clock" size={18} />} iconBg="var(--s-warn)" iconColor="var(--t-warn)"
          label="Unpaid" value={o ? formatTaka(o.money.dueFromCustomer) : "—"}
          scope={<Scope text="now" tone="now" />}
          delta={o ? <span className="ml-auto text-[10.5px] font-bold px-2 py-[3px] rounded-full whitespace-nowrap"
            style={{ background: "var(--s-sunken)", color: "var(--t-faint)" }}>{o.money.dueOrders} orders</span> : null} />

        <Kpi icon={<Icon name="returnArrow" size={18} />}
          iconBg={o && o.counts.cancelled > 0 ? "var(--s-bad)" : "var(--s-sunken)"}
          iconColor={o && o.counts.cancelled > 0 ? "var(--t-bad)" : "var(--t-faint)"}
          label="Cancelled" value={o ? count(o.counts.cancelled) : "—"}
          scope={<Scope text={`last ${days} days`} />}>
          <div className="text-[11.5px] mt-3.5" style={{ color: "var(--t-faint)" }}>
            {o ? `${formatTaka(o.money.refundedMonth)} refunded on ${count(o.money.refundedOrders)} orders` : ""}
          </div>
        </Kpi>
      </KpiRow>

      {/* the board, and the day's stages */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-[18px] mb-[18px]">
        <Card title={`Slots on ${o ? dayLabel(o.date) : "the day"}`} right={<Scope text="that day" />}>
          {(o?.slots ?? []).length > 0 ? (
            <Table head={[{ label: "Slot" }, { label: "Orders", right: true }, { label: "To confirm", right: true },
              { label: "Preparing", right: true }, { label: "Ready", right: true }, { label: "Out", right: true },
              { label: "Late", right: true }, { label: "Delivered", right: true }, { label: "Failed", right: true }]} min={700}>
              {o!.slots.map((s) => (
                <tr key={s.label}>
                  <Td>
                    {s.label}
                    {s.time ? <span className="ml-2 text-[11px]" style={{ color: "var(--t-faint)" }}>{s.time}</span> : null}
                  </Td>
                  <Td right bold>{s.total}</Td>
                  <Td right color={s.toConfirm ? "var(--t-warn)" : "var(--t-faint)"}>{s.toConfirm}</Td>
                  <Td right color={s.preparing ? "var(--t-main)" : "var(--t-faint)"}>{s.preparing}</Td>
                  <Td right color={s.ready ? "var(--t-main)" : "var(--t-faint)"}>{s.ready}</Td>
                  <Td right color={s.out ? "var(--t-info)" : "var(--t-faint)"}>{s.out}</Td>
                  <Td right color={s.late ? "var(--t-bad)" : "var(--t-faint)"}>{s.late}</Td>
                  <Td right color={s.delivered ? "var(--t-ok)" : "var(--t-faint)"}>{s.delivered}</Td>
                  <Td right color={s.failed ? "var(--t-bad)" : "var(--t-faint)"}>{s.failed}</Td>
                </tr>
              ))}
            </Table>
          ) : <Empty state={state} empty="No order carries a slot on this day." error="Could not read the slot board." />}
        </Card>

        <Card title="Needs a person" right={<Scope text="now" tone="now" />}>
          <div className="mt-4">
            {(o?.watch ?? []).length > 0 ? o!.watch.slice(0, 8).map((w) => {
              const m = WATCH_LABEL[w.kind] ?? { text: w.kind, tone: "mute" as const };
              return (
                <Link key={w.id} href={`/orders/${w.id}`}
                  className="flex items-start gap-3 py-2.5 border-b last:border-b-0 transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--l-soft)" }}>
                  <Chip tone={m.tone}>{m.text}</Chip>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold truncate" style={{ color: "var(--t-main)" }}>
                      {w.orderNo} · {w.title}
                    </div>
                    <div className="text-[11.5px] truncate" style={{ color: "var(--t-faint)" }}>
                      {w.detail}{w.slot ? ` · ${w.slot}` : ""}
                    </div>
                  </div>
                </Link>
              );
            }) : <Empty state={state} empty="Nothing needs a person right now." error="Could not read the watch list." />}
          </div>
          {(o?.watch ?? []).length > 8 ? (
            <div className="text-[11.5px] mt-3" style={{ color: "var(--t-faint)" }}>
              {o!.watch.length - 8} more on the order list.
            </div>
          ) : null}
        </Card>
      </div>

      {/* the run */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-[18px] mb-[18px]">
        <Card title="Orders, day by day" right={<Scope text={`last ${days} days`} />}>
          {pts.length > 1
            ? <BarChart pts={pts} id="ord-ov" noun="Orders each day" unit="orders" />
            : <Empty state={state} empty="Not enough days to draw." error="Could not read the day-by-day figures." />}
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card title="How they paid" right={<Scope text={`last ${days} days`} />}>
            <div className="mt-4">
              {mix && mix.total > 0 ? (
                <>
                  <TrackRow label="Paid online" value={count(mix.online)} width={(mix.online / mix.total) * 100} color="var(--t-ok)" />
                  <TrackRow label="Cash on delivery" value={count(mix.cod)} width={(mix.cod / mix.total) * 100} color="var(--t-warn)" />
                  <Rule />
                  <TrackRow label="Sent as a gift" value={count(mix.gift)} width={(mix.gift / mix.total) * 100} color="var(--t-gold)" />
                  <TrackRow label="Bought for themselves" value={count(mix.self)} width={(mix.self / mix.total) * 100} color="var(--f-chart)" />
                </>
              ) : <Empty state={state} empty="No order in this period." error="Could not read the payment mix." />}
            </div>
          </Card>

          <Card title="Where they went" right={<Scope text={`last ${days} days`} />}>
            <div className="mt-4">
              {(o?.zones ?? []).length > 0 ? o!.zones.map((z) => (
                <TrackRow key={z.zone} label={z.zone === "DHAKA" ? "Inside Dhaka" : "Outside Dhaka"}
                  value={formatTaka(z.paisa)} width={(z.paisa / zoneMax) * 100} color="var(--f-chart)"
                  right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>{count(z.orders)} orders</span>} />
              )) : <Empty state={state} empty="No delivery in this period." error="Could not read the zones." />}
            </div>
          </Card>
        </div>
      </div>

      {/* who bought, what sold, what went wrong */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-[18px]">
        <Card title="Who bought" right={<Scope text={`last ${days} days`} />}>
          <div className="grid grid-cols-2 gap-4 mt-[18px]">
            <Stat label="First time" value={o ? count(o.customers.newCount) : "—"}
              sub={o ? `${count(o.customers.newOrders)} orders · ${formatTaka(o.customers.newPaisa)}` : undefined} />
            <Stat label="Came back" value={o ? count(o.customers.repeatCount) : "—"}
              sub={o ? `${count(o.customers.repeatOrders)} orders · ${formatTaka(o.customers.repeatPaisa)}` : undefined} />
          </div>
          {(o?.occasions ?? []).length > 0 ? (
            <>
              <Rule />
              <SubHead>Occasions coming up</SubHead>
              <div className="mt-3">
                {o!.occasions.slice(0, 5).map((oc, i) => (
                  <div key={`${oc.date}-${i}`} className="flex justify-between gap-3 text-[12.5px] py-1.5">
                    <span className="truncate" style={{ color: "var(--t-main)" }}>
                      {oc.recipient}
                      <span style={{ color: "var(--t-faint)" }}> · {oc.label ?? oc.type.toLowerCase()}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums" style={{ color: oc.inDays <= 3 ? "var(--t-warn)" : "var(--t-faint)" }}>
                      {oc.inDays === 0 ? "today" : `in ${oc.inDays} d`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </Card>

        <Card title="What sold" right={<Scope text={`last ${days} days`} />}>
          <div className="mt-4">
            {(o?.topProducts ?? []).length > 0 ? o!.topProducts.slice(0, 6).map((p) => (
              <TrackRow key={p.productId ?? p.name} label={p.name} value={formatTaka(p.paisa)}
                width={(p.paisa / prodMax) * 100} color="var(--f-chart)"
                right={<span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>{p.qty} units</span>} />
            )) : <Empty state={state} empty="Nothing sold in this period." error="Could not read what sold." />}
          </div>
        </Card>

        <Card title="What went wrong" right={<Scope text={`last ${days} days`} />}>
          <div className="grid grid-cols-2 gap-4 mt-[18px]">
            <Stat label="Lost orders" value={o ? count(o.lost.count) : "—"}
              tone={o && o.lost.open > 0 ? "bad" : undefined}
              sub={o ? `${formatTaka(o.lost.paisa)} · ${count(o.lost.open)} still open` : undefined} />
            <Stat label="Returns" value={o ? count(o.returns.length) : "—"}
              sub={o && o.returns.length > 0
                ? `${formatTaka(o.returns.reduce((t, r) => t + r.valuePaisa, 0))} of goods`
                : undefined} />
          </div>
          {(o?.returns ?? []).length > 0 ? (
            <>
              <Rule />
              <SubHead>Newest returns</SubHead>
              <div className="mt-3">
                {o!.returns.slice(0, 4).map((r) => (
                  <Link key={r.id} href={`/returns/${r.id}`} className="flex justify-between gap-3 text-[12.5px] py-1.5 transition-opacity hover:opacity-80">
                    <span className="truncate" style={{ color: "var(--t-main)" }}>
                      {r.returnNo}
                      <span style={{ color: "var(--t-faint)" }}> · {r.customer}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums" style={{ color: "var(--t-faint)" }}>{formatTaka(r.valuePaisa)}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </Card>
      </div>

      <SourceNote>
        Every count on this screen is counted in the database, and covers <b>website orders only</b> - counter bills
        live on the Business dashboard. The board shows one day; the figures look back {days} days to today. Money
        taken counts delivered orders, and figures marked <b>now</b> are true at this moment.
      </SourceNote>
    </div>
  );
}
