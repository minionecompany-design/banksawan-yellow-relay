# YELLOW LAB — Tahap 4: deployment aman dan bukti alami

**Di luar scope:** tidak mengubah repo branch production `yellow-long-a-v2-20261015`, service Railway GOLD `yellow-live-shadow-yc94`, Firebase dan APK GOLD, algoritma 5M/15M.

## Sudah selesai
- source Node 22 scanner live-shadow dengan WebSocket !ticker@arr dan kline 1M/5M/15M/1H, REST strict rate guard, file cohort persisten, evaluator 1M/1H pinned LAB fork, status read-only.
- source Android id.banksawan.yellowlab, HOME-only 10 jam, shortcut TradingView native + salin simbol, tanpa Firebase.
- 46 tes offline lulus; uji unit tidak bisa membuktikan Binance/WSS bisa diakses dari region Railway.
- project Railway terpisah, service kosong + volume, variabel `LAB_LIVE_SHADOW_ENABLED=false`, `LAB_PUBLICATION_ENABLED=false`; healthcheck path `/health/live`, restart policy NEVER.

## Tahap selanjutnya (wajib, berurutan)
1. Buat **repo GitHub BARU** pribadi `banksawan-yellow-lab` (atau berikan repo kosong lainnya yang pengguna setujui); unggah isi folder v0.4 ke ROOT repo sehingga direktori `scanner/` dan `android/` langsung tersedia. Jangan menggabungkan kode LAB ke branch production GOLD.
2. Verifikasi `npm test` 46/46, build Android debug via GitHub Actions, dan tinjau seluruh source hasil push (cek tidak ada file rahasia).
3. Connect source repo khusus LAB ke **service Railway LAB yang sudah dibuat**; rootDirectory `/scanner`, start `node src/server.js`, health `/health/live`, volume `/data`. Pastikan `LAB_LIVE_SHADOW_ENABLED=false` pada deployment pertama, dan `/api/status` menyatakan `LAB_OFFLINE_RESEARCH`, bukan sinyal palsu.
4. Setelah build sehat dan dengan persetujuan user untuk pemantauan Binance LAB, aktifkan **hanya** `LAB_LIVE_SHADOW_ENABLED=true`; `LAB_PUBLICATION_ENABLED=false` tetap. Periksa `/api/status`: `requestGuard`, `covered`, `lastTickerAtMs`, `lastKlineAtMs`, `stats`, `oneMinute` dan `oneHourAudit`. **Jangan** restart bila ada HTTP 418/429/451: guard memuat latch persisten; telusuri bersama operator.
5. Amati natural selama **3-7 hari**. Laporan harus mengungkap jumlah simbol dilacak/eligible, episode A1, PROTECT, B1/B2 lulus dan gagal, incomplete, after-B MFE/MAE, dan penyebab penolakan 1H. Jangan memakai chart pemenang setelah kejadian untuk mengklaim hasil realtime.
6. Sebelum mengaktifkan HOME (`LAB_PUBLICATION_ENABLED=true`), audit sampel berimbang, dedupe setelah restart, kualitas closed bars, dan validasi di Android pada alat pengguna. Baru rencanakan FCM LAB dengan paket/kredensial terpisah setelah persetujuan lagi. Tidak ada trading otomatis.

## Keterbatasan yang harus diungkapkan
- Pilot 8 simbol mungkin **tidak mencakup** JCT, DOOD, BRU, atau WLD; tidak boleh mengklaim scanner melewatkan mereka sebagai false negative jika tidak tercakup. Sampel ini untuk keandalan infrastruktur dan sinyal alami skala kecil, bukan statistik seluruh market.
- Tidak ada kesetaraan Pine TradingView historis/realtime yang terbukti. Menampilkan LONG A 1H pada Pine tidak otomatis berarti event realtime valid.
- Tidak ada APK signed install; APK debug dari Actions harus diuji di perangkat; deep link native TradingView bisa mengabaikan simbol.
- Jika IP Railway berbagi limit Binance, limiter lokal saja tak menjamin nol 418/429, tetapi LAB fail closed.
- Tidak ada FCM dalam v0.4. HOME juga default kosong selama shadow.
