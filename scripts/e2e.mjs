// Uji end-to-end: login, tambah suara, undo, unggah foto, kunci, reset.

const BASE = 'http://localhost:8787';
let cookie = '';

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

const assert = (cond, message) => {
  if (!cond) {
    console.error('GAGAL:', message);
    process.exit(1);
  }
  console.log('ok  ', message);
};

// 1. publik read-only
let r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
assert(r.status === 401, 'vote tanpa login ditolak 401');

r = await call('/api/audit');
assert(r.status === 401, 'log audit tanpa login ditolak 401');

// 2. PIN salah
r = await call('/api/login', { method: 'POST', body: JSON.stringify({ pin: '000000' }) });
assert(r.status === 401, 'PIN salah ditolak 401');

// 3. login benar
r = await call('/api/login', { method: 'POST', body: JSON.stringify({ pin: '123456' }) });
assert(r.status === 204 && cookie.startsWith('session='), 'login benar memasang cookie session');

// 3b. mulai dari kondisi bersih agar uji bisa diulang
r = await call('/api/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) });
assert(r.status === 200 && r.body.total === 0, 'reset awal: mulai dari 0 suara');

// 4. tambah suara
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
assert(r.status === 200 && r.body.candidates[0].votes === 1 && r.body.total === 1, 'tambah suara id 01 -> 1');

r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '02', delta: 1 }) });
assert(r.body.total === 2 && r.body.candidates[0].lead && r.body.candidates[1].lead, 'dua calon seri ditandai lead bersamaan');

// 5. tidak boleh minus
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '03', delta: -1 }) });
assert(r.status === 409, 'koreksi di bawah nol ditolak 409');

// 6. undo
r = await call('/api/undo', { method: 'POST' });
assert(r.status === 200 && r.body.total === 1, 'undo mengembalikan total ke 1');

// 7. unggah foto pada calon percobaan (agar foto bawaan calon asli tetap utuh)
let scratch = await call('/api/candidate/add', { method: 'POST', body: JSON.stringify({ name: 'Calon Uji' }) });
const scratchId = scratch.body.candidates.find((c) => c.name === 'Calon Uji').id;
const base64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
r = await call('/api/photo', {
  method: 'POST',
  body: JSON.stringify({ id: scratchId, data: `data:image/jpeg;base64,${base64}`, ratio: 'portrait' }),
});
const scratchCandidate = r.body.candidates.find((c) => c.id === scratchId);
assert(r.status === 200 && /^\/photos\/[A-Za-z0-9-]+\.jpg$/.test(scratchCandidate.photo), 'unggah foto menghasilkan path /photos/<nama>.jpg');
assert(scratchCandidate.photoRatio === 'portrait', 'rasio foto tersimpan sebagai portrait');

r = await call('/api/photo/ratio', { method: 'POST', body: JSON.stringify({ id: scratchId, ratio: 'square' }) });
assert(r.status === 200 && r.body.candidates.find((c) => c.id === scratchId).photoRatio === 'square', 'rasio foto bisa diubah ke square');

r = await call('/api/photo/ratio', { method: 'POST', body: JSON.stringify({ id: scratchId, ratio: 'invalid' }) });
assert(r.status === 400, 'rasio foto tidak valid ditolak 400');

const photo = await fetch(BASE + scratchCandidate.photo);
assert(photo.ok && photo.headers.get('content-type') === 'image/jpeg', 'foto dapat diambil kembali sebagai image/jpeg');

// 8. payload bukan gambar ditolak
r = await call('/api/photo', { method: 'POST', body: JSON.stringify({ id: scratchId, data: 'data:text/html;base64,PHNjcmlwdD4=' }) });
assert(r.status === 400, 'data non-gambar ditolak 400');

r = await call('/api/photo/remove', { method: 'POST', body: JSON.stringify({ id: scratchId }) });
assert(r.status === 200 && r.body.candidates.find((c) => c.id === scratchId).photo === null, 'foto calon bisa dihapus');

r = await call('/api/candidate/remove', { method: 'POST', body: JSON.stringify({ id: scratchId }) });
assert(r.status === 200 && r.body.candidates.length === 6, 'calon percobaan dibersihkan');

// 8b. kelola data calon (ubah nama, tambah, hapus, hapus foto)
r = await call('/api/candidate', { method: 'POST', body: JSON.stringify({ id: '02', name: 'Siti Rahmawati, S.Pd.' }) });
assert(r.status === 200 && r.body.candidates[1].name === 'Siti Rahmawati, S.Pd.', 'nama calon bisa diubah');

r = await call('/api/candidate', { method: 'POST', body: JSON.stringify({ id: '02', name: 'A' }) });
assert(r.status === 400, 'nama calon terlalu pendek ditolak');

r = await call('/api/candidate', { method: 'POST', body: JSON.stringify({ id: '02', name: 'Siti Rahmawati' }) });
assert(r.body.candidates[1].name === 'Siti Rahmawati', 'nama calon dikembalikan');

r = await call('/api/candidate/add', { method: 'POST', body: JSON.stringify({ name: 'Calon Tambahan' }) });
assert(r.status === 200 && r.body.candidates.length === 7, 'calon baru bisa ditambahkan');
const added = r.body.candidates.find((c) => c.name === 'Calon Tambahan');

r = await call('/api/candidate/remove', { method: 'POST', body: JSON.stringify({ id: added.id }) });
assert(r.status === 200 && r.body.candidates.length === 6, 'calon bisa dihapus');

r = await call('/api/election', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Pemilihan Ketua RT 007 (Uji)',
    subtitle: 'RW 004 · Kelurahan Sukamaju',
    date: '2026-11-08',
  }),
});
assert(r.body.election?.title === 'Pemilihan Ketua RT 007 (Uji)', 'judul pemilihan bisa diubah');

r = await call('/api/election', { method: 'POST', body: JSON.stringify({ title: 'Hanya judul' }) });
assert(r.status === 400, 'informasi pemilihan tidak lengkap ditolak');

r = await call('/api/election', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Pemilihan Ketua RT 007',
    subtitle: 'RW 004 · Kelurahan Sukamaju',
    date: '2026-11-08',
  }),
});
assert(r.body.election.title === 'Pemilihan Ketua RT 007', 'judul pemilihan dikembalikan');

// 9. kunci lalu tolak input
r = await call('/api/status', { method: 'POST', body: JSON.stringify({ status: 'closed' }) });
assert(r.body.status === 'closed', 'status bisa dikunci');
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
assert(r.status === 409, 'input suara ditolak saat terkunci');

// 10. buka kembali lalu reset
r = await call('/api/status', { method: 'POST', body: JSON.stringify({ status: 'open' }) });
assert(r.body.status === 'open', 'status bisa dibuka kembali');

r = await call('/api/reset', { method: 'POST', body: JSON.stringify({ confirm: 'SALAH' }) });
assert(r.status === 400, 'reset tanpa konfirmasi ditolak');
r = await call('/api/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) });
assert(r.body.total === 0 && r.body.status === 'open' && r.body.log.length === 0, 'reset mengosongkan suara dan log');

// 11. audit operator: penambahan & pengurangan suara harus terekam, dan bertahan setelah reset
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
assert(r.status === 200 && r.body.total === 1, 'suara baru tercatat setelah reset');
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: -1 }) });
assert(r.status === 200 && r.body.total === 0, 'pengurangan suara diterima');

r = await call('/api/undo', { method: 'POST' });
assert(r.status === 409, 'undo tidak bisa membuat suara minus setelah koreksi manual');

r = await call('/api/audit?limit=200');
assert(r.status === 200 && Array.isArray(r.body.entries), 'log audit bisa dibaca operator');
const actions = r.body.entries.map((entry) => entry.action);
assert(actions.includes('server_start'), 'audit mencatat sesi server dimulai');
assert(actions.includes('vote_add'), 'audit mencatat penambahan suara');
const subtracted = r.body.entries.find((entry) => entry.action === 'vote_subtract');
assert(
  Boolean(subtracted) && subtracted.candidateId === '01' && subtracted.totalAfter === 0,
  'audit mencatat pengurangan suara beserta total setelahnya',
);
assert(actions.includes('reset'), 'audit tetap ada setelah reset suara');
assert(
  r.body.entries[0].seq > r.body.entries[r.body.entries.length - 1].seq,
  'audit diurutkan dari kejadian terbaru',
);

r = await call('/api/audit?limit=9999');
assert(r.status === 200 && r.body.entries.length <= 500, 'limit audit dibatasi maksimal 500 entri');

// 11b. di balik Cloudflare Tunnel / proxy lokal, IP klien asli harus dipakai
// (bukan 127.0.0.1) agar rate limit login tidak memblokir semua orang sekaligus.
const forward = (headers, body) =>
  fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// IP asli harus tercatat di audit saat diteruskan via proxy.
await call('/api/vote', {
  method: 'POST',
  headers: { 'cf-connecting-ip': '203.0.113.50' },
  body: JSON.stringify({ id: '01', delta: 1 }),
});
r = await call('/api/audit?limit=1');
assert(r.body.entries[0].ip === '203.0.113.50', 'IP cf-connecting-ip tercatat di audit saat koneksi loopback');

// 8 kali salah PIN dari satu IP setelah kuota habis -> 429 hanya untuk IP itu.
const spoofIp = '203.0.113.7';
let capped = false;
for (let i = 0; i < 12; i += 1) {
  const res = await forward({ 'cf-connecting-ip': spoofIp }, { pin: '000000' });
  if (res.status === 429) {
    capped = true;
    break;
  }
}
assert(capped, 'rate limit menahan percobaan PIN berulang dari satu IP');

// IP lain tetap boleh mencoba walau IP di atas diblokir.
const otherIp = await forward({ 'cf-connecting-ip': '198.51.100.9' }, { pin: '123456' });
assert(otherIp.status === 204, 'IP lain tidak ikut terblokir oleh rate limit');

// 12. logout
r = await call('/api/logout', { method: 'POST' });
assert(r.status === 204, 'logout berhasil');
r = await call('/api/vote', { method: 'POST', body: JSON.stringify({ id: '01', delta: 1 }) });
assert(r.status === 401, 'setelah logout vote ditolak lagi');

console.log('\nSemua uji end-to-end lolos.');
