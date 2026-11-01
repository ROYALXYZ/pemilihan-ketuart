export type Status = 'open' | 'closed';

/** Rasio bingkai foto kartu calon. `landscape` = 4:3 (bawaan), `portrait` = 3:4. */
export type PhotoRatio = 'landscape' | 'square' | 'portrait';

export const PHOTO_RATIO: Record<PhotoRatio, number> = {
  landscape: 4 / 3,
  square: 1,
  portrait: 3 / 4,
};

export type Candidate = {
  id: string;
  name: string;
  votes: number;
  share: number;
  lead: boolean;
  photo: string | null;
  photoRatio: PhotoRatio | null;
};

export type AuditAction =
  | 'server_start' | 'server_stop' | 'server_error'
  | 'vote_add' | 'vote_subtract' | 'undo' | 'reset'
  | 'status_lock' | 'status_unlock'
  | 'candidate_add' | 'candidate_remove' | 'candidate_rename'
  | 'photo_set' | 'photo_remove' | 'photo_ratio' | 'election_update';

export type AuditEntry = {
  seq: number;
  at: number;
  action: AuditAction;
  ip?: string;
  candidateId?: string;
  candidateName?: string;
  votesAfter?: number;
  totalAfter?: number;
  previousTotal?: number;
  note?: string;
  [key: string]: unknown;
};

export type LogEntry = {
  at: number;
  id: string;
  name: string;
};

export type Board = {
  election: { title: string; subtitle: string; date: string };
  status: Status;
  total: number;
  peak: number;
  updatedAt: string;
  candidates: Candidate[];
  log: LogEntry[];
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Terjadi kesalahan. Coba lagi.');
  return body as T;
}

export const vote = (id: string, delta: 1 | -1) =>
  api<Board>('/api/vote', { method: 'POST', body: JSON.stringify({ id, delta }) });

export const undo = () => api<Board>('/api/undo', { method: 'POST' });

export const uploadPhoto = (id: string, data: string, ratio: PhotoRatio = 'landscape') =>
  api<Board>('/api/photo', { method: 'POST', body: JSON.stringify({ id, data, ratio }) });

export const setPhotoRatio = (id: string, ratio: PhotoRatio) =>
  api<Board>('/api/photo/ratio', { method: 'POST', body: JSON.stringify({ id, ratio }) });

export const removePhoto = (id: string) =>
  api<Board>('/api/photo/remove', { method: 'POST', body: JSON.stringify({ id }) });

export const renameCandidate = (id: string, name: string) =>
  api<Board>('/api/candidate', { method: 'POST', body: JSON.stringify({ id, name }) });

export const addCandidate = (name: string) =>
  api<Board>('/api/candidate/add', { method: 'POST', body: JSON.stringify({ name }) });

export const removeCandidate = (id: string) =>
  api<Board>('/api/candidate/remove', { method: 'POST', body: JSON.stringify({ id }) });

export const saveElection = (patch: Partial<Board['election']>) =>
  api<Board>('/api/election', { method: 'POST', body: JSON.stringify(patch) });

export const setStatus = (status: Status) =>
  api<Board>('/api/status', { method: 'POST', body: JSON.stringify({ status }) });

export const getAudit = (limit = 200) =>
  api<{ entries: AuditEntry[]; total: number }>(`/api/audit?limit=${limit}`);

export const reset = () =>
  api<Board>('/api/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) });

export const login = (pin: string) =>
  api<void>('/api/login', { method: 'POST', body: JSON.stringify({ pin }) });

export const logout = () => api<void>('/api/logout', { method: 'POST' });

export const clock = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function updatedLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return clock.format(at).replace(/\./g, ':');
}

export function percent(share: number) {
  if (!share) return '0%';
  return `${(share * 100).toFixed(share < 0.01 ? 1 : 0)}%`;
}
