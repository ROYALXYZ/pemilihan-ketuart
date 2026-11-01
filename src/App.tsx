import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Vote,
  Radio,
  Lock,
  Unlock,
  RotateCcw,
  KeyRound,
  ShieldCheck,
  LogOut,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  History,
  AlertCircle,
  Trophy,
  Camera,
  Pencil,
  Plus,
  Trash2,
  Crop,
  FileText,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import {
  api,
  login,
  logout,
  vote,
  undo,
  setStatus,
  reset,
  uploadPhoto,
  removePhoto,
  setPhotoRatio,
  PHOTO_RATIO,
  getAudit,
  renameCandidate,
  addCandidate,
  removeCandidate,
  saveElection,
  updatedLabel,
  percent,
  type Board,
  type PhotoRatio,
  type AuditEntry,
} from '@/lib/api';

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const auditLabels: Record<AuditEntry['action'], string> = {
  server_start: 'Server dimulai',
  server_stop: 'Server dihentikan',
  server_error: 'Kesalahan server',
  vote_add: 'Suara ditambahkan',
  vote_subtract: 'Suara dikurangi',
  undo: 'Suara terakhir dibatalkan',
  reset: 'Perolehan suara direset',
  status_lock: 'Penghitungan dikunci',
  status_unlock: 'Penghitungan dibuka kembali',
  candidate_add: 'Calon ditambahkan',
  candidate_remove: 'Calon dihapus',
  candidate_rename: 'Nama calon diubah',
  photo_set: 'Foto diperbarui',
  photo_remove: 'Foto dihapus',
  photo_ratio: 'Rasio foto diubah',
  election_update: 'Informasi pemilihan diubah',
};

const auditDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Dimensi keluaran hasil potong, dijaga kecil agar unggahan tetap ringan. */
const CROP_OUTPUT: Record<PhotoRatio, { w: number; h: number }> = {
  landscape: { w: 800, h: 600 },
  square: { w: 720, h: 720 },
  portrait: { w: 600, h: 800 },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto tidak bisa dibaca. Coba file lain.'));
    img.src = src;
  });
}

async function cropToDataUrl(src: string, area: Area, ratio: PhotoRatio): Promise<string> {
  const image = await loadImage(src);
  const out = CROP_OUTPUT[ratio];
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Peramban ini tidak bisa mengolah foto.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.w, out.h);
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, out.w, out.h);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export function App() {
  const [board, setBoard] = useState<Board | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('rt-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [pulseCandidateId, setPulseCandidateId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetPhotoCandidate, setTargetPhotoCandidate] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropArea, setCropArea] = useState<Area | null>(null);
  const [photoRatio, setPhotoRatioDraft] = useState<PhotoRatio>('landscape');
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showElectionEdit, setShowElectionEdit] = useState(false);
  const [electionDraft, setElectionDraft] = useState({ title: '', subtitle: '', date: '' });
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState('all');
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const auditRequestRef = useRef(0);

  const boardRef = useRef<Board | null>(null);
  boardRef.current = board;

  const audioContextRef = useRef<AudioContext | null>(null);
  const fullscreenRequestRef = useRef(false);

  useEffect(() => {
    const syncFullscreen = () => {
      if (!document.fullscreenElement && !fullscreenRequestRef.current) setIsFullscreen(false);
    };
    const exitFallbackWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', exitFallbackWithEscape);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', exitFallbackWithEscape);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0b' : '#ffffff');
    };
    applyTheme();
    if (theme === 'system') {
      if (media.addEventListener) media.addEventListener('change', applyTheme);
      else media.addListener(applyTheme);
    }
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', applyTheme);
      else media.removeListener(applyTheme);
    };
  }, [theme]);

  const cycleTheme = () => {
    const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    setTheme(next);
    try {
      localStorage.setItem('rt-theme', next);
    } catch {
      // Tetap berfungsi selama sesi ini saat penyimpanan peramban diblokir.
    }
  };

  const loadAudit = useCallback(async () => {
    if (!isAdmin) return;
    const request = ++auditRequestRef.current;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const result = await getAudit(500);
      if (request === auditRequestRef.current) setAuditEntries(result.entries);
    } catch (err) {
      if (request === auditRequestRef.current) setAuditError((err as Error).message);
    } finally {
      if (request === auditRequestRef.current) setAuditLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) void loadAudit();
    else {
      setAuditEntries([]);
      setAuditError(null);
      setAuditLoading(false);
    }
    return () => { auditRequestRef.current += 1; };
  }, [isAdmin, showAudit, loadAudit]);

  // Segarkan hanya saat dialog terbuka; jangan bebani server tiap satu suara.
  useEffect(() => {
    if (isAdmin && showAudit) void loadAudit();
  }, [board?.updatedAt, isAdmin, showAudit, loadAudit]);

  // Play subtle feedback beep
  const playClickSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Audio might be blocked by browser policy before user interaction
    }
  }, [soundEnabled]);

  // Initial load & SSE connection
  useEffect(() => {
    let active = true;

    // Check existing state
    api<Board>('/api/state')
      .then((data) => {
        if (active) setBoard(data);
      })
      .catch(() => {
        if (active) setIsConnected(false);
      });

    // Check admin session
    api<{ admin: boolean }>('/api/session')
      .then((res) => {
        if (active) setIsAdmin(res.admin);
      })
      .catch(() => {});

    // SSE Stream
    const stream = new EventSource('/api/stream');

    stream.onopen = () => {
      setIsConnected(true);
    };

    stream.onmessage = (event) => {
      try {
        const nextBoard: Board = JSON.parse(event.data);
        setBoard(nextBoard);
        setIsConnected(true);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    stream.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      active = false;
      stream.close();
    };
  }, []);

  // Keyboard shortcut listener for Operator (keys 1 to 6)
  useEffect(() => {
    if (!isAdmin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore browser key-repeat so holding a number never records extra votes.
      if (e.repeat) return;
      const b = boardRef.current;
      if (!b || b.status === 'closed') return;

      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.closest('[role="dialog"], [data-theme-toggle]') || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (/^[1-6]$/.test(e.key)) {
        const candidateIndex = parseInt(e.key, 10) - 1;
        const candidate = b.candidates[candidateIndex];
        if (candidate) {
          e.preventDefault();
          handleAddVote(candidate.id);
        }
      } else if (e.key === 'Backspace' || (e.ctrlKey && e.key.toLowerCase() === 'z')) {
        if (b.log && b.log.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  const triggerPulse = (id: string) => {
    setPulseCandidateId(id);
    playClickSound();
    setTimeout(() => {
      setPulseCandidateId((prev) => (prev === id ? null : prev));
    }, 400);
  };

  const handleAddVote = async (candidateId: string) => {
    try {
      triggerPulse(candidateId);
      const updated = await vote(candidateId, 1);
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleSubtractVote = async (candidateId: string) => {
    try {
      const updated = await vote(candidateId, -1);
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleUndo = async () => {
    try {
      const updated = await undo();
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleToggleStatus = async () => {
    if (!board) return;
    const nextStatus = board.status === 'open' ? 'closed' : 'open';
    try {
      const updated = await setStatus(nextStatus);
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handlePhotoPick = (candidateId: string) => {
    setTargetPhotoCandidate(candidateId);
    fileInputRef.current?.click();
  };

  const openCropFor = (candidateId: string, source: string, ratio: PhotoRatio | null) => {
    setTargetPhotoCandidate(candidateId);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCropArea(null);
    setPhotoError(null);
    setPhotoRatioDraft(ratio || 'landscape');
    setCropSource(source);
  };

  const closeCrop = () => {
    if (cropSource?.startsWith('blob:')) URL.revokeObjectURL(cropSource);
    setCropSource(null);
    setCropArea(null);
    setPhotoError(null);
    setTargetPhotoCandidate(null);
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const candidateId = targetPhotoCandidate;
    event.target.value = '';
    if (!file || !candidateId) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setActionError('Format foto harus JPG, PNG, atau WEBP.');
      setTargetPhotoCandidate(null);
      return;
    }
    const ratio = boardRef.current?.candidates.find((c) => c.id === candidateId)?.photoRatio ?? 'landscape';
    openCropFor(candidateId, URL.createObjectURL(file), ratio);
  };

  const handleOpenRecrop = (candidateId: string) => {
    const candidate = boardRef.current?.candidates.find((c) => c.id === candidateId);
    if (!candidate?.photo) return;
    openCropFor(candidateId, candidate.photo, candidate.photoRatio);
  };

  const handleCropSave = async () => {
    if (!cropSource || !targetPhotoCandidate || !cropArea) {
      setPhotoError('Geser dan perbesar foto dulu, lalu simpan.');
      return;
    }
    setIsPhotoSaving(true);
    setPhotoError(null);
    try {
      const data = await cropToDataUrl(cropSource, cropArea, photoRatio);
      const updated = await uploadPhoto(targetPhotoCandidate, data, photoRatio);
      setBoard(updated);
      setActionError(null);
      closeCrop();
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setIsPhotoSaving(false);
    }
  };

  const handleRatioChange = async (candidateId: string, ratio: PhotoRatio) => {
    try {
      const updated = await setPhotoRatio(candidateId, ratio);
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const openElectionEdit = () => {
    if (!board) return;
    setElectionDraft({ ...board.election });
    setEditError(null);
    setShowElectionEdit(true);
  };

  const openCandidateEdit = (id: string, name: string) => {
    setEditingCandidateId(id);
    setCandidateName(name);
    setEditError(null);
  };

  const handleElectionSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!electionDraft.title.trim() || !electionDraft.subtitle.trim() || !electionDraft.date) {
      setEditError('Isi judul, keterangan, dan tanggal pemilihan.');
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await saveElection({
        title: electionDraft.title.trim(),
        subtitle: electionDraft.subtitle.trim(),
        date: electionDraft.date,
      });
      setBoard(updated);
      setShowElectionEdit(false);
      setActionError(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCandidateSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCandidateId || !candidateName.trim()) {
      setEditError('Isi nama calon.');
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await renameCandidate(editingCandidateId, candidateName.trim());
      setBoard(updated);
      setEditingCandidateId(null);
      setActionError(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCandidateAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!candidateName.trim()) {
      setEditError('Isi nama calon.');
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await addCandidate(candidateName.trim());
      setBoard(updated);
      setShowAddCandidate(false);
      setActionError(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCandidateRemove = async () => {
    if (!editingCandidateId) return;
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await removeCandidate(editingCandidateId);
      setBoard(updated);
      setEditingCandidateId(null);
      setActionError(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoRemove = async (id: string) => {
    try {
      const updated = await removePhoto(id);
      setBoard(updated);
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(pinInput);
      setIsAdmin(true);
      setShowLoginModal(false);
      setPinInput('');
    } catch (err) {
      setLoginError((err as Error).message);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsAdmin(false);
      setShowAudit(false);
      setShowElectionEdit(false);
      setShowAddCandidate(false);
      setEditingCandidateId(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleResetSubmit = async () => {
    if (resetConfirmInput !== 'RESET') {
      setActionError('Ketik RESET dengan huruf besar untuk mengonfirmasi.');
      return;
    }
    try {
      const updated = await reset();
      setBoard(updated);
      setShowResetConfirm(false);
      setResetConfirmInput('');
      setActionError(null);
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      if (document.documentElement.requestFullscreen) {
        // ponytail: Jika fullscreen native ditolak, tampilan ringkas tetap aktif sampai tombol keluar atau Esc.
        fullscreenRequestRef.current = true;
        void document.documentElement.requestFullscreen().catch(() => {}).finally(() => {
          fullscreenRequestRef.current = false;
        });
      }
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }
  };

  const downloadAudit = () => {
    if (!isAdmin || auditEntries.length === 0) return;
    const blob = new Blob([auditEntries.slice().reverse().map((entry) => JSON.stringify(entry)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log-aktivitas-${new Date().toISOString().slice(0, 10)}.jsonl`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!board) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Memuat papan penghitungan suara…</p>
        </div>
      </div>
    );
  }

  const leaderCandidate = board.candidates.find((c) => c.lead && c.votes > 0);
  const lastStart = isAdmin ? auditEntries.find((entry) => entry.action === 'server_start') : undefined;
  const sessionWarning = lastStart && (lastStart.note || lastStart.recoveredFromBackup === true) ? lastStart : null;
  const filteredAudit = auditFilter === 'all' ? auditEntries : auditEntries.filter((entry) => entry.action === auditFilter);
  const themeTitle = `Mode: ${theme === 'system' ? 'Ikut sistem' : theme === 'light' ? 'Terang' : 'Gelap'}. Klik untuk mengganti tema.`;
  const projectorGrid = board.candidates.length <= 3
    ? ['grid-cols-1 grid-rows-1', 'grid-cols-2 grid-rows-1', 'grid-cols-3 grid-rows-1'][Math.max(0, board.candidates.length - 1)]
    : board.candidates.length === 4 ? 'grid-cols-2 grid-rows-2'
    : board.candidates.length <= 6 ? 'grid-cols-3 grid-rows-2'
    : board.candidates.length <= 8 ? 'grid-cols-4 grid-rows-2'
    : 'grid-cols-4 grid-rows-3';

  return (
    <div className={isFullscreen ? 'flex h-screen h-dvh flex-col overflow-hidden bg-background text-foreground' : 'min-h-screen bg-muted/40 pb-12 transition-colors dark:bg-background'}>
      {/* Top Navigation Bar */}
      <header className={isFullscreen ? 'hidden' : 'sticky top-0 z-40 border-b bg-background/95 backdrop-blur-md'}>
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:h-16 sm:px-6 sm:py-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
                {board.election.title}
              </h1>
              <Badge
                variant={board.status === 'open' ? 'success' : 'secondary'}
                className="hidden sm:inline-flex"
              >
                <span
                  className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                    board.status === 'open' ? 'animate-pulse bg-primary' : 'bg-muted-foreground'
                  }`}
                />
                {board.status === 'open' ? 'Sedang berjalan' : 'Selesai & terkunci'}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{board.election.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live connection badge */}
            <div className="hidden items-center gap-1.5 text-xs sm:flex">
              <Radio
                className={`h-3.5 w-3.5 ${
                  isConnected ? 'animate-pulse text-primary' : 'text-destructive'
                }`}
              />
              <span className="text-muted-foreground">
                {isConnected ? 'Terhubung' : 'Terputus (Menghubungkan…)'}
              </span>
            </div>

            {/* Sound toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Matikan suara klik' : 'Nyalakan suara klik'}
              className="h-9 w-9"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-foreground" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>

            <Button
              type="button"
              data-theme-toggle
              variant="outline"
              size="icon"
              onClick={cycleTheme}
              title={themeTitle}
              aria-label={themeTitle}
              className="h-9 w-9"
            >
              {theme === 'system' ? (
                <span className="relative h-4 w-4" aria-hidden="true">
                  <Sun className="absolute left-0 top-0 h-3 w-3" />
                  <Moon className="absolute bottom-0 right-0 h-3 w-3" />
                </span>
              ) : theme === 'light' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Fullscreen proyektor button */}
            <Button
              variant="outline"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Keluar mode proyektor' : 'Tampilkan kartu calon dalam mode proyektor'}
              aria-label={isFullscreen ? 'Keluar mode proyektor' : 'Masuk mode proyektor'}
              className="h-9 w-9"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4 text-foreground" />
              ) : (
                <Maximize2 className="h-4 w-4 text-foreground" />
              )}
            </Button>

            {/* Admin entry / status */}
            {isAdmin ? (
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="hidden border-primary/40 bg-primary/5 text-primary md:inline-flex">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Operator Aktif
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground">
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  Keluar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLoginModal(true)}
                className="gap-1.5 text-xs font-semibold"
              >
                <KeyRound className="h-3.5 w-3.5" />
                Masuk Operator
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className={isFullscreen ? 'flex min-h-0 w-full flex-1 flex-col gap-2 px-3 py-2' : 'mx-auto max-w-7xl px-4 pt-6 sm:px-6'}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePhotoChange}
          aria-label="Pilih foto calon"
        />
        {/* Error notification alert */}
        {actionError && !isFullscreen && (
          <div role="alert" className="mb-6 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{actionError}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActionError(null)}
              className="h-7 text-xs text-destructive hover:bg-destructive/20"
            >
              Tutup
            </Button>
          </div>
        )}

        {/* Top Summary Metric Cards (Shadcn Stats Grid) */}
        <div className={isFullscreen ? 'hidden' : 'grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6'}>
          {/* Card 1: Total Suara Masuk */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Suara Masuk
              </CardTitle>
              <Vote className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {board.total}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Surat suara sah terhitung
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Calon Unggul */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Perolehan Tertinggi
              </CardTitle>
              <Trophy className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">
                {board.peak}
                <span className="ml-1 text-sm font-normal text-muted-foreground">suara</span>
              </div>
              <p className="mt-1 truncate text-xs font-medium text-foreground">
                {leaderCandidate ? `No. ${leaderCandidate.id} ${leaderCandidate.name}` : 'Belum ada suara'}
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Waktu Pembaruan */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Update Terakhir
              </CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {updatedLabel(board.updatedAt)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                WIB · Sinkron otomatis
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Admin Operational Strip (Tampil jika Admin Login) */}
        {isAdmin && !isFullscreen && (
          <Card className="mt-6 border-primary/30 bg-primary/5 shadow-xs">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                    OP
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">Panel Input Operator TPS</h4>
                    <p className="text-xs text-muted-foreground">
                      Ketuk tombol <strong>+1 Suara</strong> pada kartu calon. Tombol angka <kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold border shadow-xs">1</kbd>–<kbd className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold border shadow-xs">6</kbd> tetap bisa dipakai, tetapi <strong>menahan tombol tidak menambah suara</strong> — harus ditekan ulang setiap satu suara.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={openElectionEdit} className="gap-1.5 text-xs font-semibold">
                  <Pencil className="h-3.5 w-3.5" />
                  Ubah Informasi Pemilihan
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAudit(true)} className="gap-1.5 text-xs font-semibold">
                  <FileText className="h-3.5 w-3.5" />
                  Log Aktivitas
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUndo}
                  disabled={!board.log || board.log.length === 0 || board.status === 'closed'}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-destructive" />
                  Batalkan Terakhir (Undo)
                  <kbd className="hidden sm:inline-block rounded bg-muted px-1 font-mono text-[10px]">Backspace</kbd>
                </Button>

                <Button
                  variant={board.status === 'open' ? 'secondary' : 'default'}
                  size="sm"
                  onClick={handleToggleStatus}
                  className="gap-1.5 text-xs font-semibold"
                >
                  {board.status === 'open' ? (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      Kunci Penghitungan
                    </>
                  ) : (
                    <>
                      <Unlock className="h-3.5 w-3.5" />
                      Buka Kembali
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                  className="text-xs text-destructive hover:bg-destructive/10"
                >
                  Reset Data
                </Button>
              </div>
            </CardContent>
            {sessionWarning && (
              <CardContent className="pt-0">
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                   <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <div>
                    <p className="font-bold">Periksa data: sesi server sebelumnya tidak berakhir normal atau dipulihkan dari cadangan.</p>
                    <p className="mt-1 text-xs text-muted-foreground">{sessionWarning.note || 'Data dipulihkan dari berkas cadangan.'} Buka Log Aktivitas untuk memeriksa perubahan terakhir.</p>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Section: Grid Kartu Calon (Shadcn Dashboard Candidate Cards) */}
        <div className={isFullscreen ? 'flex min-h-0 flex-1 flex-col' : 'mt-6'}>
          <div className={isFullscreen ? 'hidden' : 'mb-4 flex flex-wrap items-end justify-between gap-3'}>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Daftar Calon Ketua RT</h2>
              <p className="text-xs text-muted-foreground">
                Perolehan suara terverifikasi dan proporsi suara masuk
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">{board.candidates.length} calon terdaftar</span>
              {isAdmin && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  setCandidateName('');
                  setEditError(null);
                  setShowAddCandidate(true);
                }}>
                  <Plus className="h-4 w-4" /> Tambah Calon
                </Button>
              )}
            </div>
          </div>

          <div className={isFullscreen ? `grid min-h-0 flex-1 gap-2 ${projectorGrid}` : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'}>
            {board.candidates.map((candidate, idx) => {
              const isPulsing = pulseCandidateId === candidate.id;
              const isLead = candidate.lead && candidate.votes > 0;

              return (
                <Card
                  key={candidate.id}
                   className={`relative flex flex-col gap-0 overflow-hidden border p-0 transition-all duration-200 ${isFullscreen ? 'min-h-0 min-w-0 justify-start' : 'justify-between'} ${
                    isPulsing
                      ? 'ring-2 ring-primary scale-[1.01] bg-primary/5'
                      : isLead
                      ? 'border-primary/50 shadow-sm bg-card'
                      : 'border-border/80 bg-card hover:border-border'
                  }`}
                >
                  {/* Top indicator bar for leading candidate */}
                  {isLead && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                  )}

                  <div
                     className={isFullscreen ? 'relative min-h-0 w-full flex-1 overflow-hidden bg-muted' : 'relative w-full overflow-hidden bg-muted'}
                     style={isFullscreen ? undefined : { aspectRatio: String(PHOTO_RATIO[candidate.photoRatio ?? 'landscape']) }}
                  >
                    {candidate.photo ? (
                      <img
                        src={candidate.photo}
                        alt={`Foto ${candidate.name}`}
                        loading="lazy"
                        className="h-full w-full object-cover object-center transition-transform duration-300 hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted">
                        <span className="text-5xl font-black tracking-tight text-muted-foreground/50">
                          {initials(candidate.name)}
                        </span>
                         <span className={isFullscreen ? 'hidden' : 'text-[11px] font-medium text-muted-foreground'}>Foto belum diunggah</span>
                      </div>
                    )}
                     <span className={`absolute rounded-md bg-foreground px-2.5 py-1 text-sm font-bold tabular-nums text-background shadow-sm ${isFullscreen ? 'left-2 top-2' : 'left-4 top-4'}`}>
                      No. {candidate.id}
                    </span>
                     {!isFullscreen && candidate.photo?.startsWith('/candidates/') && (
                      <span className="absolute right-3 top-4 rounded bg-background/95 px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm">
                        Foto contoh
                      </span>
                    )}
                     {isAdmin && !isFullscreen && (
                      <button
                        type="button"
                        onClick={() => handlePhotoPick(candidate.id)}
                        title={`Atur foto ${candidate.name}`}
                        aria-label={`Atur foto ${candidate.name}`}
                         className="absolute inset-0 flex items-center justify-center bg-foreground/55 text-background opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:opacity-100 dark:bg-background/70 dark:text-foreground"
                      >
                        <span className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
                          <Camera className="h-4 w-4" />
                          {candidate.photo ? 'Ganti foto' : 'Unggah foto'}
                        </span>
                      </button>
                    )}
                  </div>
                   <CardHeader className={isFullscreen ? 'min-w-0 shrink-0 px-3 pt-2 pb-1' : 'px-6 pt-6 pb-3'}>
                     <div className="flex items-start justify-between gap-2">
                       <div className="min-w-0">
                          <CardTitle className={isFullscreen ? 'truncate text-base font-bold leading-tight lg:text-lg' : 'text-lg font-bold leading-snug sm:text-xl'} title={isFullscreen ? candidate.name : undefined}>{candidate.name}</CardTitle>
                          {!isFullscreen && <CardDescription className="text-xs">Nomor urut {candidate.id}</CardDescription>}
                       </div>
                        {isLead && !isFullscreen && (
                         <Badge variant="default" className="shrink-0 gap-1 text-[11px] font-bold">
                           <Trophy className="h-3 w-3" /> Memimpin
                         </Badge>
                       )}
                     </div>
                   </CardHeader>

                   <CardContent className={isFullscreen ? 'shrink-0 px-3 pb-2' : 'space-y-4 px-6 pb-6'}>
                    {/* Giant Vote Number */}
                     <div className={isFullscreen ? 'flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-2 py-0.5' : 'flex items-baseline justify-between rounded-lg bg-muted/50 p-3'}>
                       <span className={isFullscreen ? 'truncate text-sm font-semibold text-muted-foreground' : 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'}>
                        Perolehan Suara
                      </span>
                      <div className="text-right">
                        <span
                           className={`font-mono font-black tabular-nums tracking-tight ${isFullscreen ? 'text-3xl lg:text-4xl' : 'text-3xl sm:text-4xl'} ${
                            isLead ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {candidate.votes}
                        </span>
                         <span className={isFullscreen ? 'hidden' : 'ml-1 text-xs text-muted-foreground font-sans'}>
                          suara
                        </span>
                      </div>
                    </div>

                    {/* Progress Percentage Share */}
                     <div className={isFullscreen ? 'hidden' : 'space-y-1.5'}>
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Proporsi Suara</span>
                        <span className="font-mono font-bold text-foreground">
                          {percent(candidate.share)}
                        </span>
                      </div>
                      <Progress
                        value={candidate.share * 100}
                        className="h-2"
                        indicatorClassName={isLead ? 'bg-primary' : 'bg-foreground/70'}
                      />
                    </div>
                  </CardContent>

                  {/* Operator Controls inside Candidate Card */}
                   {isAdmin && !isFullscreen && (
                     <div className="border-t bg-muted/30 p-3 pt-3">
                       <div className="mb-3 flex flex-wrap gap-2">
                         <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openCandidateEdit(candidate.id, candidate.name)}>
                           <Pencil className="h-3.5 w-3.5" /> Ubah Nama
                         </Button>
                         <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handlePhotoPick(candidate.id)}>
                           <Camera className="h-3.5 w-3.5" /> {candidate.photo ? 'Ganti Foto' : 'Unggah Foto'}
                         </Button>
                         {candidate.photo && (
                           <>
                             <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenRecrop(candidate.id)}>
                               <Crop className="h-3.5 w-3.5" /> Atur Potongan
                             </Button>
                             <Button variant="ghost" size="sm" onClick={() => handlePhotoRemove(candidate.id)}>
                               Hapus Foto
                             </Button>
                           </>
                         )}
                       </div>
                       <div className="mb-3 flex flex-wrap items-center gap-1.5">
                         <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rasio</span>
                         {(['landscape', 'square', 'portrait'] as PhotoRatio[]).map((ratio) => (
                           <Button
                             key={ratio}
                             size="sm"
                             variant={(candidate.photoRatio ?? 'landscape') === ratio ? 'default' : 'outline'}
                             className="h-7 px-2 text-[11px] font-semibold"
                             onClick={() => handleRatioChange(candidate.id, ratio)}
                             aria-pressed={(candidate.photoRatio ?? 'landscape') === ratio}
                           >
                             {ratio === 'landscape' ? '4:3' : ratio === 'square' ? '1:1' : '3:4'}
                           </Button>
                         ))}
                       </div>
                       <div className="flex items-center gap-2">
                        <Button
                          className="flex-1 font-bold shadow-xs transition-transform active:scale-95"
                          size="default"
                          disabled={board.status === 'closed'}
                          onClick={() => handleAddVote(candidate.id)}
                        >
                          +1 Suara
                           {idx < 6 && <kbd className="ml-1.5 rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-xs font-semibold">{idx + 1}</kbd>}
                        </Button>

                        <Button
                          variant="outline"
                          size="icon"
                          disabled={board.status === 'closed' || candidate.votes === 0}
                          onClick={() => handleSubtractVote(candidate.id)}
                          title={`Kurangi 1 suara untuk ${candidate.name}`}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                        >
                          −1
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {isFullscreen && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-1 text-sm">
            <span className="shrink-0 font-bold tabular-nums">{board.total} suara masuk</span>
            <span className={board.status === 'open' ? 'shrink-0 font-semibold text-primary' : 'shrink-0 font-semibold text-muted-foreground'}>
              {board.status === 'open' ? 'Berjalan' : 'Terkunci'}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Memimpin: <strong className="text-foreground">{leaderCandidate?.name ?? 'Belum ada'}</strong></span>
            <span className="shrink-0 text-muted-foreground">{updatedLabel(board.updatedAt)} WIB</span>
            <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen} title="Keluar mode proyektor (Esc)" aria-label="Keluar mode proyektor" className="shrink-0 gap-1.5">
              <Minimize2 className="h-4 w-4" /> Keluar
            </Button>
          </div>
        )}

        {/* Section: Activity Audit Log (Riwayat Input Terakhir) */}
        {!isFullscreen && board.log && board.log.length > 0 && (
          <Card className="mt-8 border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Riwayat Pembacaan Suara Terakhir
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-xs">
                  {board.log.length} Aktivitas
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {board.log.map((entry, i) => (
                  <div
                    key={`${entry.at}-${i}`}
                    className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {new Date(entry.at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span className="font-semibold text-foreground">
                      +1 untuk No. {entry.id} ({entry.name})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <footer className={isFullscreen ? 'hidden' : 'mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 text-xs text-muted-foreground sm:flex-row'}>
          <p>
            {board.election.title} · {board.election.subtitle} · Pelaksanaan{' '}
            {formatDate(board.election.date)}
          </p>
          <span>Sistem Hitung Cepat RT</span>
        </footer>
      </main>

      <Dialog open={showAudit && isAdmin} onOpenChange={setShowAudit}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Log Aktivitas (Khusus Operator)
            </DialogTitle>
            <DialogDescription>Jejak perubahan dan kejadian server terbaru, dalam waktu WIB. Menampilkan hingga 500 entri terakhir.</DialogDescription>
          </DialogHeader>

          {sessionWarning && (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
               <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="font-bold">Perhatian: periksa kembali data suara.</p>
                {sessionWarning.note && <p className="mt-1">{sessionWarning.note}</p>}
                {sessionWarning.recoveredFromBackup === true && <p className="mt-1">Data dipulihkan dari berkas cadangan.</p>}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1.5">
              <Label htmlFor="audit-action" className="text-xs">Saring tindakan</Label>
              <select id="audit-action" value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="all">Semua tindakan</option>
                {Object.entries(auditLabels).map(([action, label]) => (
                  <option key={action} value={action}>{label}</option>
                ))}
              </select>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadAudit()} disabled={auditLoading} className="gap-1.5">
              <RefreshCw className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} /> Segarkan
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadAudit} disabled={auditLoading || auditEntries.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" /> Unduh JSONL
            </Button>
          </div>
          {auditError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Gagal memuat log: {auditError}</p>}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {auditLoading ? 'Memuat aktivitas…' : `${filteredAudit.length} aktivitas ditampilkan${auditFilter === 'all' ? '' : ' setelah disaring'}.`}
          </p>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {!auditLoading && filteredAudit.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {auditError ? 'Log belum dapat ditampilkan. Coba segarkan.' : 'Tidak ada aktivitas untuk saringan ini.'}
              </p>
            )}
            {filteredAudit.map((entry) => (
              <div key={entry.seq} className="rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold text-foreground">{auditLabels[entry.action] ?? entry.action}</span>
                  <time dateTime={new Date(entry.at).toISOString()} className="text-xs tabular-nums text-muted-foreground">
                    {auditDate.format(entry.at)} WIB
                  </time>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {(entry.candidateName || entry.candidateId) && <span>Calon: {entry.candidateName || `No. ${entry.candidateId}`}{entry.candidateName && entry.candidateId ? ` (No. ${entry.candidateId})` : ''}</span>}
                  {entry.votesAfter !== undefined && <span>Suara calon setelah: <strong className="text-foreground">{entry.votesAfter}</strong></span>}
                  {entry.totalAfter !== undefined && <span>Total setelah: <strong className="text-foreground">{entry.totalAfter}</strong></span>}
                </div>
                {entry.note && <p className="mt-2 text-xs text-muted-foreground">{entry.note}</p>}
                 {entry.recoveredFromBackup === true && <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Data dipulihkan dari cadangan.</p>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Unduhan berisi entri yang dimuat (maksimal 500), termasuk yang tersembunyi oleh saringan.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={showElectionEdit && isAdmin} onOpenChange={(open) => { if (!isSaving) setShowElectionEdit(open); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Informasi Pemilihan</DialogTitle>
            <DialogDescription>Informasi ini tampil di bagian atas dan bawah papan penghitungan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleElectionSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="election-title">Judul pemilihan</Label>
              <Input id="election-title" required value={electionDraft.title} onChange={(e) => setElectionDraft({ ...electionDraft, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="election-subtitle">Keterangan</Label>
              <Input id="election-subtitle" required value={electionDraft.subtitle} onChange={(e) => setElectionDraft({ ...electionDraft, subtitle: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="election-date">Tanggal pelaksanaan</Label>
              <Input id="election-date" type="date" required value={electionDraft.date} onChange={(e) => setElectionDraft({ ...electionDraft, date: e.target.value })} />
            </div>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setShowElectionEdit(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan…' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddCandidate && isAdmin} onOpenChange={(open) => { if (!isSaving) setShowAddCandidate(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Calon</DialogTitle>
            <DialogDescription>Masukkan nama calon. Foto dapat diunggah setelah calon ditambahkan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCandidateAdd} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-candidate-name">Nama calon</Label>
              <Input id="new-candidate-name" required value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
            </div>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => setShowAddCandidate(false)}>Batal</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Menambahkan…' : 'Tambah Calon'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingCandidateId !== null && isAdmin} onOpenChange={(open) => { if (!open && !isSaving) setEditingCandidateId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Calon No. {editingCandidateId}</DialogTitle>
            <DialogDescription>Ubah nama atau hapus calon dari daftar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCandidateSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-candidate-name">Nama calon</Label>
              <Input id="edit-candidate-name" required value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
            </div>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="destructive" disabled={isSaving} onClick={handleCandidateRemove} className="gap-1.5">
                <Trash2 className="h-4 w-4" /> Hapus Calon
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={isSaving} onClick={() => setEditingCandidateId(null)}>Batal</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Menyimpan…' : 'Simpan Nama'}</Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Login Modal Dialog */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Masuk Operator TPS
            </DialogTitle>
            <DialogDescription>
              Masukkan PIN Panitia Pemilihan untuk mengakses tombol pencatatan suara.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLoginSubmit} className="space-y-4 pt-2">
            {loginError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive">
                {loginError}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pin-input">PIN Panitia</Label>
              <Input
                id="pin-input"
                type="password"
                maxLength={64}
                placeholder="Masukkan PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                className="text-center font-mono text-xl tracking-widest"
              />
              <p className="text-[11px] text-muted-foreground">
                PIN diatur panitia melalui variabel <code className="text-xs">ADMIN_PIN</code> di server.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setShowLoginModal(false)}>
                Batal
              </Button>
              <Button type="submit">
                Masuk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Konfirmasi Reset Seluruh Suara
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan mengosongkan seluruh perolehan suara semua calon menjadi 0 dan menghapus riwayat input terakhir di papan. Log audit operator tetap disimpan sebagai arsip.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Untuk mencegah klik tidak sengaja, ketik kata <strong className="font-mono text-destructive">RESET</strong> di bawah:
            </p>
            <Input
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder="Ketik RESET"
              className="font-mono uppercase"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowResetConfirm(false);
                setResetConfirmInput('');
              }}
            >
              Batalkan
            </Button>
            <Button
              variant="destructive"
              disabled={resetConfirmInput !== 'RESET'}
              onClick={handleResetSubmit}
            >
              Kosongkan Semua Suara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Atur Rasio & Potong Foto Calon */}
      <Dialog
        open={cropSource !== null && isAdmin}
        onOpenChange={(open) => {
          if (!open && !isPhotoSaving) closeCrop();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Atur &amp; Potong Foto Calon No. {targetPhotoCandidate}</DialogTitle>
            <DialogDescription>
              Pilih rasio aspek, lalu geser atau perbesar foto agar pas di kartu dashboard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rasio Aspek
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'landscape' as PhotoRatio, label: '4:3', desc: 'Lanskap' },
                  { id: 'square' as PhotoRatio, label: '1:1', desc: 'Persegi' },
                  { id: 'portrait' as PhotoRatio, label: '3:4', desc: 'Potret' },
                ].map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={photoRatio === item.id ? 'default' : 'outline'}
                    className="h-auto flex-col items-start gap-0.5 py-2 text-left"
                    onClick={() => setPhotoRatioDraft(item.id)}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-[10px] opacity-80">{item.desc}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-zinc-950 sm:h-80">
              {cropSource && (
                <Cropper
                  image={cropSource}
                  crop={crop}
                  zoom={zoom}
                  aspect={PHOTO_RATIO[photoRatio]}
                  onCropChange={setCrop}
                  onCropComplete={(_, croppedPixels) => setCropArea(croppedPixels)}
                  onZoomChange={setZoom}
                  showGrid
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/60 p-3">
              <div className="flex min-w-[200px] flex-1 items-center gap-3">
                <Label htmlFor="crop-zoom" className="shrink-0 text-xs font-semibold">
                  Perbesar
                </Label>
                <input
                  id="crop-zoom"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full cursor-pointer accent-primary"
                />
                <span className="w-10 text-right font-mono text-xs">{zoom.toFixed(1)}x</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setZoom(1);
                    setCrop({ x: 0, y: 0 });
                  }}
                >
                  Reset Posisi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Pilih Berkas Lain
                </Button>
              </div>
            </div>

            {photoError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {photoError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" disabled={isPhotoSaving} onClick={closeCrop}>
              Batal
            </Button>
            <Button type="button" disabled={isPhotoSaving} onClick={handleCropSave} className="gap-2">
              {isPhotoSaving ? 'Menyimpan…' : 'Terapkan & Simpan Foto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
