"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WRAP, FinHeader, Card, Kpi, Table, Th, Td, Chip, Empty, Flash, Tabs, Banner,
  btnPrimary, btnPrimaryStyle, btnGhost, input, Lbl, taka, toPaisa, todayStr,
} from "./FinanceUI";
import {
  listEmployees, employeeStats, createEmployee, updateEmployee,
  deleteEmployee, getEmployee, getEmployeeTimeline, getEmployeeLedger, getEmployeePayslips,
  getEmployeeMonth, listAppUsers, listEmployeeRoles, createEmployeeRole, updateEmployeeRole,
  deleteEmployeeRole, employeeTrash, restoreEmployee, listEmployeeDocuments, addEmployeeDocument,
  deleteEmployeeDocument, getEmployeeDocument,
  formatTaka, initials, ago,
  type ApiEmployee, type ApiEmployeeStats, type ApiAppUser, type PayType,
  type EmployeeStatus, type ActivityEvent, type ApiEmployeeLedgerRow,
  type ApiEmployeeRole, type ApiEmployeeDocument,
  uploadImage,
} from "../_data/api";

/*
  EMPLOYEE screens — RADIAN_HR_MODULE_ARCHITECTURE.md (28 Jul 2026).

  The list leads with "advance outstanding" on purpose: this module exists
  because nobody could say who owed what, so that figure belongs where it is
  seen every day, not three clicks in.

  HR-R10 — the personal block (NID, date of birth, address, next of kin) is
  stripped by the SERVER for anyone who is not the OWNER. The UI only explains
  why it is blank; it is not what enforces it.
*/

const PAY_LABEL: Record<PayType, string> = {
  MONTHLY: "per month",
  DAILY: "per day",
  HOURLY: "per hour",
};

export function rateLine(payType: PayType, ratePaisa: number) {
  return `${formatTaka(ratePaisa)} ${PAY_LABEL[payType]}`;
}

/* ------------------------------------------------------------ file helpers */

function readAsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Could not read that file"));
    r.readAsDataURL(f);
  });
}

/** browsers block navigating to a data: URL, so hand it over as a real download */
function downloadDataUrl(dataUrl: string, fileName: string) {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const prettySize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="rounded-xl object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <div
      className="rounded-xl grid place-items-center shrink-0 font-display text-purple bg-[#f7ecfa]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}

/*  The HR practice-data bar (load/remove five sample staff) was removed on the
    owner's order, 19 Aug 2026: no button anywhere may pour sample data into a
    live database. The /hr/demo endpoints still exist server-side; retire them
    in the HR phase.  */

/* ==================================================================== LIST */

export function EmployeeListView() {
  const [rows, setRows] = useState<ApiEmployee[]>([]);
  const [stats, setStats] = useState<ApiEmployeeStats | null>(null);
  const [roles, setRoles] = useState<ApiEmployeeRole[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<EmployeeStatus | "ALL">("ACTIVE");
  const [payType, setPayType] = useState<PayType | "">("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s, ro] = await Promise.all([
        listEmployees({ status, payType: payType || undefined, roleId: roleId || undefined }),
        employeeStats(),
        listEmployeeRoles().catch(() => []),
      ]);
      setRows(r.items); setStats(s); setRoles(ro); setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load staff");
    } finally { setLoading(false); }
  }, [status, payType, roleId]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (e) =>
        e.name.toLowerCase().includes(s) ||
        (e.phone ?? "").includes(s) ||
        e.employeeNo.toLowerCase().includes(s) ||
        (e.role?.name ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="People"
        title="Staff"
        emoji="👥"
        tone="brand"
        sub="Everyone Radian pays. Salary and advances can only go to somebody on this list — that is what stops one person becoming three spellings in the books."
        right={
          <>
            <Link href="/employees/roles" className={btnGhost}>Job roles</Link>
            <Link href="/employees/attendance" className={btnGhost}>Attendance</Link>
            <Link href="/employees/payroll" className={btnGhost}>Payroll</Link>
            <Link href="/employees/new" className={btnPrimary} style={btnPrimaryStyle}>+ New employee</Link>
          </>
        }
      />
      <Flash ok="" err={err} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kpi label="On the payroll" value={String(stats?.active ?? 0)} emoji="👤" tone="brand"
          hint={stats?.inactive ? `${stats.inactive} marked as left` : "everybody active"} />
        <Kpi label="Marked today" value={`${stats?.presentToday ?? 0} present`} emoji="✓" tone="emerald"
          hint={stats?.attendanceMarkedToday ? `${stats.attendanceMarkedToday} recorded` : "today not saved yet"} />
        <Kpi label="Monthly wage bill" value={taka(stats?.monthlyWageBillPaisa ?? 0)} emoji="৳" tone="sky"
          hint="agreed monthly rates — a plan, not the books" />
        <Kpi label="Advance outstanding" value={taka(stats?.advanceOutstandingPaisa ?? 0)} emoji="⚠" tone="amber"
          hint="money already handed over, not yet worked off" />
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <input className={`${input} flex-1 min-w-[220px]`} placeholder="Search name, phone, EMP number…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${input} w-auto`} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Any role</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select className={`${input} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus | "ALL")}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Left</option>
          <option value="ALL">Everyone</option>
        </select>
        <select className={`${input} w-auto`} value={payType} onChange={(e) => setPayType(e.target.value as PayType | "")}>
          <option value="">Any pay type</option>
          <option value="MONTHLY">Monthly</option>
          <option value="DAILY">Daily</option>
          <option value="HOURLY">Hourly</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        <Table head={<>
          <Th>Employee</Th><Th>Role</Th><Th>Pay</Th><Th>Joined</Th>
          <Th right>Advance owed</Th><Th right>Status</Th>
        </>}>
          {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-body-soft">Loading…</td></tr>}
          {!loading && shown.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10">
              <Empty emoji="👥" title="Nobody on the list yet"
                sub="Add your staff — or load the practice data above to see how the whole thing works first." />
            </td></tr>
          )}
          {shown.map((e) => (
            <tr key={e.id}>
              <Td>
                <Link href={`/employees/${e.id}`} className="flex items-center gap-3 no-underline">
                  <Avatar name={e.name} url={e.photoUrl} />
                  <span>
                    <b className="text-purple">{e.name}</b>
                    <span className="block text-[11.5px] text-body-soft">
                      {e.employeeNo}{e.phone ? ` · ${e.phone}` : ""}
                      {e._count?.documents ? ` · ${e._count.documents} doc${e._count.documents === 1 ? "" : "s"}` : ""}
                      {e.appUser ? <span className="text-orchid"> · signs in as {e.appUser.username}</span> : null}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td>{e.role?.name ?? <span className="text-body-soft">—</span>}</Td>
              <Td>
                <b>{formatTaka(e.ratePaisa)}</b>
                <span className="block text-[11.5px] text-body-soft">{PAY_LABEL[e.payType]}</span>
              </Td>
              <Td>{new Date(e.joinedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
              <Td right>
                {e.advanceOutstandingPaisa > 0
                  ? <b style={{ color: "#b45309" }}>{taka(e.advanceOutstandingPaisa)}</b>
                  : <span className="text-body-soft">—</span>}
              </Td>
              <Td right>
                {e.status === "ACTIVE" ? <Chip tone="emerald">Active</Chip> : <Chip tone="slate">Left</Chip>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* ================================================================== EDITOR */

/** HR-D14 — one queued document while hiring; `key` only exists to keep React happy */
type DocRow = { key: string; title: string; file: File | null };
let docRowSeq = 0;
const emptyDocRow = (): DocRow => ({ key: `doc-${(docRowSeq += 1)}`, title: "", file: null });

const emptyForm = {
  name: "", phone: "", altPhone: "", nid: "", dateOfBirth: "", address: "",
  emergencyName: "", emergencyPhone: "", roleId: "", joinedOn: todayStr(),
  leftOn: "", status: "ACTIVE" as EmployeeStatus, payType: "MONTHLY" as PayType,
  rate: "", dutyHours: "8", shiftStart: "", shiftEnd: "",
  appUserId: "", note: "", photoUrl: "",
};
type Form = typeof emptyForm;

export function EmployeeEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [f, setF] = useState<Form>(emptyForm);
  const [roles, setRoles] = useState<ApiEmployeeRole[]>([]);
  const [users, setUsers] = useState<ApiAppUser[]>([]);
  const [privateHidden, setPrivateHidden] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");
  /** the photo upload is the one field here that is not typed */
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  /*  HR-D11/D14 — on a NEW employee there is no id yet, so documents cannot be
      posted until the person exists. Rather than making the owner save, find
      the record again and then attach, the rows are held here and uploaded the
      moment the create succeeds. */
  const [docRows, setDocRows] = useState<DocRow[]>([emptyDocRow()]);
  const setDocRow = (key: string, patch: Partial<DocRow>) =>
    setDocRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const readyDocs = docRows.filter((r) => r.file).length;

  useEffect(() => {
    void (async () => {
      try {
        const [r, u] = await Promise.all([listEmployeeRoles(), listAppUsers().catch(() => [])]);
        setRoles(r); setUsers(u as ApiAppUser[]);
      } catch { /* the pickers are a nicety, not a requirement */ }
      if (!id) return;
      try {
        const e = await getEmployee(id);
        setPrivateHidden(!!e.privateHidden);
        setF({
          name: e.name, phone: e.phone ?? "", altPhone: e.altPhone ?? "", nid: e.nid ?? "",
          dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : "",
          address: e.address ?? "", emergencyName: e.emergencyName ?? "",
          emergencyPhone: e.emergencyPhone ?? "", roleId: e.roleId ?? "",
          joinedOn: e.joinedOn.slice(0, 10), leftOn: e.leftOn ? e.leftOn.slice(0, 10) : "",
          status: e.status, payType: e.payType, rate: (e.ratePaisa / 100).toString(),
          dutyHours: String(e.dutyHoursPerDay ?? 8),
          shiftStart: e.shiftStart ?? "", shiftEnd: e.shiftEnd ?? "",
          appUserId: e.appUserId ?? "", note: e.note ?? "", photoUrl: e.photoUrl ?? "",
        });
      } catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
    })();
  }, [id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  /*
    WAS: FileReader → a base64 data URL straight into `photoUrl`, with a 1.5 MB
    limit bolted on because anything larger would not survive the request.

    That limit was the symptom. Base64 makes a file a third bigger and it
    travelled inside the JSON body, so a normal phone photograph — 3 to 5 MB —
    was rejected, and the owner had to go and shrink it himself before he could
    add a member of staff.

    Same fix as the Tags screen: the file goes to ImageKit and what is stored is
    a URL. The 10 MB limit is the server's, and it is enforced there.
  */
  async function pickPhoto(file?: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    setErr("");
    try {
      const { url } = await uploadImage(file, "people");
      set("photoUrl", url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not upload that picture");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setBusy(true); setErr("");
    const body: Record<string, unknown> = {
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      altPhone: f.altPhone.trim() || null,
      roleId: f.roleId || null,
      joinedOn: f.joinedOn,
      leftOn: f.leftOn || null,
      status: f.status,
      payType: f.payType,
      ratePaisa: toPaisa(f.rate),
      dutyHoursPerDay: Math.min(24, Math.max(0.5, Number(f.dutyHours) || 8)),
      shiftStart: f.shiftStart || null,
      shiftEnd: f.shiftEnd || null,
      appUserId: f.appUserId || null,
      note: f.note.trim() || null,
      photoUrl: f.photoUrl || null,
    };
    // HR-R10 — never send back the masked blanks, or a MANAGER's save would
    // wipe the owner's private fields
    if (!privateHidden) {
      body.nid = f.nid.trim() || null;
      body.dateOfBirth = f.dateOfBirth || null;
      body.address = f.address.trim() || null;
      body.emergencyName = f.emergencyName.trim() || null;
      body.emergencyPhone = f.emergencyPhone.trim() || null;
    }
    try {
      const saved = id ? await updateEmployee(id, body) : await createEmployee(body);
      for (const row of docRows) {
        if (!row.file) continue;
        const title = row.title.trim() || row.file.name.replace(/\.[^.]+$/, "");
        try {
          await addEmployeeDocument(saved.id, {
            title,
            fileName: row.file.name,
            mimeType: row.file.type,
            sizeBytes: row.file.size,
            dataUrl: await readAsDataUrl(row.file),
          });
        } catch {
          // the person is saved; a rejected attachment must not lose that
          setErr(`Saved, but "${title}" could not be attached — try again from the Documents tab`);
        }
      }
      setOk("Saved");
      router.push(`/employees/${saved.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally { setBusy(false); }
  }

  /** HR-D13 — how long the shift is, midnight crossing included */
  const shiftHours = useMemo(() => {
    const hm = (v: string) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    const a = hm(f.shiftStart), b = hm(f.shiftEnd);
    if (a === null || b === null) return null;
    const d = b - a;
    return +(((d > 0 ? d : d + 1440) / 60).toFixed(2));
  }, [f.shiftStart, f.shiftEnd]);

  /* a switched-off login is no use to anyone — show it, but not as a choice.
     "already linked to somebody else" is caught by the server (HR-D01). */
  const disabledLogins = useMemo(() => new Set(users.filter((u) => !u.isActive).map((u) => u.id)), [users]);

  return (
    <div className={WRAP}>
      <FinHeader eyebrow="People" title={id ? "Edit employee" : "New employee"} emoji="👤" tone="brand"
        sub="Name, when they started and how they are paid is all that is needed. Everything else can wait." />
      <Flash ok={ok} err={err} />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="px-5 py-5 lg:col-span-2">
          <h3 className="font-display text-[17px] text-purple mt-0 mb-4">Who they are</h3>

          <div className="flex items-start gap-4 mb-4">
            <Avatar name={f.name || "?"} url={f.photoUrl} size={84} />
            <div>
              <Lbl>Photo</Lbl>
              <input ref={photoInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])} />
              <div className="flex gap-2">
                <button type="button" className={btnGhost} onClick={() => photoInput.current?.click()}>
                  {photoBusy ? "Uploading…" : f.photoUrl ? "Change picture" : "Choose a picture"}
                </button>
                {f.photoUrl && (
                  <button type="button" className={btnGhost} onClick={() => set("photoUrl", "")}>Remove</button>
                )}
              </div>
              <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                A phone photo is fine. Under 1.5 MB.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Lbl>Full name *</Lbl>
              <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Rakib Hasan" />
            </div>
            <div>
              <Lbl>Phone</Lbl>
              <input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01711-888123" />
            </div>
            <div>
              <Lbl>Second phone</Lbl>
              <input className={input} value={f.altPhone} onChange={(e) => set("altPhone", e.target.value)} />
            </div>
            <div>
              <Lbl>Role</Lbl>
              <select className={input} value={f.roleId} onChange={(e) => set("roleId", e.target.value)}>
                <option value="">No role yet</option>
                {roles.filter((r) => r.isActive || r.id === f.roleId).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-[11.5px] text-body-soft mt-1 mb-0">
                Missing one? <Link href="/employees/roles" className="text-orchid">Add it under Job roles</Link>.
              </p>
            </div>
            <div>
              <Lbl>Joined on *</Lbl>
              <input type="date" className={input} value={f.joinedOn} onChange={(e) => set("joinedOn", e.target.value)} />
            </div>
          </div>

          <h3 className="font-display text-[17px] text-purple mt-6 mb-1">Personal</h3>
          {privateHidden ? (
            <p className="text-[12.5px] text-body-soft mt-0 mb-3">
              NID, date of birth, address and next of kin are kept for the owner only, so they are
              hidden here. Saving this form leaves them exactly as they are.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <Lbl>NID number</Lbl>
                <input className={input} value={f.nid} onChange={(e) => set("nid", e.target.value)} />
              </div>
              <div>
                <Lbl>Date of birth</Lbl>
                <input type="date" className={input} value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Lbl>Address</Lbl>
                <input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div>
                <Lbl>In an emergency, call</Lbl>
                <input className={input} value={f.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} placeholder="Name" />
              </div>
              <div>
                <Lbl>…on this number</Lbl>
                <input className={input} value={f.emergencyPhone} onChange={(e) => set("emergencyPhone", e.target.value)} />
              </div>
            </div>
          )}
          <h3 className="font-display text-[17px] text-purple mt-6 mb-1">Documents</h3>
          {id ? (
            <p className="text-[12.5px] text-body-soft mt-0 mb-0">
              NID copy, birth certificate, the job contract, educational certificates, the
              guardian&apos;s NID — as many as you like, on the{" "}
              <Link href={`/employees/${id}`} className="text-orchid">Documents tab</Link> of their page.
            </p>
          ) : (
            <>
              <p className="text-[12px] text-body-soft mt-0 mb-3">
                NID copy, birth certificate, job contract, certificates, guardian&apos;s NID — add a
                row for each one. They are attached the moment this person is saved, and more can be
                added later at any time.
              </p>

              <datalist id="doc-titles-new">{DOC_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>

              {/*  HR-D14 — one row per document, with a visible "+". The first
                  build queued a file the instant it was picked, which worked but
                  read as a single-file form: with nothing to press, nobody could
                  tell a second document was even possible. */}
              {docRows.map((row, i) => (
                <div key={row.key} className="grid sm:grid-cols-[1fr_1.3fr_auto] gap-3 items-end mb-3">
                  <div>
                    {i === 0 && <Lbl>What is it</Lbl>}
                    <input className={input} list="doc-titles-new" placeholder="NID copy"
                      value={row.title}
                      onChange={(e) => setDocRow(row.key, { title: e.target.value })} />
                  </div>
                  <div>
                    {i === 0 && <Lbl>File</Lbl>}
                    <input type="file" className={input} accept="image/*,application/pdf"
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] ?? null;
                        if (file && file.size > 3_000_000) {
                          setErr("That file is over 3 MB — a photo of the page is usually plenty");
                          ev.target.value = "";
                          return;
                        }
                        setErr("");
                        setDocRow(row.key, {
                          file,
                          ...(file && !row.title.trim()
                            ? { title: file.name.replace(/\.[^.]+$/, "") }
                            : {}),
                        });
                      }} />
                    {row.file && (
                      <span className="block text-[11px] text-body-soft mt-1">{prettySize(row.file.size)}</span>
                    )}
                  </div>
                  <button type="button" className={btnGhost} disabled={docRows.length === 1 && !row.file && !row.title}
                    onClick={() => setDocRows((p) => (p.length === 1 ? [emptyDocRow()] : p.filter((r) => r.key !== row.key)))}>
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className={btnGhost}
                  onClick={() => setDocRows((p) => [...p, emptyDocRow()])}>
                  + Add another document
                </button>
                {readyDocs > 0 && (
                  <span className="text-[12px] text-body-soft">
                    {readyDocs} file{readyDocs === 1 ? "" : "s"} will be attached when you press Add employee.
                  </span>
                )}
              </div>
            </>
          )}

          <h3 className="font-display text-[17px] text-purple mt-6 mb-3">Notes</h3>
          <textarea className={`${input} min-h-[80px]`} value={f.note} onChange={(e) => set("note", e.target.value)} />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="px-5 py-5">
            <h3 className="font-display text-[17px] text-purple mt-0 mb-1">How they are paid</h3>
            <p className="text-[12px] text-body-soft mt-0 mb-3">
              Monthly is a fixed figure whatever the days. Daily and hourly are multiplied by what
              the attendance sheet recorded.
            </p>
            <Lbl>Pay type</Lbl>
            <select className={input} value={f.payType} onChange={(e) => set("payType", e.target.value as PayType)}>
              <option value="MONTHLY">Monthly — a fixed salary</option>
              <option value="DAILY">Daily — per day worked</option>
              <option value="HOURLY">Hourly — per hour worked</option>
            </select>
            <div className="mt-3">
              <Lbl>Rate (৳ {PAY_LABEL[f.payType]})</Lbl>
              <input className={input} value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="15000" />
            </div>
            <div className="text-[12.5px] text-body-soft mt-2">
              = <b className="text-purple">{formatTaka(toPaisa(f.rate))}</b> {PAY_LABEL[f.payType]}
            </div>

            <div className="mt-4 pt-4 border-t border-[#f3eef7]">
              <Lbl>Usual shift</Lbl>
              <div className="flex items-center gap-2">
                <input type="time" className={`${input} px-2`} value={f.shiftStart}
                  onChange={(e) => set("shiftStart", e.target.value)} />
                <span className="text-body-soft text-[13px]">→</span>
                <input type="time" className={`${input} px-2`} value={f.shiftEnd}
                  onChange={(e) => set("shiftEnd", e.target.value)} />
              </div>
              {shiftHours !== null && (
                <button type="button" className="text-[11.5px] text-orchid underline mt-2"
                  onClick={() => set("dutyHours", String(shiftHours))}>
                  that is {shiftHours} hours — use it as the full day
                </button>
              )}
              <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                Optional. When it is set the attendance sheet arrives with these times already in,
                so an ordinary day needs no typing at all. Leaving at an earlier clock time than
                coming in simply means the shift runs past midnight.
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-[#f3eef7]">
              <Lbl>A full day for this person is…</Lbl>
              <div className="flex items-center gap-2">
                <input className={`${input} w-[90px]`} value={f.dutyHours} inputMode="decimal"
                  onChange={(e) => set("dutyHours", e.target.value)} />
                <span className="text-[13px] text-body-soft">hours</span>
              </div>
              <p className="text-[11.5px] text-body-soft mt-2 mb-0">
                This is what makes &quot;half day&quot; mean something. With{" "}
                <b>{Number(f.dutyHours) || 8}</b> hours, a half day is{" "}
                <b>{((Number(f.dutyHours) || 8) / 2).toFixed(1)}</b> hours
                {f.payType === "HOURLY"
                  ? " — and that is exactly what gets paid."
                  : " — recorded, so a long day leaves a trace even though the pay does not change."}
              </p>
            </div>
          </Card>

          <Card className="px-5 py-5">
            <h3 className="font-display text-[17px] text-purple mt-0 mb-1">Admin panel access</h3>
            <p className="text-[12px] text-body-soft mt-0 mb-3">
              Optional, and separate on purpose — most staff are paid without ever signing in.
              Create the login under People &amp; access first, then link it here.
            </p>
            <select className={input} value={f.appUserId} onChange={(e) => set("appUserId", e.target.value)}>
              <option value="">No login</option>
              {users.map((u) => (
                <option key={u.id} value={u.id} disabled={disabledLogins.has(u.id)}>
                  {u.name} ({u.username}) · {u.role}
                </option>
              ))}
            </select>
          </Card>

          {id && (
            <Card className="px-5 py-5">
              <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Employment</h3>
              <Lbl>Status</Lbl>
              <select className={input} value={f.status} onChange={(e) => set("status", e.target.value as EmployeeStatus)}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Has left</option>
              </select>
              {f.status === "INACTIVE" && (
                <div className="mt-3">
                  <Lbl>Last day</Lbl>
                  <input type="date" className={input} value={f.leftOn} onChange={(e) => set("leftOn", e.target.value)} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-5">
        <Link href={id ? `/employees/${id}` : "/employees"} className={btnGhost}>Cancel</Link>
        <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy || !f.name.trim()} onClick={save}>
          {busy ? "Saving…" : id ? "Save changes" : "Add employee"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================== DETAIL */

type DetailTab = "overview" | "documents" | "attendance" | "payslips" | "money" | "history";

export function EmployeeDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [e, setE] = useState<ApiEmployee | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [timeline, setTimeline] = useState<ActivityEvent[]>([]);
  const [ledger, setLedger] = useState<ApiEmployeeLedgerRow[]>([]);
  const [payslips, setPayslips] = useState<Awaited<ReturnType<typeof getEmployeePayslips>>>([]);
  const [docs, setDocs] = useState<ApiEmployeeDocument[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthData, setMonthData] = useState<Awaited<ReturnType<typeof getEmployeeMonth>> | null>(null);
  const [err, setErr] = useState(""); const [ok, setOk] = useState("");

  const loadDocs = useCallback(() => {
    void listEmployeeDocuments(id).then(setDocs).catch(() => setDocs([]));
  }, [id]);

  useEffect(() => {
    void (async () => {
      try {
        const [emp, tl, led, ps] = await Promise.all([
          getEmployee(id), getEmployeeTimeline(id), getEmployeeLedger(id), getEmployeePayslips(id),
        ]);
        setE(emp); setTimeline(tl); setLedger(led); setPayslips(ps);
      } catch (x) { setErr(x instanceof Error ? x.message : "Could not load"); }
    })();
    loadDocs();
  }, [id, loadDocs]);

  useEffect(() => {
    if (tab !== "attendance") return;
    void getEmployeeMonth(id, month).then(setMonthData).catch(() => setMonthData(null));
  }, [tab, id, month]);

  if (err && !e) return <div className={WRAP}><Flash ok="" err={err} /></div>;
  if (!e) return <div className={WRAP}><p className="text-body-soft">Loading…</p></div>;

  const salaryPaid = ledger.filter((l) => l.kind === "SALARY").reduce((n, l) => n + l.debitPaisa - l.creditPaisa, 0);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow={e.employeeNo}
        title={e.name}
        emoji="👤"
        tone={e.status === "ACTIVE" ? "brand" : "slate"}
        sub={`${e.role?.name ?? "Staff"} · ${rateLine(e.payType, e.ratePaisa)} · joined ${new Date(e.joinedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        right={
          <>
            <Link href="/employees" className={btnGhost}>← All staff</Link>
            <Link href={`/employees/${id}/edit`} className={btnGhost}>Edit</Link>
            <Link href="/finance/staff" className={btnPrimary} style={btnPrimaryStyle}>Give an advance</Link>
          </>
        }
      />
      <Flash ok={ok} err={err} />

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Kpi label="Salary paid so far" value={taka(salaryPaid)} emoji="৳" tone="sky" hint="straight from the books" />
        <Kpi label="Advance outstanding" value={taka(e.advanceOutstandingPaisa)}
          emoji="⚠" tone={e.advanceOutstandingPaisa > 0 ? "amber" : "emerald"}
          hint={e.advanceOutstandingPaisa > 0 ? "comes off the next payslip" : "nothing owed"} />
        <Kpi label="Payslips" value={String(payslips.length)} emoji="🧾" tone="slate"
          hint={payslips[0]?.payroll.period ? `latest ${payslips[0].payroll.period}` : "none yet"} />
      </div>

      <Tabs<DetailTab> value={tab} onChange={setTab} items={[
        { key: "overview", label: "Overview", emoji: "▤" },
        { key: "documents", label: "Documents", count: docs.length, emoji: "📎" },
        { key: "attendance", label: "Attendance", emoji: "✓" },
        { key: "payslips", label: "Payslips", count: payslips.length, emoji: "🧾" },
        { key: "money", label: "Money history", count: ledger.length, emoji: "৳" },
        { key: "history", label: "Activity", count: timeline.length, emoji: "⟳" },
      ]} />

      {tab === "overview" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="px-5 py-5">
            <div className="flex items-center gap-4 mb-4">
              <Avatar name={e.name} url={e.photoUrl} size={64} />
              <div>
                <b className="text-purple text-[15px]">{e.name}</b>
                <span className="block text-[12px] text-body-soft">{e.role?.name ?? "No role set"}</span>
              </div>
            </div>
            <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Personal</h3>
            {e.privateHidden && (
              <p className="text-[12.5px] text-body-soft mt-0 mb-3">
                NID, date of birth, address and next of kin are visible to the owner only.
              </p>
            )}
            <Rows rows={[
              ["Phone", e.phone],
              ["Second phone", e.altPhone],
              ["NID", e.nid],
              ["Date of birth", e.dateOfBirth ? new Date(e.dateOfBirth).toLocaleDateString("en-GB") : null],
              ["Address", e.address],
              ["Emergency contact", e.emergencyName ? `${e.emergencyName}${e.emergencyPhone ? ` · ${e.emergencyPhone}` : ""}` : null],
            ]} />
          </Card>
          <Card className="px-5 py-5">
            <h3 className="font-display text-[17px] text-purple mt-0 mb-3">Employment</h3>
            <Rows rows={[
              ["Employee no.", e.employeeNo],
              ["Role", e.role?.name],
              ["Joined", new Date(e.joinedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })],
              ["Last day", e.leftOn ? new Date(e.leftOn).toLocaleDateString("en-GB") : null],
              ["Pay", rateLine(e.payType, e.ratePaisa)],
              ["Status", e.status === "ACTIVE" ? "Active" : "Has left"],
              ["Admin login", e.appUser ? `${e.appUser.username} · ${e.appUser.role}` : "None — is paid, does not sign in"],
            ]} />
            {e.note && <p className="text-[12.5px] text-body-soft mt-4 mb-0 whitespace-pre-wrap">{e.note}</p>}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <DocumentsTab
          employeeId={id}
          docs={docs}
          onChanged={loadDocs}
          onOk={(m) => { setOk(m); window.setTimeout(() => setOk(""), 3000); }}
          onErr={setErr}
        />
      )}

      {tab === "attendance" && (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap border-b border-[#f3eef7]">
            <div>
              <b className="text-purple">{month}</b>
              {monthData && (
                <span className="text-[12.5px] text-body-soft ml-3">
                  {monthData.totals.days} paid day{monthData.totals.days === 1 ? "" : "s"}
                  {e.payType === "HOURLY" ? ` · ${(monthData.totals.minutes / 60).toFixed(1)} hours` : ""}
                  {monthData.totals.absent ? ` · ${monthData.totals.absent} absent` : ""}
                </span>
              )}
            </div>
            <input type="month" className={`${input} w-auto`} value={month} onChange={(ev) => setMonth(ev.target.value)} />
          </div>
          <Table head={<><Th>Date</Th><Th>Status</Th><Th right>Hours</Th><Th>Note</Th></>}>
            {(!monthData || monthData.rows.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body-soft">Nothing recorded for this month</td></tr>
            )}
            {monthData?.rows.map((r) => (
              <tr key={r.onDate}>
                <Td>{new Date(r.onDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</Td>
                <Td><StatusChip status={r.status} isPaidLeave={r.isPaidLeave} /></Td>
                <Td right>{r.minutes ? (r.minutes / 60).toFixed(1) : <span className="text-body-soft">—</span>}</Td>
                <Td className="text-body-soft">{r.note ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "payslips" && (
        <Card className="overflow-hidden">
          <Table head={<>
            <Th>Period</Th><Th>Run</Th><Th right>Days / hours</Th><Th right>Base</Th>
            <Th right>Extra</Th><Th right>Advance</Th><Th right>Net paid</Th>
          </>}>
            {payslips.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-body-soft">No payslips yet</td></tr>
            )}
            {payslips.map((p) => (
              <tr key={p.id}>
                <Td><b className="text-purple">{p.payroll.period}</b></Td>
                <Td>{p.payroll.payrollNo} <Chip tone={p.payroll.status === "APPROVED" ? "emerald" : "amber"}>{p.payroll.status}</Chip></Td>
                <Td right>{p.payType === "HOURLY" ? `${(p.minutesWorked / 60).toFixed(1)} h` : `${p.daysWorked} d`}</Td>
                <Td right>{taka(p.basePaisa)}</Td>
                <Td right>{p.extraPaisa ? taka(p.extraPaisa) : "—"}</Td>
                <Td right>{p.advanceRecoveredPaisa ? `−${taka(p.advanceRecoveredPaisa)}` : "—"}</Td>
                <Td right><b>{taka(p.netPaisa)}</b></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "money" && (
        <Card className="overflow-hidden">
          <Table head={<><Th>Date</Th><Th>Entry</Th><Th>What</Th><Th right>Amount</Th></>}>
            {ledger.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body-soft">
                Nothing in the books against this person yet
              </td></tr>
            )}
            {ledger.map((l) => (
              <tr key={l.id}>
                <Td>{new Date(l.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
                <Td className="text-body-soft">{l.entryNo}</Td>
                <Td>
                  {l.kind === "ADVANCE_GIVEN" ? <Chip tone="amber">Advance given</Chip>
                    : l.kind === "ADVANCE_RECOVERED" ? <Chip tone="emerald">Advance recovered</Chip>
                    : l.kind === "SALARY" ? <Chip tone="sky">Salary</Chip>
                    : <Chip tone="slate">{l.accountName}</Chip>}
                  <span className="block text-[11.5px] text-body-soft mt-1">{l.narration}</span>
                </Td>
                <Td right><b>{taka(l.debitPaisa || l.creditPaisa)}</b></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {tab === "history" && (
        <Card className="px-5 py-5">
          {timeline.length === 0 && <p className="text-body-soft m-0">Nothing recorded yet</p>}
          {timeline.map((t) => (
            <div key={t.id} className="flex gap-3 py-2.5 border-b border-[#f5f1f8] last:border-0">
              <div className="text-[12px] text-body-soft w-[120px] shrink-0">{ago(t.createdAt)}</div>
              <div>
                <b className="text-[13px]">{t.label}</b>
                {t.note && <span className="block text-[12px] text-body-soft">{t.note}</span>}
                <span className="block text-[11.5px] text-body-soft">— {t.actorName}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      {e.status === "ACTIVE" && (
        <div className="mt-6 text-right">
          <button
            className="text-[12.5px] text-body-soft underline"
            onClick={async () => {
              if (!confirm(`Remove ${e.name} from the staff list? Their history stays in the books.`)) return;
              try { await deleteEmployee(id); router.push("/employees"); }
              catch (x) { setErr(x instanceof Error ? x.message : "Could not remove"); }
            }}
          >
            Remove from the list
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- documents tab */

const DOC_SUGGESTIONS = [
  "NID copy",
  "Birth certificate",
  "Job contract / commitment letter",
  "Educational certificate",
  "Guardian's NID",
  "Passport photo",
  "Bank / bKash details",
  "Reference letter",
  "Police verification",
];

function DocumentsTab({
  employeeId, docs, onChanged, onOk, onErr,
}: {
  employeeId: string;
  docs: ApiEmployeeDocument[];
  onChanged: () => void;
  onOk: (m: string) => void;
  onErr: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /*  HR-D14 — several files at once. Picking three certificates one at a time,
      typing a title for each, was the slow path nobody would take twice. With
      more than one file the title becomes a prefix and each keeps its own name. */
  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    let failed = 0;
    try {
      for (const file of files) {
        const base = file.name.replace(/\.[^.]+$/, "");
        const name =
          files.length === 1 ? (title.trim() || base) : title.trim() ? `${title.trim()} — ${base}` : base;
        try {
          await addEmployeeDocument(employeeId, {
            title: name,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            dataUrl: await readAsDataUrl(file),
          });
        } catch (e) {
          failed += 1;
          onErr(e instanceof Error ? e.message : `Could not attach ${file.name}`);
        }
      }
      setTitle(""); setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      onChanged();
      if (failed === 0) onOk(files.length === 1 ? "Document attached" : `${files.length} documents attached`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Card className="px-5 py-5 mb-4">
        <h3 className="font-display text-[17px] text-purple mt-0 mb-1">Attach a document</h3>
        <p className="text-[12px] text-body-soft mt-0 mb-4">
          NID copy, a signed contract, certificates — as many as you like. A photo of the page is
          usually enough; keep each file under about 2.5 MB.
        </p>
        <div className="grid sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
          <div>
            <Lbl>What is it</Lbl>
            <input className={input} list="doc-titles" value={title} placeholder="NID copy"
              onChange={(e) => setTitle(e.target.value)} />
            <datalist id="doc-titles">{DOC_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <Lbl>File — pick as many as you like</Lbl>
            <input ref={fileInput} type="file" multiple className={input}
              accept="image/*,application/pdf"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const tooBig = picked.filter((f) => f.size > 3_000_000);
                if (tooBig.length) {
                  onErr(`${tooBig.map((f) => f.name).join(", ")} — over 3 MB, a photo of the page is usually plenty`);
                  e.target.value = "";
                  setFiles([]);
                  return;
                }
                setFiles(picked);
                if (picked.length === 1 && !title.trim()) setTitle(picked[0].name.replace(/\.[^.]+$/, ""));
              }} />
            {files.length > 1 && (
              <span className="block text-[11px] text-body-soft mt-1">
                {files.length} files — each keeps its own name
              </span>
            )}
          </div>
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy || files.length === 0} onClick={upload}>
            {busy ? "Attaching…" : files.length > 1 ? `Attach ${files.length}` : "Attach"}
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table head={<><Th>Document</Th><Th>File</Th><Th right>Size</Th><Th>Added</Th><Th /></>}>
          {docs.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-10">
              <Empty emoji="📎" title="No documents yet" sub="Attach the NID copy and the contract above." />
            </td></tr>
          )}
          {docs.map((d) => (
            <tr key={d.id}>
              <Td><b className="text-purple">{d.title}</b></Td>
              <Td className="text-body-soft">{d.fileName ?? "—"}</Td>
              <Td right className="text-body-soft">{prettySize(d.sizeBytes)}</Td>
              <Td className="text-body-soft">
                {new Date(d.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {d.uploadedBy ? ` · ${d.uploadedBy}` : ""}
              </Td>
              <Td right>
                <button className="text-[12px] text-orchid underline mr-3"
                  onClick={async () => {
                    try {
                      const full = await getEmployeeDocument(employeeId, d.id);
                      downloadDataUrl(full.dataUrl, d.fileName ?? d.title);
                    } catch (e) { onErr(e instanceof Error ? e.message : "Could not open it"); }
                  }}>
                  open
                </button>
                <button className="text-[12px] text-body-soft underline"
                  onClick={async () => {
                    if (!confirm(`Remove "${d.title}"?`)) return;
                    try { await deleteEmployeeDocument(employeeId, d.id); onChanged(); }
                    catch (e) { onErr(e instanceof Error ? e.message : "Could not remove"); }
                  }}>
                  remove
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function Rows({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <div className="text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2 border-b border-[#f5f1f8] last:border-0">
          <span className="text-body-soft">{k}</span>
          <span className="text-right font-semibold">{v || <span className="text-[#c9b8d4] font-normal">—</span>}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusChip({ status, isPaidLeave }: { status: string; isPaidLeave?: boolean }) {
  if (status === "PRESENT") return <Chip tone="emerald">Present</Chip>;
  if (status === "HALF_DAY") return <Chip tone="sky">Half day</Chip>;
  if (status === "LEAVE") return <Chip tone="amber">{isPaidLeave ? "Leave (paid)" : "Leave (unpaid)"}</Chip>;
  return <Chip tone="rose">Absent</Chip>;
}

/* =================================================================== ROLES */

export function EmployeeRolesView() {
  /** which role is being renamed, typed on the row instead of in a prompt */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [rows, setRows] = useState<ApiEmployeeRole[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows(await listEmployeeRoles()); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load roles"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = (m: string) => { setOk(m); setErr(""); window.setTimeout(() => setOk(""), 3000); };

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="People"
        title="Job roles"
        emoji="🏷"
        tone="slate"
        sub="Add a role once and pick it for everybody after that. Kept as a list rather than typed each time, because a second 'Florist' with a different spelling quietly splits every report."
        right={<Link href="/employees" className={btnGhost}>← Staff</Link>}
      />
      <Flash ok={ok} err={err} />

      <Card className="px-5 py-5 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Lbl>New role</Lbl>
            <input className={input} value={name} placeholder="Florist"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          </div>
          <button className={btnPrimary} style={btnPrimaryStyle} disabled={busy || !name.trim()} onClick={() => void add()}>
            {busy ? "Adding…" : "Add role"}
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table head={<><Th>Role</Th><Th right>People</Th><Th right>Status</Th><Th /></>}>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-10">
              <Empty emoji="🏷" title="No roles yet" sub="Add the first one above." />
            </td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><b className="text-purple">{r.name}</b></Td>
              <Td right className="text-body-soft">{r._count?.employees ?? 0}</Td>
              <Td right>{r.isActive ? <Chip tone="emerald">In use</Chip> : <Chip tone="slate">Switched off</Chip>}</Td>
              <Td right>
                {renaming?.id === r.id ? (
                  <span className="inline-flex items-center gap-2 mr-3">
                    <input
                      autoFocus
                      className="ipt h-[30px] w-[150px]"
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") setRenaming(null);
                        if (e.key !== "Enter") return;
                        const n = renaming.value.trim();
                        setRenaming(null);
                        if (!n || n === r.name) return;
                        try { await updateRole(r.id, { name: n }); await load(); } catch (er) { setErr((er as Error).message); }
                      }}
                    />
                    <button className="text-[12px] text-body-soft underline" onClick={() => setRenaming(null)}>cancel</button>
                  </span>
                ) : (
                  <button className="text-[12px] text-orchid underline mr-3"
                    onClick={() => setRenaming({ id: r.id, value: r.name })}>
                    rename
                  </button>
                )}
                <button className="text-[12px] text-body-soft underline mr-3"
                  onClick={() => void updateRole(r.id, { isActive: !r.isActive })}>
                  {r.isActive ? "switch off" : "switch on"}
                </button>
                <button className="text-[12px] text-body-soft underline"
                  onClick={async () => {
                    if (!confirm(`Remove "${r.name}" from the list?`)) return;
                    try { await deleteEmployeeRole(r.id); flash("Removed"); await load(); }
                    catch (e) { setErr(e instanceof Error ? e.message : "Could not remove"); }
                  }}>
                  remove
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <p className="text-[12px] text-body-soft mt-4 mb-0">
        A role somebody actually holds cannot be removed — switch it off instead, and it stays on
        their record while disappearing from the picker.
      </p>
    </div>
  );

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createEmployeeRole({ name: name.trim() });
      setName(""); flash("Role added"); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not add"); }
    finally { setBusy(false); }
  }

  async function updateRole(id: string, body: Record<string, unknown>) {
    try {
      await updateEmployeeRole(id, body);
      flash("Saved"); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not save"); }
  }
}

/* =================================================================== TRASH */

/*  The API has had restore() since day one, but with nothing linking to it a
    removed employee was gone as far as anybody could tell — which makes a
    soft delete no better than a hard one. */
export function EmployeeTrashView() {
  const [rows, setRows] = useState<ApiEmployee[]>([]);
  const [ok, setOk] = useState(""); const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try { setRows((await employeeTrash()).items); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not load"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className={WRAP}>
      <FinHeader
        eyebrow="People"
        title="Removed staff"
        emoji="🗑"
        tone="slate"
        sub="Nobody is ever really deleted here — their payslips and ledger entries have to keep making sense. Put anyone back on the list whenever you need to."
        right={<Link href="/employees" className={btnGhost}>← Staff</Link>}
      />
      <Flash ok={ok} err={err} />
      <Card className="overflow-hidden">
        <Table head={<><Th>Employee</Th><Th>Joined</Th><Th>Removed</Th><Th /></>}>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-10">
              <Empty emoji="✓" title="Nothing here" sub="Nobody has been removed from the staff list." />
            </td></tr>
          )}
          {rows.map((e) => (
            <tr key={e.id}>
              <Td>
                <b className="text-purple">{e.name}</b>
                <span className="block text-[11.5px] text-body-soft">{e.employeeNo}{e.phone ? ` · ${e.phone}` : ""}</span>
              </Td>
              <Td className="text-body-soft">{new Date(e.joinedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
              <Td className="text-body-soft">{e.deletedAt ? ago(e.deletedAt) : "—"}</Td>
              <Td right>
                <button className="text-[12px] text-orchid underline"
                  onClick={async () => {
                    try {
                      await restoreEmployee(e.id);
                      setOk(`${e.name} is back on the list — check their status and pay before using them`);
                      window.setTimeout(() => setOk(""), 5000);
                      await load();
                    } catch (x) { setErr(x instanceof Error ? x.message : "Could not restore"); }
                  }}>
                  put back
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

export { PAY_LABEL };
