# BANKSAWAN YELLOW LAB v0.4 — LIVE-SHADOW READY, BELUM TERDEPLOY

**Proyek mandiri khusus penelitian**. BANKSAWAN YELLOW GOLD di Railway `banksawan-yellow-v2` tidak disentuh. Proyek Railway terpisah `banksawan-yellow-lab` sudah dibuat, dengan service kosong `yellow-lab-shadow` dan volume `/data`; **belum ada aplikasi berjalan, tidak ada koneksi Binance, tidak ada kandidat alami**.

## Fitur penelitian
- Binance USD-M perpetual; harga `<10 USDT`.
- 1M: ticker perubahan **24 jam >=0%**. LONG A pertama hanya memulai episode penelitian; PROTECT harus muncul sebelum setiap LONG B. Calon B1/B2 pada jendela 120 menit diuji dengan indikator/struktur 5M, kenaikan sejak A, dan bar tertutup. **B3 dan HOT tidak dipublikasikan**.
- 1H: LONG A dengan perubahan harga **24 jam >=+1%**. Riwayat visual TradingView **tidak dianggap bukti realtime**.
- 1M/1H berbagi **satu WebSocket** ticker+kline LAB; sumber LAB sama sekali tidak mengonsumsi API, volume atau Firebase GOLD.
- Scanner pilot menggunakan **maksimal 8 simbol alami** yang dipilih deterministik dari ticker 24H saat koneksi dimulai, bukan whitelist JCT/DOOD/BRU. `LAB_MAX_TRACKED` dapat sampai 12 setelah dievaluasi; awal aman 8.
- Semua REST fapi.binance.com dibatasi ke dua endpoint allowlist, budget lokal 20 weight/menit, jarak >=3100ms, menghormati header bobot IP, dan mengunci keras HTTP 418/429/451 secara persisten. **Bukan jaminan Binance tidak membatasi IP bersama**.
- Saat WS gap, restart, atau hilang cakupan, episode ditandai `INCOMPLETE`. Tidak ada REST retry storm. Restart otomatis Railway dimatikan selama canary.
- HOME LAB hanya 1 halaman, tanpa UNIVERSE. Kartu B1/B2 dan A 1H berlaku selama **10 jam** sejak candle close; klik mencoba aplikasi TradingView Mobile, dengan opsi salin simbol.

## Dua sakelar deployment terpisah
```
LAB_LIVE_SHADOW_ENABLED=false      # awal: API OFFLINE, ZERO traffic Binance
LAB_PUBLICATION_ENABLED=false     # awal: tidak ada kartu HOME, nol FCM
LAB_MAX_TRACKED=8
LAB_DATA_DIR=/data
```
Setelah code repo dipasang dan build sukses, operator bisa menyalakan `LAB_LIVE_SHADOW_ENABLED=true` **tanpa mengubah GOLD** untuk mencatat kasus alami. Jangan mengubah `LAB_PUBLICATION_ENABLED` sampai observasi dan audit independen selesai; **tidak ada FCM dalam v0.4 walau kartu HOME diaktifkan**.

## Uji lokal
```
cd scanner
node --version   # Node 22+
npm test         # 46 tes + perlindungan
npm start        # API OFFLINE, tanpa Binance
```
Android memiliki source Gradle; **belum ada APK terkompilasi**, belum ada bukti TradingView native langsung memindah simbol di HP. Bila GitHub Actions dijalankan di repo mandiri, workflow `offline-test.yml` melakukan build debug; untuk API base URL HTTPS, set `LAB_API_BASE_URL` saat build.

## Status proyek Railway
- Project: `ccd1d777-4482-4c5c-aace-1c7649cabed2`
- Environment: `69b7d7ca-b4ad-4e15-81a1-abf25d93443e`
- Empty service: `16ca9a50-e51f-4dc2-b874-34da76012238`
- Volume LAB: `28a54bc8-f179-4ec8-9798-ab4db702a238` (`/data`, 512MB)
- Source GitHub **belum dihubungkan**. Konfigurasi awal fail closed.

Lihat `docs/RUNBOOK-TAHAP-4.md`. Ini adalah kesiapan source, **bukan verifikasi natural LIVE**.
