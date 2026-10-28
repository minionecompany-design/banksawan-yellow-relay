# BANKSAWAN YELLOW — V4 CONTINUATION 1M: RILIS RISET DAN HASIL REPLAY
**Tanggal:** 28 Oktober 2026 WIB | **Status:** OFFLINE / DRAFT / NO-DEPLOY

## Keputusan ringkas
Lanjutkan penelitian *PANTAU PRIORITAS* yang benar-benar berbeda dari lampu HIJAU untuk ENTER. **NO-GO untuk rilis ENTRY V4** saat ini. CI sukses bukan bukti strategi bisa menghasilkan profit; replay v4 tetap menghasilkan **0 konfirmasi ENTRY** pada 28 LONG A 1M. Kode dibangun langsung dalam GitHub agar Work nanti tidak perlu mengulang, sambil menjaga backend/APK LIVE v15 tetap utuh.

## Acuan kode dan run
- Repo: `minionecompany-design/banksawan-yellow-relay`.
- PR penelitian baru #28 (`feat/yellow-v4-continuation-1m-offline-20261028`), base PR #27, draft.
- Production source Railway tetap `112023d50ad297eba36b9acd539450fc53ce2de3`; tidak ada perubahan Railway/FCM/Android/Pine.
- Engine V3 sebelumnya tetap utuh, V4 baru di `scanner/src/entry-continuation-v4.js`, dijalankan **hanya** pada replay yang menguji LONG A 1M. Snapshot konteks 1M/5M/15M/1H memakai candle tertutup sesuai waktu; tidak ada panggilan API Binance atau streaming baru.
- Perbandingan kode: `scanner/scripts/compare-continuation-v4.mjs docs/evidence/entry-v3-20261028/manifest.json` (membandingkan V3+V4 dengan candle yang sama, SHA256 sumber diperiksa) dan `scanner/scripts/lib/replay-continuation-v4.mjs`.
- GitHub Actions replay awal SHA `9f32e46e0de721ba34d7a828db7fb6ac96dfb0ce` dan tes commit `5d1cec21f5027ceafa5785000cb06d72e6b1f020` (run **40618200027**); scanner **285/285** lulus, ditambah tes kontrak dan Python signing guards; Android job dan release status wajib dilihat dari GitHub saat audit.
- Artifak replay bernama `yellow-continuation-v4-research-comparison` berisi `v3-v4-full.json` seluruh event dan `summary.json`; retensi GitHub Actions umumnya 14 hari.

## Temuan replay (arsip, bukan out-of-sample)
- 46 arsip yang cocok dan hash tervalidasi; 28 LONG A 1M diuji; 16 5M dan 2 15M keluar cakupan tetapi tidak dihapus. 3 kejadian lain tanpa file candle lengkap disebutkan sebagai missing (NOM1M, NOM5M, INJ5M). **15/28** jendela 6 jam lengkap, **13/28** tersensor.
- Baseline V3: **1** konfirmasi candle PULLBACK, posisi paper `NOT_ENTERED`. **0** konfirmasi CONTINUATION, 0 transaksi terisi.
- Candidate V4 3-bar staircase: **0** konfirmasi entry, 0 transaksi terisi, 0 priced TP1/SL. **Tidak ada bukti meningkatkan kualitas entry**.
- Riset struktur: **18 dari 28 kejadian** sempat memenuhi bentuk continuation tiga candle, meski belum memenuhi seluruh syarat risiko/ruang resistance. Alasan penolakan per **candle, bukan per event**: 7.721 `WAIT_STAIR_STEP_BREAKOUT`, 23 `RESISTANCE_ROOM` (resistance diketahui tapi terlalu dekat), 8 `UNKNOWN_OVERHEAD_RESISTANCE`, 6 `SUPPORTING_TF_NOT_READY`, 7 `RISK_DISTANCE`; 15 `WATCH_WINDOW_ENDED`. Angka per candle dapat berulang pada event sama.
- **PANTAU PRIORITAS** baru dicatat saat pola continuation lulus, konteks dan risk pass, tetapi **resistance di atas harga TIDAK TERKETAHUI** sehingga rencana entry HARUS tetap ditolak. Ini label **observasi**, bukan lampu GREEN, bukan order, tidak ada klaim peluang profit.

| Event ID (masing-masing spesifik) | PANTAU PRIORITAS pertama sejak LONG A | Return ketika pertama tertandai | Maksimum HIGH berikutnya dibanding harga tanda | Kelengkapan 6 jam |
|---|---:|---:|---:|---|
| `EVAAUSDT:1m:1793121060000:LONG_A` | +36 menit | +5,35570% | +23,51892% | Lengkap |
| `AINUSDT:1m:1793080560000:LONG_A` | +112 menit | +11,11111% | +18,94410% | Lengkap |
| `REZUSDT:1m:1793087640000:LONG_A` | +292 menit | +8,62882% | +0,15094% | **Tersensor** |

**Interpretasi jujur:** status PANTAU memberi dua contoh yang masih berlanjut naik, sekaligus satu contoh yang tidak banyak berlanjut. Angka subsequent-high adalah evaluasi dari **masa depan setelah timestamp tanda** dan hanya dipakai untuk audit, BUKAN masukan label. Tidak ada bukti transaksi dapat dilakukan pada harga snapshot tersebut. **2/3 bukan win rate**: data kecil, pilihan hipotesis dipengaruhi pengamatan sebelumnya, event berkorelasi, outcome REZ tersensor, tidak ada spread/execution/fresh-ticker.

## Kritik teknis terpenting
1. **Room resistance merupakan bottleneck.** V4 melihat 18 peristiwa berpola, tetapi tidak mengonfirmasi entry. Dari 31 observasi candle yang lolos pola untuk penolakan room, 23 punya resistance terlalu dekat; 8 tidak punya overhead resistance terukur. Menyatakan `unknown resistance = aman` agar banyak GREEN adalah keliru.
2. **Pemantauan dan keputusan entry harus dipisahkan.** Penandaan struktur bisa muncul lebih awal (EVAA 36m) tanpa menyatakan aman untuk membuka posisi. HOME nantinya tetap sederhana: lampu TUNGGU ditambah alasan `PANTAU PRIORITAS` hanya jika tervalidasi pada data baru; semua entry/SL/TP di ANALISIS.
3. **First dip tidak boleh langsung RED.** PR #27 memperlihatkan RED dapat terlambat dan JCT tetap bisa pulih. Perbaikan red dini harus diuji false-negative/false-red, bukan dicampur dengan aturan continuation.
4. **Persentase 24H pada t0 belum tersedia di arsip candle.** Return-sejak-A dihitung dari close candle; itu bukan ticker realtime as-of. Belum bisa mengukur apakah persen CHG 24H meningkatkan probabilitas. Jangan menambahkan angka 'chance naik' di UI.
5. **Tanpa quote as-of, tidak bisa merekonstruksi GREEN historis yang sah.** V4 memerlukan quote dengan timestamp sesudah konfirmasi, memenuhi volume dan CHG 24H, serta harga dalam zona entry. Paper fill memakai asumsi next-full-minute open dan 14bps, tidak menggambarkan posisi sungguhan.

## Langkah berikutnya untuk penelitian independen
A. Audit kasus yang belum tertangkap dari `v3-v4-full.json`, terutama false watch priority, missed continuation, pengaruh volume relatif, native context dan room resistance; jangan sesuaikan threshold sekadar agar AIN/EVAA lolos lalu klaim sukses.

B. Validasi hipotesis WATCH PRIORITY pada **periode prospektif yang belum dilihat**, semua LONG A 1M, termasuk yang tidak naik dan candle data bolong. Rekam waktu alarm, return setelahnya, false positive, drawdown, fill rate, sample independen. Perbaiki model prioritas bila secara statistik memperbaiki ranking kandidat yang dipantau, dengan pengujian blind.

C. Untuk entri, rumus stop/target dan overhead resistance perlu diteliti dengan ukuran ketidakpastian. Jangan membuang keselamatan hanya karena belum ada GREEN. Pastikan tick size, slippage, fee, data as-of dan tidak ada penilaian menggunakan future data.

D. Bila hasil prospektif benar-benar membaik, rancang implementasi persisted watch/QA Android untuk satu lampu saja, dengan perubahan return-sejak-A sebaris di HOME dan rincian di ANALISIS. **Perlu keputusan pemilik tersendiri untuk merge, deploy Railway atau rilis APK.**

**Release decision as-of this report:** **NO-GO ENTRY V4 LIVE**. Pertahankan v15 LIVE; semua eksperimen PR #25–#28 tetap DRAFT.
