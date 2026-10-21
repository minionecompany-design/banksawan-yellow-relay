# LAPORAN TAHAP 2 — BANKSAWAN YELLOW LAB (21 Oktober 2026)

## Status kerja

- Implementasi offline v0.2 selesai; tes Node **27/27 LULUS** (angka diperbarui jika hasil final berbeda).
- Produksi YELLOW GOLD **TIDAK BERUBAH**, tidak ada Railway LAB atau notifikasi live.
- APK **HOME-only source** tersedia, tetapi **APK instalasi belum terkompilasi**.

## Temuan 1H — BRUSDT dan WLDUSDT

**Bukti yang ada:** screenshot TradingView menampilkan segitiga A kuning pada TF 1H, sedangkan log YELLOW GOLD yang pernah diperiksa mencatat FCM **BRUSDT 5M (19 Oktober, 17:50 WIB)** dan **WLDUSDT 15M (20 Oktober, 19:30 WIB)**, bukan FCM 1H yang cocok pada jendela log tersebut. Saat ini tidak boleh dinyatakan 'backend pasti melewatkan A 1H'.

**Bukti yang belum ada untuk menentukan penyebab:** candle A 1H yang tepat dan **timestamp penutupan**, ticker Binance rolling 24h **pada waktu itu**, apakah simbol memang termasuk maksimum 50 terlacak, warm/cold snapshot 1H, kesiapan 5M/15M/1H, alasan penolakan evaluator, serta perbedaan `request.security` historis/realtime Pine.

**Hasil audit:** `UNVERIFIED / NEED_EXACT_1H_A_CANDLE` untuk keduanya; bukan bug terbukti. Filter 24H **+1% tetap**; membandingkan 0% / -2% baru boleh pada simulasi, bukan perubahan production.

## Temuan 1M — JCTUSDT, DOODUSDT, contoh lain

Screenshot JCT/DOOD dan LONGXIA, RAYSOL, APR, USELESS menunjukkan A segitiga kuning, B segitiga oranye di bawah candle, dan HOT berlian oranye di atas candle pada berbagai fase. **Jangan campur B dan HOT.** Gambar hanya bukti visual, bukan rekaman siap di-replay secara kausal.

**Hipotesis yang diuji:** LONG A **pertama** memulai episode; tidak boleh mengirim alert. Setelah PROTECT nyata, **LONG B pertama atau kedua** dalam 120 menit boleh diperiksa terhadap arah 5M dan harga tidak terlalu jauh dari A. Jika B1 lolos, B2 tidak mengirim ulang; jika keduanya gagal, diam. B3/HOT tidak menghasilkan alert.

**Yang BELUM terbukti dari screenshot:** waktu tepat A/B, jumlah B sejati di dalam 120 menit, harga A/B close saat event, ticker/coverage/binance pada waktu sinyal, dan MFE/MAE **setelah** B. **Tidak ada persentase keberhasilan atau angka ROI penelitian** yang layak dilaporkan sampai ada capture data asli, termasuk kandidat yang gagal.

## Perbaikan teknis v0.2

1. Referensi `scanner/src/reference/long-a.js` dan `parallel-long-a.js` SHA **identik dengan production pinned** (cek `PROVENANCE.json`). Ini bukan parity Pine historis.
2. B tanpa PROTECT ditolak; B1/B2 dibatasi satu pilihan; jendela 2 jam berbasis timestamp candle tertutup.
3. Observasi 120 candle setelah A wajib berurutan. Jika gap, boot tidak jelas, keluar dari universe top-50, data hilang, restart tidak bisa disambung secara aman => `INCOMPLETE`.
4. Nilai **MFE/MAE pasca-B** hanya dari candle **setelah** bar B, tanpa intrabar lookahead; data INCOMPLETE tidak masuk metrik full-window.
5. Ada replay CLI lokal. `SYNTHETIC-DEMO-ONLY.json` memang data buatan untuk uji mekanisme, bukan JCT/DOOD sungguhan.
6. Status API offline tetap `simulation:true`, HOME selalu kosong; APK hanya HOME dan menolak data simulasi sebagai live.

## Risiko / gerbang berikutnya

- **Belum ada data OHLCV historis as-of dan ticker 24h/cakupan untuk kasus nyata.** Jangan menyatakan 'JCT tertangkap', 'DOOD tertangkap', atau '1H cacat'.
- **Aturan price-chase 12% hanyalah ambang tes**, bukan batas strategi yang sudah divalidasi. Jangan mengoptimalkan berdasarkan hanya 6 grafik pemenang.
- Reducer saat ini **bukan collector produksi**: replay menerima data yang dideklarasikan terverifikasi oleh pengumpul hulu. Belum dibangun live feed, DB/volume, penyimpanan terjadwal, FCM, login API, atau rate-guard LAB.
- Pembuatan proyek Railway baru & deploy **HARUS** lewat persetujuan terpisah. Jangan menduplikasi mesin Binance atau mengubah GOLD untuk menambah coverage.
