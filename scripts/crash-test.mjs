// Uji ketahanan penyimpanan: matikan paksa proses tepat setelah vote dicatat,
// lalu hidupkan ulang dan periksa apakah data masih utuh (bukan hilang/rusak).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP = process.env.TEMP || tmpdir();
const DATA = join(TEMP, 'rt-crash-test', 'data');
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
let cookie = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp(tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/state`);
      if (r.ok) return true;
    } catch {}
    await sleep(100);
  }
  return false;
}

function start() {
  return spawn(process.execPath, ['src/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, ADMIN_PIN: '123456' },
    stdio: 'ignore',
  });
}

const call = async (path, init = {}) => {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

rmSync(join(TEMP, 'rt-crash-test'), { recursive: true, force: true });
mkdirSync(DATA, { recursive: true });

// --- Ronde 1: catat 5 suara lalu matikan paksa (SIGKILL) saat proses hidup ---
let child = start();
if (!(await waitUp())) {
  console.error('GAGAL: server tidak hidup');
  process.exit(1);
}

await call('/api/login', { method: 'POST', body: JSON.stringify({ pin: '123456' }) });
for (let i = 0; i < 5; i += 1) {
  await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
}
await call('/api/candidate', { method: 'POST', body: JSON.stringify({ id: '02', name: 'Nama Uji Crash' }) });

// Matikan paksa segera setelah respons terakhir diterima.
child.kill('SIGKILL');
await sleep(400);

const raw = readFileSync(join(DATA, 'state.json'), 'utf8');
let parsed = null;
let parseOk = false;
try {
  parsed = JSON.parse(raw);
  parseOk = true;
} catch {}

console.log(`berkas state.json ada: ${existsSync(join(DATA, 'state.json'))}`);
console.log(`state.json bisa di-parse: ${parseOk}`);
console.log(`suara calon 01 tersimpan: ${parseOk ? parsed.candidates[0].votes : 'n/a'}`);
console.log(`nama calon 02 tersimpan: ${parseOk ? parsed.candidates[1].name : 'n/a'}`);

// --- Ronde 2: hidupkan ulang, pastikan data masih ada ---
child = start();
if (!(await waitUp())) {
  console.error('GAGAL: server tidak bisa hidup ulang (state rusak?)');
  process.exit(1);
}
const reopened = await call('/api/state');
console.log(`total suara setelah restart: ${reopened.body.total}`);
console.log(`nama calon 02 setelah restart: ${reopened.body.candidates[1].name}`);

// Audit harus membuktikan sesi sebelumnya mati mendadak (bukan sekadar data utuh).
await call('/api/login', { method: 'POST', body: JSON.stringify({ pin: '123456' }) });
const auditAfterKill = await call('/api/audit?limit=50');
const uncleanStart = auditAfterKill.body.entries.find((entry) => entry.action === 'server_start');
const uncleanFlagged = Boolean(uncleanStart && uncleanStart.note);
console.log(`audit menandai mati mendadak: ${uncleanFlagged}`);
if (uncleanStart && uncleanStart.note) console.log(`  catatan: ${uncleanStart.note}`);
child.kill('SIGKILL');
await sleep(200);

// --- Ronde 3: state.json rusak total -> harus pulih dari cadangan, server tetap hidup ---
writeFileSync(join(DATA, 'state.json'), '{"election":{"title":"X","subt');
child = start();
const alive = await waitUp();
const recovered = alive ? await call('/api/state') : { body: { total: -1, candidates: [] } };
console.log(`server hidup walau state.json rusak: ${alive}`);
console.log(`total suara dari cadangan: ${recovered.body.total}`);
if (alive) {
  child.kill('SIGKILL');
  await sleep(200);
}

const ok =
  parseOk &&
  reopened.body.total === 5 &&
  reopened.body.candidates[1].name === 'Nama Uji Crash' &&
  uncleanFlagged &&
  alive &&
  recovered.body.total > 0;
console.log(ok ? '\nHASIL: data selamat setelah mati paksa & pulih dari berkas rusak' : '\nHASIL: ADA DATA HILANG / RUSAK');

// --- Ronde 4: dua-duanya rusak -> server tetap bisa start (mulai dari data awal) ---
writeFileSync(join(DATA, 'state.json'), '{"rusak":');
writeFileSync(join(DATA, 'state.backup.json'), '{"rusak":');
child = start();
const aliveBoth = await waitUp();
console.log(`server tetap start walau state.json & cadangan rusak: ${aliveBoth}`);
if (aliveBoth) {
  child.kill('SIGKILL');
  await sleep(200);
}

process.exit(ok && aliveBoth ? 0 : 1);
