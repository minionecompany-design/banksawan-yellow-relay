# BANKSAWAN YELLOW V2 — BUKTI DAN GERBANG RILIS

Tanggal fondasi: 15 Oktober 2026 (WIB). Status: **OFFLINE RESEARCH ONLY**.

## 1. Kontrak fitur yang tidak boleh berubah tanpa persetujuan
- APK kedua dengan identitas `id.banksawan.yellow` dan ikon 1K yang disediakan user.
- Hanya dua tab: **HOME** dan **UNIVERSE**. Masing-masing kartu memiliki shortcut ke TradingView Binance perpetual symbol.
- Universe: Binance USD-M USDT PERPETUAL TRADING, **harga <10 USDT**, perubahan 24h dari ticker Binance **>=+1%**. **>=+5%** hanya label prioritas.
- LONG A pada empat timeframe **1M / 5M / 15M / 1H PARALLEL**. Satu sinyal valid cukup untuk satu event; tidak menunggu LONG A dari timeframe lain. Kondisi MTF *di dalam masing-masing formula* Pine tetap ada.
- Semua sinyal memakai candle **tertutup**. Status tanpa kelengkapan dan kesegaran data bukan sinyal.
- HOME menampilkan **satu kartu per simbol** sejak event pertama **selama tepat 24 jam**; sinyal timeframe lain boleh menciptakan intensi notifikasi baru, tetapi **tidak memperpanjang** waktu HOME. Event setelah 24 jam boleh memulai kartu baru.
- Masa tampil 24 jam **bukan** masa berlaku entry. Tidak ada order otomatis.

## 2. Bukti telah dijalankan di mesin lokal (bukan di Binance/TradingView)
- `cd scanner && npm test`: **46 lulus / 0 gagal** (uji unit + replay kronologis + jurnal HOME restart).
- `cd scanner && npm run proof`: **empat skenario positif**, masing-masing menghasilkan satu LONG A dalam lane yang ditargetkan menggunakan **hanya rangkaian candle sintetis** yang saling konsisten, tanpa preseed state; negatif perubahan Binance mock +0,99% menghasilkan nol LONG A.
- Output lengkap, waktu event, ID, jumlah candle dan kode status: `docs/PROOF_FOUR_TF_SYNTHETIC.json`.
- Demo HTTP `GET /health`: `{"ok":true,"mode":"DEMO_OFFLINE","binanceRequests":0}`.
- Jurnal offline menggunakan penulisan atomik dan memiliki tes restart, duplikasi bersamaan, kedaluwarsa tepat 24h dan korupsi. Ini **bukan database terdistribusi** dan belum ada FCM/polling production.

## 3. Peringatan penting Pine lookahead (berdasarkan dokumentasi resmi TradingView)
- Pada chart 15M/1H, Pine `request.security("5", close[1], lookahead=barmerge.lookahead_on)` mengambil **intrabar pertama** historis, tetapi dapat memakai **intrabar terakhir** pada realtime; hasil dapat berubah setelah chart dimuat ulang.
- Default evaluator YELLOW: `CAUSAL_REALTIME`, hanya candle tertutup tersedia sebelum waktu sinyal; mengemulasi keputusan saat candle target selesai, bukan menyalin masa depan.
- Mode pembanding `PINE_HISTORICAL` tersedia dalam **replay offline saja** untuk meninjau perbedaan chart lama. Ini bukan jaminan parity hasil screenshot.
- Rujukan: https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/ dan https://www.tradingview.com/pine-script-docs/faq/other-data-and-timeframes/.

## 4. Gerbang berikut sebelum diperbolehkan LIVE
1. **PARITY DATA NYATA (belum):** kumpulkan candle Binance historis tertutup per simbol di 1M/5M/15M/1H dan, jika tersedia, snapshot 24h ticker *as-of* untuk waktu tersebut. Cocokkan LONG A 1M/5M/15M/1H dengan indikator Pine di TradingView; bedakan hasil historis dari realtime. SKDD (yang kini >10 USDT) boleh dipakai sebagai pembanding pola, bukan kandidat lolos filter baru. Kasus WAL, ARC, NIL dan kasus negatif juga diperiksa dengan timestamp tepat; screenshot harga terakhir saja tidak cukup.
2. **SOURCE & UNIVERSE PROOF (belum):** untuk scanner terpisah, audit apakah feed BR menyediakan candle 1M untuk seluruh simbol layak, bukan hanya shortlist. Jika tidak, rancang sumber data alternatif dan anggaran request agregat, **tanpa memanggil Binance tambahan selama BR #205 freeze**.
3. **BACKEND PRODUCTION (belum):** implementasi HTTPS dengan otentikasi publisher, validasi schema, idempotency transaksi, HOME TTL durable, batas penggunaan disk, rate limits, keterlambatan WebSocket/REST serta audit 418/429/451, cooldown, backoff fail-closed.
4. **APK DEBUG (belum):** butuh JDK17/Gradle8/Android SDK35 atau CI GitHub Actions yang dapat menulis ke branch development. Uji ikon 1K, dua tab, TradingView, waktu 24h dan backend baca saja di ponsel.
5. **PUSH (belum):** signer YELLOW permanen terpisah; Firebase topic YELLOW; dedupe atomic polling/FCM; foreground, layar mati, reconnect, reboot, doze; sinyal usang tidak mengirim notifikasi.
6. **DEPLOYMENT (belum):** baru setelah semua uji berhasil, persetujuan eksplisit pengguna, dan estimasi biaya Railway. Jangan mengubah BR #205.

## 5. Hasil tidak boleh disalahartikan
**Yang sudah terbukti:** empat lane independen dapat memproduksi LONG A dalam replay candle sintetis, dan sistem dapat mengatur intensi serta HOME 24 jam secara offline. **Yang belum terbukti:** kecocokan terhadap Pine historis/live dari pasar nyata, akurasi trading/return, notifikasi FCM di HP, pembatasan kuota Binance saat live, APK terkompilasi, serta server Railway YELLOW live.

## 6. Cara menjalankan tanpa Work
```bash
cd scanner
npm test
npm run proof
npm run demo
```
Kunjungi `http://127.0.0.1:4173` hanya untuk contoh DEMO OFFLINE, tidak untuk trade. Jika tidak punya Node di PC, buka `preview-offline.html` di browser sebagai mock tampilan.

**Jika ingin build APK tanpa Android Studio:** buat *branch development* baru di repo `minionecompany-design/banksawan-yellow-relay` melalui UI GitHub, salin source paket ZIP ke branch itu, setelah melakukan push/upload ke branch bernama `yellow-long-a-v2-20261015` (pola `yellow-long-a-v2-*`), workflow `.github/workflows/android-debug.yml` akan otomatis mencoba build pada event **push**. Ambil artefak `banksawan-yellow-debug-apk` dari Actions bila job berhasil. Jangan gunakan tombol Run workflow untuk workflow yang belum ada pada default branch, karena `workflow_dispatch` memerlukan workflow tersedia pada default branch. Jangan unggah langsung ke `main` repo lama; repo lama mungkin masih menjadi sumber relay lama. Saat ini konektor GitHub model menolak write (`403`), jadi langkah publikasi memerlukan aksi/izin akun pengguna.
