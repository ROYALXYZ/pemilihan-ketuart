---
name: Pemilihan Ketua RT Dashboard
description: Papan hitung suara pemilihan RT berbasis shadcn/ui dan Tailwind CSS
colors:
  primary: "#15803d"
  primary-foreground: "#f0fdf4"
  neutral-bg: "#ffffff"
  neutral-card: "#ffffff"
  neutral-text: "#18181b"
  neutral-muted: "#f4f4f5"
  neutral-muted-text: "#71717a"
  border: "#e4e4e7"
  destructive: "#ef4444"
typography:
  display:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    lineHeight: "1.1"
  body:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: Pemilihan Ketua RT Dashboard

## Overview

**Creative North Star: "Papan Balai Warga Modern"**

Antarmuka dashboard shadcn/ui yang dirancang khusus untuk keterbacaan instan di layar proyektor balai warga maupun layar ponsel pintar. Mengutamakan hierarki angka perolehan suara di atas segala ornamen visual, dengan status live yang jelas dan kontrol operator TPS yang kebal salah klik.

**Key Characteristics:**
- Tipografi Archivo dengan angka tabular (`tabular-nums`) tebal dan tegas.
- Kartu kandidat dengan avatar foto/inisial, lencana nomor urut, dan bilah proporsi visual.
- Aksen hijau daun untuk status aktif dan kandidat unggul.
- Pintasan keyboard 1–6 untuk kecepatan input operator.

## Colors

Palet netral bersih bergaya shadcn zinc dengan aksen tunggal hijau daun untuk integritas data.

### Primary
- **Daun Pemilu** (`#15803d`): Digunakan khusus untuk aksi penambahan suara, status live counting, dan penanda kandidat dengan suara terbanyak.

### Neutral
- **Putih Bersih** (`#ffffff`): Latar kartu dan panel utama.
- **Tinta Arang** (`#18181b`): Teks utama, judul, dan angka suara.
- **Abu Redup** (`#71717a`): Label sekunder, keterangan nomor urut, dan status pendukung.
- **Garis Batas** (`#e4e4e7`): Pembatas kartu dan tabel halus.

### Named Rules
**The Single Accent Rule.** Warna hijau hanya muncul pada status aktif, tombol input suara, dan indikator pemenang. Tidak ada warna lain selain merah untuk pembatalan/bahaya.

## Typography

**Display Font:** Archivo Variable (sans-serif)
**Body Font:** Archivo Variable (sans-serif)

### Hierarchy
- **Display** (800, 2.25rem - 3rem, 1.1): Angka perolehan suara total dan suara calon.
- **Headline** (700, 1.125rem, 1.25): Nama calon dan judul bagian.
- **Body** (400, 0.875rem, 1.5): Teks deskripsi dan instruksi operator.
- **Label** (600, 0.75rem, uppercase, 0.05em): Label metrik dan header kartu.

## Layout

Grid adaptif 1 kolom di ponsel pintar, 2 kolom di tablet, dan 3 kolom di layar desktop/proyektor. Header sticky menampung status koneksi SSE dan tombol proyektor layar penuh.

## Elevation & Depth

Desain mengutamakan border halus 1px (`border-border`) dengan bayangan tipis (`shadow-xs` / `shadow-sm`). Kartu kandidat yang memimpin diberi ring aksen halus.

## Shapes

Sudut melengkung konsisten `rounded-xl` (12px) untuk kartu, `rounded-md` (8px) untuk tombol dan lencana, serta avatar foto berbingkai melengkung.

## Components

### Buttons
- **Shape:** `rounded-md` (8px)
- **Primary:** Latar hijau `#15803d`, teks putih, padding 8px 16px dengan kbd hint angka.
- **Outline / Ghost:** Latar transparan dengan border halus untuk aksi sekunder.

### Cards
- **Shape:** `rounded-xl` (12px) dengan padding 24px, border 1px solid `#e4e4e7`.
- **Interaksi:** Hover halus dan ring pulse saat suara bertambah.

### Avatar
- **Shape:** Ukuran 56x56px (`size-14`) dengan `rounded-xl`, memuat foto calon atau inisial nama kontras tinggi.

## Do's and Don'ts

### Do:
- **Do** gunakan `tabular-nums` untuk semua angka suara agar tata letak tidak bergeser saat angka bertambah.
- **Do** berikan umpan balik visual instan saat operator mengklik tombol atau menekan keyboard 1–6.
- **Do** sediakan tombol pembatalan (Undo) yang selalu terlihat saat operator login.

### Don't:
- **Don't** gunakan gradien warna-warni atau grafik rumit yang menyulitkan pembacaan dari jarak jauh.
- **Don't** izinkan penonton publik mengubah data pemilihan tanpa autentikasi PIN operator.
