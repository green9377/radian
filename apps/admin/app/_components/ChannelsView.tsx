"use client";

import { useCallback, useEffect, useState } from "react";
import {
  WRAP, FinHeader, Card, Table, Th, Td, Chip, Empty, Flash, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl,
} from "./FinanceUI";
import {
  listChannelRows, createChannel, updateChannelRow, deleteChannel,
  type ApiChannelRow,
} from "../_data/api";

/*
  SALES CHANNELS — where an order came in through.

  Owned by Sales (DEC-SAL-001), not by Marketing. Marketing reads it to answer
  "how did this order reach us"; it never writes here.

  The API has existed since the Sales module. There was simply never a screen,
  which is why foodpanda and Sugary — where the shop already sells — had
  nowhere to be recorded. Every marketplace added from now on goes here first;
  otherwise those orders land under whatever channel a staff member guesses,
  and the sales split quietly stops meaning anything.

  A channel with orders behind it is switched OFF, never deleted — the same
  reasoning as an archived campaign. Deleting it would orphan history.
*/

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function ChannelsView() {
  const [rows, setRows] = useState<ApiChannelRow[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await listChannelRows()); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setErr(""); setOk("");
    try {
      const c = await createChannel({ name: name.trim(), slug: slug.trim() || slugify(name) });
      setOk(`${c.name} added`);
      setName(""); setSlug("");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const toggle = async (c: ApiChannelRow) => {
    try { await updateChannelRow(c.id, { isActive: !c.isActive }); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  const remove = async (c: ApiChannelRow) => {
    const used = c._count?.orders ?? 0;
    if (used > 0) {
      setErr(`${c.name} has ${used} order(s) behind it — switch it off instead, or that history loses its home`);
      return;
    }
    if (!confirm(`Remove ${c.name}?`)) return;
    try { await deleteChannel(c.id); setOk(`${c.name} removed`); await load(); }
    catch (e) { setErr((e as Error).message); }
  };

  const missing = ["foodpanda", "sugary"].filter(
    (m) => !rows.some((r) => r.slug.includes(m) || r.name.toLowerCase().includes(m)),
  );

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="Orders"
        title="Sales channels"
        sub="Every way an order can reach the shop — the website, Facebook, a phone call, the counter, a marketplace. Marketing reads this to answer where business comes from, so a missing channel is a hole in every report that follows."
        emoji="🔀"
        tone="sky"
      />
      <Flash ok={ok} err={err} />

      {missing.length > 0 && (
        <Banner tone="amber" emoji="⚠" title={`${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not in this list`}>
          The shop already sells there and staff enter those orders by hand — but with no channel
          for them, they are landing under whatever somebody picked. Add them below and the sales
          split starts telling the truth.
        </Banner>
      )}

      <Card className="p-5 mb-5">
        <div className="grid md:grid-cols-[1.4fr_1fr_auto] gap-4 items-end">
          <div>
            <Lbl>Channel name</Lbl>
            <input className={input} value={name} placeholder="foodpanda"
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Lbl>Short code <span className="font-normal">(blank = made from the name)</span></Lbl>
            <input className={input} value={slug} placeholder={slugify(name) || "foodpanda"}
              onChange={(e) => setSlug(e.target.value)} />
          </div>
          <button className={btnPrimary} style={btnPrimaryStyle} onClick={add}
            disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add channel"}
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <Empty emoji="🔀" title="No channels yet"
            sub="Add at least the website, phone and counter — every order has to come from somewhere." />
        ) : (
          <Table head={<><Th>Channel</Th><Th>Code</Th><Th right>Orders</Th><Th>State</Th><Th right></Th></>}>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td><span className="font-semibold text-purple">{c.name}</span></Td>
                <Td><code className="text-[12px] text-body-soft">{c.slug}</code></Td>
                <Td right>{c._count?.orders ?? 0}</Td>
                <Td>
                  {c.isActive
                    ? <Chip tone="emerald">on</Chip>
                    : <Chip tone="slate">off</Chip>}
                </Td>
                <Td right>
                  <div className="flex gap-1.5 justify-end">
                    <button className={btnGhost} onClick={() => void toggle(c)}>
                      {c.isActive ? "Switch off" : "Switch on"}
                    </button>
                    <button className={btnGhost} onClick={() => void remove(c)}>Remove</button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <p className="text-[12px] text-body-soft mt-3 max-w-[760px]">
        Switching a channel off hides it from the order form but keeps every past order it carries.
        A channel with orders behind it cannot be removed at all — deleting it would leave that
        history with nowhere to belong.
      </p>
    </div>
  );
}
