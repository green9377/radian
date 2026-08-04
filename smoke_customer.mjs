import { spawn } from 'node:child_process';
import { writeFileSync, appendFileSync } from 'node:fs';

const LOG = 'D:\\radian\\_smoke_customer.log';
const BASE = 'http://localhost:4000';
const sfx = Date.now().toString().slice(-6);
writeFileSync(LOG, `===== CUSTOMER SMOKE ${new Date().toISOString()} (sfx=${sfx}) =====\n`);
const log = (m) => appendFileSync(LOG, m + '\n');

const env = { ...process.env, DATABASE_URL: 'postgresql://radian_user:radian_pass@localhost:5433/radian_db', PORT: '4000' };
const srv = spawn(process.execPath, ['dist/main'], { cwd: 'D:\\radian\\apps\\api', env, stdio: ['ignore', 'pipe', 'pipe'] });
let srvOut = '';
srv.stdout.on('data', (d) => (srvOut += d));
srv.stderr.on('data', (d) => (srvOut += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function up() { for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE + '/'); if (r.ok || r.status === 404) return true; } catch {} await sleep(700); } return false; }
async function J(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}

const ok = await up();
log(`server up: ${ok} (pid ${srv.pid})`);
try {
  if (!ok) throw new Error('server did not start');
  let r;

  r = await J('POST', '/segments', { slug: `vip-${sfx}`, name: 'VIP' });
  const seg = r.body;
  log(`SEGMENT: ${r.status} id=${seg.id}`);

  const phone = `+1415555${sfx}`;
  r = await J('POST', '/customers', {
    name: 'Farhana Rahman', phone, email: 'f@example.com', whatsappVerified: true,
    country: 'United States', segmentIds: [seg.id],
    recipients: [{
      name: 'Shirin', phone: `+8801755${sfx}`, relationship: 'mother', zone: 'DHAKA',
      addressLine: 'Banani, Dhaka', isFavorite: true,
      occasions: [{ type: 'BIRTHDAY', date: '09-03' }],
    }],
  });
  const cus = r.body;
  log(`CUSTOMER: ${r.status} id=${cus.id} tier=${cus.tier} ltvPaisa=${cus.ltvPaisa}(${typeof cus.ltvPaisa}) isAbroad=${cus.isAbroad} segs=${cus.segments?.length} recips=${cus.recipients?.length} occ=${cus.recipients?.[0]?.occasions?.length}`);

  r = await J('GET', `/customers/${cus.id}`);
  log(`GET one: recips=${r.body.recipients?.length} firstRecipOcc=${r.body.recipients?.[0]?.occasions?.[0]?.date}`);

  r = await J('GET', `/customers?abroad=true&search=Farhana`);
  log(`LIST abroad=true: total=${r.body.total} firstIsAbroad=${r.body.items?.[0]?.isAbroad}`);

  // dupe phone -> 400
  r = await J('POST', '/customers', { name: 'Dup', phone });
  log(`DUPE-PHONE: status=${r.status} ${r.status === 400 ? 'OK rejected' : 'FAIL'}`);

  // non-international phone -> 400
  r = await J('POST', '/customers', { name: 'BadPhone', phone: `0171${sfx}` });
  log(`INTL-PHONE-RULE: status=${r.status} ${r.status === 400 ? 'OK rejected' : 'FAIL'}`);

  // block / unblock
  r = await J('POST', `/customers/${cus.id}/block`);
  log(`BLOCK: status=${r.status} customerStatus=${r.body.status}`);
  r = await J('POST', `/customers/${cus.id}/unblock`);
  log(`UNBLOCK: status=${r.status} customerStatus=${r.body.status}`);

  // add recipient
  r = await J('POST', `/customers/${cus.id}/recipients`, {
    name: 'Nabila', phone: `+8801833${sfx}`, relationship: 'sibling', zone: 'BANGLADESH',
    addressLine: 'Chattogram', occasions: [{ type: 'ANNIVERSARY', date: '01-18' }],
  });
  const rid = r.body.id;
  log(`ADD-RECIPIENT: ${r.status} id=${rid} occ=${r.body.occasions?.length}`);

  // update recipient (replace occasions)
  r = await J('PATCH', `/customers/${cus.id}/recipients/${rid}`, {
    isFavorite: true, occasions: [{ type: 'CUSTOM', date: '05-12', label: "Mother's Day" }],
  });
  log(`UPDATE-RECIPIENT: ${r.status} fav=${r.body.isFavorite} occ=${r.body.occasions?.length} occLabel=${r.body.occasions?.[0]?.label}`);

  // remove recipient
  r = await J('DELETE', `/customers/${cus.id}/recipients/${rid}`);
  log(`REMOVE-RECIPIENT: ${r.status}`);
  r = await J('GET', `/customers/${cus.id}`);
  log(`RECIPIENTS AFTER REMOVE: ${r.body.recipients?.length} (added 1, removed 1 => expect 1 original)`);

  // timeline
  r = await J('GET', `/customers/${cus.id}/timeline`);
  log(`TIMELINE: events=${Array.isArray(r.body) ? r.body.length : '?'} latest='${r.body?.[0]?.label}'`);

  // soft delete + restore
  r = await J('DELETE', `/customers/${cus.id}`);
  log(`DELETE: ${r.status}`);
  r = await J('GET', `/customers?search=Farhana`);
  log(`AFTER DELETE total=${r.body.total} (expect 0)`);
  r = await J('POST', `/customers/${cus.id}/restore`);
  log(`RESTORE: ${r.status}`);
  r = await J('GET', `/customers?search=Farhana`);
  log(`AFTER RESTORE total=${r.body.total} (expect 1)`);

  log('RESULT: PASS');
} catch (e) {
  log('ERROR: ' + (e?.message || e));
  log('server tail: ' + srvOut.split('\n').slice(-15).join(' | '));
  log('RESULT: FAIL');
} finally {
  srv.kill('SIGKILL');
  log(`===== CUSTOMER SMOKE DONE ${new Date().toISOString()} =====`);
}
