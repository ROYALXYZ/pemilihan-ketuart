// Papan hitung suara RT — satu proses Node, tanpa dependency.
// State di satu file JSON, sinkronisasi lewat Server-Sent Events.
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, unlinkSync, openSync, closeSync, fsyncSync, statSync, readSync } from 'node:fs';
import { join, extname, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(ROOT, 'dist');
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, 'data'));
const DATA_FILE = join(DATA_DIR, 'state.json');
const BACKUP_FILE = join(DATA_DIR, 'state.backup.json');
const AUDIT_FILE = join(DATA_DIR, 'audit.log');
const AUDIT_ARCHIVE = join(DATA_DIR, 'audit.1.log');
const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_DIR = join(DATA_DIR, 'photos');
const SEED_FILE = join(DATA_DIR, 'seed.json');
const CANDIDATES_FILE = join(ROOT, 'candidates.json');
const PORT = Number(process.env.PORT || 8787);
const PIN = process.env.ADMIN_PIN || '123456';
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const SESSION_TTL = 1000 * 60 * 60 * 12;

if (!process.env.ADMIN_PIN) {
  console.warn('[peringatan] ADMIN_PIN tidak diset — memakai PIN bawaan "123456". Ganti sebelum dipakai.');
}

// ---------- state ----------

function seed() {
  const cfg = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  const candidates = cfg.candidates.map((c, i) => ({
    id: String(c.id ?? i + 1).padStart(2, '0'),
    name: c.name,
    photo: c.photo || null,
    photoRatio: c.photoRatio || 'landscape',
    votes: 0,
  }));
  return {
    election: cfg.election,
    status: 'open', // open | closed
    candidates,
    log: [],
    auditSeq: 0,
    audit: [],
    updatedAt: new Date().toISOString(),
  };
}

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(PHOTO_DIR, { recursive: true });

let state;
load();
startAuditSession();

// Muat state dengan pemulihan: bila state.json rusak (mis. listrik mati saat tulis),
// coba berkas cadangan terakhir, dan jangan pernah membuat server gagal start.
function load() {
  const parsed = readStateFile(DATA_FILE);
  if (parsed) {
    state = parsed;
    reconcile();
    return;
  }

  const backup = readStateFile(BACKUP_FILE);
  if (backup) {
    console.warn('[peringatan] state.json rusak — memulihkan dari state.backup.json.');
    state = backup;
    state.recoveredFromBackup = true;
    reconcile();
    return;
  }

  if (existsSync(DATA_FILE)) {
    const aside = join(DATA_DIR, `state.rusak.${Date.now()}.json`);
    renameSync(DATA_FILE, aside);
    console.warn(`[peringatan] state.json tidak terbaca — dipindahkan ke ${basename(aside)} dan mulai dari data awal.`);
  }
  state = seed();
  save();
}

function readStateFile(file) {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && Array.isArray(parsed.candidates) && parsed.candidates.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// state.json menjadi sumber utama setelah server pertama kali dijalankan.
// candidates.json hanya dipakai untuk mengisi field yang belum ada di state lama.
function reconcile() {
  const cfg = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8'));
  const byId = new Map(cfg.candidates.map((c, i) => [String(c.id ?? i + 1).padStart(2, '0'), c]));
  state.candidates = (state.candidates || []).map((candidate) => {
    const fallback = byId.get(candidate.id);
    return {
      ...candidate,
      name: candidate.name || fallback?.name || `Calon ${candidate.id}`,
      photo: candidate.photo ?? fallback?.photo ?? null,
      photoRatio: candidate.photoRatio || 'landscape',
      votes: Number.isFinite(candidate.votes) ? candidate.votes : 0,
    };
  });
  state.election ||= JSON.parse(readFileSync(CANDIDATES_FILE, 'utf8')).election;
  state.log ||= [];
  state.auditSeq ||= 0;
  state.audit ||= [];
  save();
}

// Tulis atomik + fsync agar data tetap utuh walau listrik mati tepat saat menyimpan.
function save() {
  const payload = JSON.stringify(state, null, 2);
  const tmp = join(DATA_DIR, `.state.${randomUUID()}.tmp`);
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, payload);
    fsyncSync(fd); // paksa data benar-benar sampai ke disk, bukan hanya cache OS
  } finally {
    closeSync(fd);
  }

  // Simpan versi terakhir yang sah sebagai cadangan sebelum menimpa.
  if (existsSync(DATA_FILE)) {
    try {
      const good = readStateFile(DATA_FILE);
      if (good) {
        const backupTmp = join(DATA_DIR, `.backup.${randomUUID()}.tmp`);
        const backupFd = openSync(backupTmp, 'w');
        try {
          writeFileSync(backupFd, JSON.stringify(good, null, 2));
          fsyncSync(backupFd);
        } finally {
          closeSync(backupFd);
        }
        renameSync(backupTmp, BACKUP_FILE);
      }
    } catch {}
  }

  renameSync(tmp, DATA_FILE);
  syncDir(DATA_DIR);

  if (!existsSync(SEED_FILE)) writeFileSync(SEED_FILE, JSON.stringify(seed(), null, 2));
}

// rename baru durable setelah metadata direktori ikut di-flush (POSIX; dilewati di Windows).
function syncDir(dir) {
  if (process.platform === 'win32') return;
  try {
    const fd = openSync(dir, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {}
}

// ---------- audit trail (khusus admin) ----------
// Catatan tambah/kurang suara, undo, reset, perubahan data, dan kejadian server.
// Ditulis append-only ke data/audit.log (JSONL) agar tetap ada walau state direset.

function getClientIp(req) {
  if (!req) return '';
  const socketIp = req.socket?.remoteAddress || '';
  const isLoopback = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1';

  // Jika di balik Cloudflare Tunnel / reverse proxy lokal, ambil IP klien asli.
  if (isLoopback) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp && typeof cfIp === 'string') return cfIp.trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff && typeof xff === 'string') return xff.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') return realIp.trim();
  }
  return socketIp;
}

function auditEvent(action, detail = {}, req = null) {
  const entry = {
    seq: (state.auditSeq = (Number(state.auditSeq) || 0) + 1),
    at: Date.now(),
    action,
    ip: getClientIp(req),
    ...detail,
  };

  try {
    appendAuditLine(entry);
  } catch (err) {
    console.error('[audit] gagal menulis berkas audit:', err.message);
  }

  // Ringkasan terakhir ikut disimpan di state agar tampil cepat.
  state.audit = [entry, ...(state.audit || [])].slice(0, 50);
  return entry;
}

function appendAuditLine(entry) {
  rotateAuditIfNeeded();
  const fd = openSync(AUDIT_FILE, 'a');
  try {
    writeFileSync(fd, `${JSON.stringify(entry)}\n`);
    fsyncSync(fd); // jejak audit tidak boleh hilang saat listrik mati
  } finally {
    closeSync(fd);
  }
}

function rotateAuditIfNeeded() {
  try {
    if (existsSync(AUDIT_FILE) && statSync(AUDIT_FILE).size > AUDIT_MAX_BYTES) {
      renameSync(AUDIT_FILE, AUDIT_ARCHIVE);
    }
  } catch {}
}

/** Baca N entri audit terakhir tanpa memuat seluruh berkas. */
function readAudit(limit = 200) {
  if (!existsSync(AUDIT_FILE)) return [];
  try {
    const size = statSync(AUDIT_FILE).size;
    const windowBytes = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(windowBytes);
    const fd = openSync(AUDIT_FILE, 'r');
    try {
      readSync(fd, buf, 0, windowBytes, size - windowBytes);
    } finally {
      closeSync(fd);
    }
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    // Baris pertama bisa terpotong bila jendela baca tidak mulai di awal berkas.
    if (windowBytes < size) lines.shift();
    return lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

function totalVotes() {
  return state.candidates.reduce((n, c) => n + c.votes, 0);
}

// Catat sesi server: awali dengan server_start, dan tandai bila sesi sebelumnya mati mendadak.
function startAuditSession() {
  // Audit fsync dapat selesai tepat sebelum listrik mati, sementara stateSeq belum sempat tersimpan.
  state.auditSeq = Math.max(Number(state.auditSeq) || 0, Number(readAudit(1)[0]?.seq) || 0);
  const recovered = Boolean(state.recoveredFromBackup);
  if (recovered) {
    delete state.recoveredFromBackup; // hanya penanda sekali pakai, jangan tersimpan permanen
  }
  const previous = readAudit(1)[0];
  const unclean = previous && previous.action !== 'server_stop';
  auditEvent('server_start', {
    total: totalVotes(),
    candidates: state.candidates.length,
    recoveredFromBackup: recovered,
    note: unclean
      ? `Sesi sebelumnya berakhir mendadak. Kejadian terakhir: ${previous.action} pada ${new Date(previous.at).toISOString()}.`
      : '',
  });
  save();
}

function stopAuditSession(signal) {
  try {
    auditEvent('server_stop', { signal, total: totalVotes() });
    save();
  } catch {}
}

function publicState() {
  const total = state.candidates.reduce((n, c) => n + c.votes, 0);
  const peak = Math.max(0, ...state.candidates.map((c) => c.votes));
  return {
    election: state.election,
    status: state.status,
    total,
    peak,
    updatedAt: state.updatedAt,
    candidates: state.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      photo: c.photo || null,
      photoRatio: c.photoRatio || 'landscape',
      votes: c.votes,
      share: total ? c.votes / total : 0,
      lead: total > 0 && c.votes === peak,
    })),
    log: state.log.slice(-8).reverse(),
  };
}

// ---------- sse ----------

const clients = new Set();

function broadcast() {
  const payload = `data: ${JSON.stringify(publicState())}\n\n`;
  for (const res of clients) res.write(payload);
}

// ---------- auth ----------

function sign(exp) {
  const mac = createHmac('sha256', SECRET).update(String(exp)).digest('base64url');
  return `${exp}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac) return false;
  const expected = createHmac('sha256', SECRET).update(exp).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) && Number(exp) > Date.now();
}

function isAdmin(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? verify(decodeURIComponent(match[1])) : false;
}

const attempts = new Map();
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 60_000;
const ATTEMPTS_PRUNE_AT = 5_000;

function rateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.until) {
    if (attempts.size >= ATTEMPTS_PRUNE_AT) {
      for (const [key, value] of attempts) if (now > value.until) attempts.delete(key);
    }
    attempts.set(ip, { count: 1, until: now + LOGIN_WINDOW_MS });
    return false;
  }

  if (entry.count >= LOGIN_LIMIT) return true;

  entry.count += 1;
  return false;
}

// ---------- helpers ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(data);
}

function readBody(req, limit = 4096) {
  return new Promise((ok, fail) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) { fail(new Error('Ukuran data terlalu besar.')); req.destroy(); }
    });
    req.on('end', () => ok(body));
    req.on('error', fail);
  });
}

function removePhotoFile(photo) {
  if (!photo || !photo.startsWith('/photos/')) return;
  const filename = photo.split('?')[0].slice('/photos/'.length);
  const file = resolve(PHOTO_DIR, filename);
  if (file.startsWith(PHOTO_DIR) && existsSync(file)) unlinkSync(file);
}

function touch() {
  state.updatedAt = new Date().toISOString();
  save();
  broadcast();
}

// ---------- api ----------

async function api(req, res, path) {
  if (path === '/api/state' && req.method === 'GET') return json(res, 200, publicState());

  if (path === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    res.write(`data: ${JSON.stringify(publicState())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (path === '/api/session' && req.method === 'GET') {
    return json(res, 200, { admin: isAdmin(req) });
  }

  if (path === '/api/login' && req.method === 'POST') {
    const ip = getClientIp(req) || 'unknown';
    if (rateLimited(ip)) return json(res, 429, { error: 'Terlalu banyak percobaan. Tunggu satu menit.' });
    const body = JSON.parse((await readBody(req)) || '{}');
    if (String(body.pin || '') !== PIN) return json(res, 401, { error: 'PIN salah.' });
    const token = sign(Date.now() + SESSION_TTL);
    res.writeHead(204, {
      'set-cookie': `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`,
      'cache-control': 'no-store',
    });
    return res.end();
  }

  if (path === '/api/logout' && req.method === 'POST') {
    res.writeHead(204, {
      'set-cookie': 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
      'cache-control': 'no-store',
    });
    return res.end();
  }

  if (path.startsWith('/api/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'Perlu masuk sebagai admin.' });

    if (path === '/api/audit' && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));
      return json(res, 200, { entries: readAudit(limit), total: readAudit(1)[0]?.seq ?? 0 });
    }

    // Hanya pencatatan suara yang dikunci; status & reset tetap bisa diubah operator.
    const locked = () => json(res, 409, { error: 'Penghitungan sudah dikunci.' });

    if (path === '/api/vote' && req.method === 'POST') {
      if (state.status === 'closed') return locked();
      const body = JSON.parse((await readBody(req)) || '{}');
      const candidate = state.candidates.find((c) => c.id === body.id);
      const delta = body.delta === -1 ? -1 : 1;
      if (!candidate) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      if (candidate.votes + delta < 0) return json(res, 409, { error: 'Suara tidak boleh minus.' });
      candidate.votes += delta;
      if (delta === 1) {
        state.log.push({ at: Date.now(), id: candidate.id, name: candidate.name });
      } else {
        // Koreksi manual mengurangi suara: buang catatan tambah terakhir calon ini
        // agar tombol Undo tidak mengurangi suara yang sudah dikoreksi.
        for (let i = state.log.length - 1; i >= 0; i -= 1) {
          if (state.log[i].id === candidate.id) {
            state.log.splice(i, 1);
            break;
          }
        }
      }
      auditEvent(delta === 1 ? 'vote_add' : 'vote_subtract', {
        candidateId: candidate.id,
        candidateName: candidate.name,
        votesAfter: candidate.votes,
        totalAfter: totalVotes(),
      }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/undo' && req.method === 'POST') {
      if (state.status === 'closed') return locked();
      // Cari catatan terakhir yang calonnya masih punya suara, agar tidak pernah minus.
      let last = null;
      let candidate = null;
      while (state.log.length > 0) {
        const entry = state.log.pop();
        const found = state.candidates.find((c) => c.id === entry.id);
        if (found && found.votes > 0) {
          last = entry;
          candidate = found;
          break;
        }
      }
      if (!last || !candidate) return json(res, 409, { error: 'Tidak ada suara untuk dibatalkan.' });
      candidate.votes -= 1;
      auditEvent('undo', {
        candidateId: last.id,
        candidateName: last.name,
        votesAfter: candidate.votes,
        totalAfter: totalVotes(),
        originalAt: last.at,
      }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/photo' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 3_000_000)) || '{}');
      const candidate = state.candidates.find((c) => c.id === body.id);
      if (!candidate) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ''));
      if (!match) return json(res, 400, { error: 'Format foto harus JPG, PNG, atau WEBP.' });
      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 1_500_000) return json(res, 413, { error: 'Foto terlalu besar (maksimal 1,5 MB).' });
      removePhotoFile(candidate.photo);
      const filename = `${randomUUID().slice(0, 8)}.${ext}`;
      const photoFile = join(PHOTO_DIR, filename);
      const photoTmp = join(PHOTO_DIR, `.${filename}.tmp`);
      const photoFd = openSync(photoTmp, 'w');
      try {
        writeFileSync(photoFd, buffer);
        fsyncSync(photoFd);
      } finally {
        closeSync(photoFd);
      }
      renameSync(photoTmp, photoFile);
      syncDir(PHOTO_DIR);
      candidate.photo = `/photos/${filename}`;
      candidate.photoRatio = ['landscape', 'square', 'portrait'].includes(body.ratio) ? body.ratio : 'landscape';
      auditEvent('photo_set', {
        candidateId: candidate.id,
        candidateName: candidate.name,
        photoRatio: candidate.photoRatio,
        bytes: buffer.length,
      }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/candidate/add' && req.method === 'POST') {
      if (state.candidates.length >= 12) return json(res, 400, { error: 'Maksimal 12 calon.' });
      const used = new Set(state.candidates.map((c) => Number(c.id)));
      let next = 1;
      while (used.has(next)) next += 1;
      const body = JSON.parse((await readBody(req)) || '{}');
      const name = String(body.name || `Calon ${next}`).trim() || `Calon ${next}`;
      const candidate = { id: String(next).padStart(2, '0'), name, photo: null, votes: 0 };
      state.candidates.push(candidate);
      state.candidates.sort((a, b) => Number(a.id) - Number(b.id));
      auditEvent('candidate_add', { candidateId: candidate.id, candidateName: name }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/candidate/remove' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (state.candidates.length <= 1) return json(res, 400, { error: 'Minimal satu calon harus tersisa.' });
      const index = state.candidates.findIndex((c) => c.id === body.id);
      if (index === -1) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      const [removed] = state.candidates.splice(index, 1);
      removePhotoFile(removed.photo);
      state.log = state.log.filter((entry) => entry.id !== removed.id);
      auditEvent('candidate_remove', {
        candidateId: removed.id,
        candidateName: removed.name,
        votesRemoved: removed.votes,
        totalAfter: totalVotes(),
      }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/photo/ratio' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const candidate = state.candidates.find((c) => c.id === body.id);
      if (!candidate) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      if (!['landscape', 'square', 'portrait'].includes(body.ratio)) {
        return json(res, 400, { error: 'Rasio foto harus landscape, square, atau portrait.' });
      }
      candidate.photoRatio = body.ratio;
      auditEvent('photo_ratio', { candidateId: candidate.id, candidateName: candidate.name, photoRatio: body.ratio }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/photo/remove' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const candidate = state.candidates.find((c) => c.id === body.id);
      if (!candidate) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      removePhotoFile(candidate.photo);
      candidate.photo = null;
      auditEvent('photo_remove', { candidateId: candidate.id, candidateName: candidate.name }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/candidate' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const candidate = state.candidates.find((c) => c.id === body.id);
      if (!candidate) return json(res, 404, { error: 'Calon tidak ditemukan.' });
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 2 || name.length > 100) {
        return json(res, 400, { error: 'Nama calon harus 2–100 karakter.' });
      }
      const before = candidate.name;
      candidate.name = name;
      auditEvent('candidate_rename', {
        candidateId: candidate.id,
        before,
        candidateName: name,
      }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/election' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const fields = ['title', 'subtitle', 'date'];
      if (fields.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
        return json(res, 400, { error: 'Judul, keterangan, dan tanggal pemilihan harus diisi.' });
      }
      if (body.title.trim().length > 120 || body.subtitle.trim().length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        return json(res, 400, { error: 'Informasi pemilihan tidak valid.' });
      }
      state.election = { title: body.title.trim(), subtitle: body.subtitle.trim(), date: body.date };
      auditEvent('election_update', { election: state.election }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/status' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const prev = state.status;
      state.status = body.status === 'closed' ? 'closed' : 'open';
      auditEvent(state.status === 'closed' ? 'status_lock' : 'status_unlock', { previous: prev, total: totalVotes() }, req);
      touch();
      return json(res, 200, publicState());
    }

    if (path === '/api/reset' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (body.confirm !== 'RESET') return json(res, 400, { error: 'Konfirmasi tidak cocok.' });
      const beforeTotal = totalVotes();
      for (const c of state.candidates) c.votes = 0;
      state.log = [];
      state.status = 'open';
      auditEvent('reset', { previousTotal: beforeTotal }, req);
      touch();
      return json(res, 200, publicState());
    }
  }

  return json(res, 404, { error: 'Tidak ada.' });
}

// ---------- static ----------

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);

  if (path.startsWith('/candidates/')) {
    const pubFile = resolve(ROOT, 'public', '.' + path);
    const distFile = resolve(DIST, '.' + path);
    const file = existsSync(pubFile) ? pubFile : distFile;
    if (existsSync(file)) {
      const ext = extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': 'public, max-age=3600',
      });
      res.end(readFileSync(file));
      return;
    }
  }

  if (path.startsWith('/photos/')) {
    const filename = path.replace('/photos/', '');
    const file = resolve(PHOTO_DIR, filename);
    if (!file.startsWith(PHOTO_DIR) || !existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=60',
    });
    res.end(readFileSync(file));
    return;
  }

  if (path === '/') path = '/index.html';
  let file = resolve(DIST, '.' + path);
  if (!file.startsWith(DIST)) { res.writeHead(403).end('Forbidden'); return; }
  if (!existsSync(file)) {
    if (extname(path)) { res.writeHead(404).end('Not found'); return; }
    file = join(DIST, 'index.html');
  }
  const ext = extname(file);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'x-content-type-options': 'nosniff',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  };
  res.writeHead(200, headers);
  res.end(readFileSync(file));
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    serve(req, res);
  } catch (error) {
    json(res, 500, { error: String(error.message || error) });
  }
});

server.listen(PORT, () => {
  console.log(`Papan hitung suara jalan di http://localhost:${PORT}`);
  console.log(`Jejak audit operator: ${AUDIT_FILE}`);
});

// Tandai penutupan yang rapi agar audit bisa membedakan mati normal vs listrik mati.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAuditSession(signal);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}

process.on('uncaughtException', (err) => {
  try {
    auditEvent('server_error', { note: String(err && err.message ? err.message : err) });
    save();
  } catch {}
  console.error('[fatal]', err);
  process.exit(1);
});
