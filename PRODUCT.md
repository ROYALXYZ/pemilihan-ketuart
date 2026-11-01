# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Vite + React (Tailwind CSS)

## Users
- Panitia/Admin TPS: Mencatat penambahan suara satu per satu saat surat suara fisik dibuka dan dibacakan saksi. Membutuhkan input cepat, minim klik keliru, dan tombol koreksi (undo).
- Warga RT: Melihat hasil penghitungan suara secara transparan via layar proyektor di pos RT atau lewat browser HP masing-masing.

## Product Purpose
Papan hitung suara digital (live tally board) untuk pemilihan Ketua RT luring. Memindahkan rekap plano kertas/papan tulis ke layar digital yang bersih, akurat, dan mudah dipantau secara real-time.

## Positioning
Bukan e-voting warga, melainkan digital live tally untuk pemilu fisik: surat suara tetap dicoblos di bilik suara kertas, pencatatan hasil plano dilakukan digital agar transparan, cepat, dan mencegah kesalahan hitung manual.

## Operating Context
- Lokasi: Balai warga / pos RT / lapangan. Riuh saat saksi membacakan suara per lembar.
- Perangkat: Laptop admin/operator (terhubung proyektor) + HP warga yang mengakses link publik.
- Potensi kendala: Sinyal internet fluktuatif di lokasi RT. Sistem wajib local-first (data tidak hilang jika offline).

## Capabilities and Constraints
- 6 Calon Ketua RT: nomor urut, nama, dan foto (diunggah operator, dikompresi otomatis di peramban; fallback inisial bila kosong).
- Metrik: Total Suara Masuk, Perolehan Tertinggi, dan waktu pembaruan terakhir.
- Mode Operator: input suara (+1 per klik atau tombol angka 1–6 anti-hold), koreksi −1, undo suara terakhir (Backspace/Ctrl+Z), unggah & crop foto calon (rasio 4:3, 1:1, 3:4), kelola calon (tambah/hapus/ganti nama), ubah info pemilihan, kunci penghitungan, reset data, dan dialog log audit aktivitas.
- Mode Publik (Proyektor & HP Warga): tampilan bersih tanpa tombol input, hanya angka, proporsi, foto calon full-bleed, dan penanda calon unggul.
- Real-time Sync: perubahan dari operator langsung tercermin di semua layar lewat SSE.
- Persistensi & Audit Server: state tersimpan atomik di `data/state.json` (dilengkapi `state.backup.json` tahan crash/mati lampu), foto di `data/photos/`, dan log audit append-only di `data/audit.log` yang dapat diunduh operator.

## Brand Commitments
- Bahasa: Santun, lugas, ramah warga (bukan birokratik kaku, bukan pula terlalu gaul).
- Tampilan: Simple minimalis, nomor urut & perolehan suara sangat mencolok (skala tipografi besar), warna penanda calon yang kontras namun elegan.

## Evidence on Hand
- 6 calon (placeholder).
- Sistem pemilu offline di TPS, rekapitulasi online.

## Product Principles
1. Keterbacaan Nomor & Angka (Legibility First): Angka perolehan dan nama calon terbaca jelas dari jarak 5 meter di proyektor.
2. Kebal Error Manusia (Foolproof Operator): Ada indikator visual saat suara bertambah, audio feedback opsional (klik/ding), dan tombol koreksi cepat.
3. Ketahanan Jaringan (Offline-first Fallback): Jika internet mati, penghitungan di laptop admin tetap berjalan normal tanpa macet.
