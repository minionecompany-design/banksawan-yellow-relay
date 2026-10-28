# BANKSAWAN YELLOW V16 — READ-ONLY SECOND SIGNAL 1M (staging only)

Tanggal: 28 Oktober 2026. **Jangan menyebar APK/debug build atau mengaktifkan rilis sebelum QA dan persetujuan pemilik.**

## Tujuan dan batasan produk
- Satu APK `id.banksawan.yellow`. LONG A dan FCM asli **1M, 5M, 15M, 1H wajib tetap aktif**, universe 50 maksimum, harga <10 USDT, CHG24H >+1%, quote volume24H >10M, TradingView unchanged.
- Second Signal hanya **1M**, memakai **candle native empat TF yang sudah disubscribe** oleh scanner lama. Nol koneksi Binance REST/WS baru dan nol sinyal/order/FCM tambahan.
- Status HOME kecil: `PANTAU` (WAIT), `PANTAU PRIORITAS` (PRIORITY), `HINDARI` (AVOID sticky untuk satu LONG A), atau `DATA TIDAK TERSEDIA` (OFF). Harga sejak LONG A hanya bila ticker fresh.
- **HIJAU, perintah ENTRY, TP1/SL dan persentase keberhasilan semuanya dinonaktifkan.** Modul penelitian v3/v4 dapat menghasilkan candidate GREEN internal, tetapi V16 NEVER promotes it to API or UI.

## Teknis dan alur
- `YELLOW_V16_WATCH_ONLY_ENABLED=true` harus **opt-in pada backend**, default false. `YellowV16WatchMonitor` murni CPU dan memori, tidak memiliki REST, WS, storage /data, FCM, atau exchange account.
- Setelah ledger menerima LONG A dan jalur `sendEvent` asli berjalan, monitor `capture` hanya untuk 1M. Sisa TF tidak dipindai oleh second-signal engine.
- Melalui `LiveAnalysisDelivery` yang sudah ada, close 1M diteruskan beserta native 5M/15M/1H yang tepat waktu. Risiko data hilang/late berakhir OFF. Jika stream recovery / proses restart, hasil lama tidak dipakai kembali. In-memory state hilang saat restart dan tidak direkonstruksi dari harga masa depan.
- V3/v4 `decideSecondSignal1m` digabung menjadi satu keputusan. Prioritas hanya aktif selama maksimal 5 menit sejak pembuktian continuation terakhir (harus diperbarui oleh clue baru); MERAH/HINDARI tetap di-latch untuk satu LONG A agar tidak bolak-balik. Tidak boleh menafsirkan HINDARI sebagai perkiraan aset pasti turun.
- `/api/home` menghias salinan event hanya saat flag aktif, dan hanya untuk TF1M. Original event ledger tidak dimutasi. Format `monitor1m` telah digerbang oleh `AnalysisSnapshot.monitor1m` di Android: exact event id, peristiwa 1M, batas 6 jam, data baru, tidak boleh entryAllowed atau level SL/TP.
- Di HOME, hanya satu baris status tambahan dan satu indikator keputusan. Badge/ANALISIS entry lama disembunyikan untuk event 1M ketika monitor V16 valid agar tidak ada dua penilaian yang bertentangan; empat TF LONG A dan shortcut TradingView tetap sama.
- Android `versionCode=16`, `versionName=0.16.0-v2-watch-only-1m`; package tetap `id.banksawan.yellow`; signing permanent PKCS12 asli wajib sama dengan V15 agar update in-place. Jangan ubah ke debug signing untuk distribusi.

## Kondisi riset sebenarnya
Pengamat hingga 20.00 WIB 28 Oktober berhenti 19.38 WIB dengan `EVENT_FEED_OR_STORAGE_FAULT` (akar teknis belum tercatat). Berhasil menerima 7 LONG A 1M, dua RED, nol PANTAU PRIORITAS, nol HIJAU, nol paper exits valid; seluruh 7 kasus censored oleh gangguan. **Tidak ada klaim bahwa status baru memprediksi profit.**
Riset collector sekarang dapat menyimpan `forward-fault.json` berisi alasan/error code berbatas panjang pada kejadian selanjutnya. Tidak mengubah bukti sebelumnya secara retroaktif.

## Release checklist — perlu keputusan manual
1. CI scanner, regression original LONG A 4TF, Android compile dan Robolectric, FCM isolation serta permanent signer guards harus **SUCCESS** pada head PR ini.
2. Review manual status dan jeda data, status sticky red, WebSocket restart/fail-closed, RAM/cpu dan 50-slot universe pada environment nonproduksi bila tersedia tanpa biaya baru.
3. Pertahankan produksi v15 hingga pemilik menyetujui peralihan. Sebelum backend flag aktif, APK V16 harus backward compatible (monitor tidak tampil, LONG A tetap berjalan).
4. Untuk rilis perangkat, minta approval eksplisit pemilik; sambungkan deploy feature flag V16 ke server production branch setelah PR dependencies selesai, siapkan signed APK asli, install/update manual dan uji notifikasi 4TF, deep link TradingView, HOME, analisis 1M, shutdown/error.
5. Bila signer permanen atau verifikasi versi asli V15 tidak tersedia, JANGAN menyebar APK yang tak dapat mengupdate app asli; hentikan dan laporkan.

**Status:** staged draft, belum merged, belum deploy, belum signed/released, APK perangkat belum berubah. Tetap **NO GO ENTRY V4 LIVE**.
