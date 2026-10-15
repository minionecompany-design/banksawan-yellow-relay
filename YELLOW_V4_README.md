# BANKSAWAN YELLOW V4 — OFFLINE ACCEPTANCE (15 Oktober 2026)

**Status: 62 offline tests PASS; APK belum terkompilasi; scanner live belum diaktifkan.**

- Semua LONG A berjalan paralel pada 1M/5M/15M/1H. Satu lane valid cukup untuk event LONG A.
- Universe memakai kenaikan Binance USD-M Futures 24h >= +1%, harga <10 USDT; >=+5% hanya prioritas.
- HOME satu kartu per simbol selama tepat 24 jam dari event pertama; sinyal baru dalam periode itu tidak memperpanjang TTL.
- Hanya HOME + UNIVERSE, ikon 1K, shortcut TradingView.
- Adapter Binance fixture offline dengan validasi OHLCV, candle tertutup, gap dan multi-TF.
- Local acceptance HTTP (localhost-only, replay protected, read response `simulation:true`); no Binance, no FCM.
- APK debug belum dapat dibangun di lingkungan tanpa Android SDK/Gradle.

Panduan dan status validasi: [`docs/V4_OFFLINE_ACCEPTANCE.md`](docs/V4_OFFLINE_ACCEPTANCE.md).

**Tidak ada perubahan pada BR #205 atau Railway/GitHub production.**

---

# BANKSAWAN YELLOW V2 — Fondasi Offline (15 Oktober 2026)

**Status: SOURCE ALPHA / OFFLINE RESEARCH ONLY — BUKAN APK RELEASE, BUKAN LIVE SCANNER.**

Proyek ini merupakan fondasi baru yang *terpisah* dari Banksawan Radar BR #205.
Sumber rujukan: repo lama [minionecompany-design/banksawan-yellow-relay](https://github.com/minionecompany-design/banksawan-yellow-relay) dan Pine Script BANKSAWAN LONG MTF v1.3 yang diberikan pemilik proyek.
Proyek lama TIDAK diubah. GitHub menolak pembuatan branch (`403 Resource not accessible by integration`).

## Hal yang benar-benar berfungsi dalam paket ini

- **Empat jalur LONG A independen dan paralel** di **1M / 5M / 15M / 1H**: jika salah satu jalur LONG A valid, event dan intensi notifikasinya muncul setelah candle timeframe tersebut ditutup; **tidak menunggu LONG A dari timeframe lain**. Kondisi MTF internal sesuai Pine tetap berlaku (permission/support/momentum), tetapi bukan urutan kejadian LONG A.
- Implementasi memakai empat state terpisah termasuk pullback window dan posisi; dedupe berdasarkan simbol + timeframe + candle close. HOME tetap 24 jam per simbol sejak kemunculan pertama meskipun ada LONG A dari timeframe lain.
- `Binance USD-M Futures` saja: harga < **10 USDT** dan perubahan harga Binance 24H >= **+1%**; >= **+5%** diberi prioritas tinggi, bukan sinyal beli otomatis.
- Validator input: tidak boleh menggunakan ticker TradingView atau koin non-perpetual, candle bolong, MTF salah waktu, ticker basi/masa depan.
- Akumulator keadaan LONG A/PROTECT/LONG B/OUT FINAL *untuk pengujian*, tetapi UI HOME hanya menampilkan LONG A.
- HOME **24 jam sejak setiap kemunculan pertama per simbol**; sinyal duplikat tidak memperpanjang timer.
- Antarmuka contoh **HOME** dan **UNIVERSE**; shortcut membuka TradingView untuk tiap simbol dengan `BINANCE:SYMBOLUSDT.P`.
- Ikon 1K yang diberikan pemilik, dibundel di pratinjau dan source Android.
- Mini server local demo serta file HTML mandiri yang dapat dibuka tanpa server.
- Replay dari data historis *as-of* yang disediakan user; laporan periode data tidak sehat.

## Yang BELUM dapat diklaim selesai

- **Belum ada APK `.apk` hasil build/signed**: lingkungan sekarang tidak menyediakan Android SDK/Gradle; source Android dan workflow build telah disiapkan tetapi belum dikompilasi.
- **Belum ada sinyal LIVE** dan belum ada ingest otomatis atau notifikasi FCM.
- **Belum ada parity proof dengan Pine/TradingView** pada kasus-kasus riil seperti SKDD, WAL, ARC, NIL.
- **Empat timeframe sudah ditangani secara paralel pada level evaluator offline**, tetapi **kesesuaian hasil dengan TradingView/Pine belum terbukti**. Khusus `request.security` timeframe lebih rendah ketika chart utama 15M/1H, as-of konservatif evaluator perlu diuji karena aturan Pine bisa berbeda. Contoh riil SKDD tetap belum diuji dengan candle historis.
- **Belum ada data-plane Binance live**; ini sengaja dinonaktifkan agar #205 aman. Jangan mulai scanner lama `npm start` di production; scanner lama dapat mengirim banyak permintaan Binance REST.
- **Belum ada persistence Postgres** dan notifikasi/atomic dedupe antar FCM-polling. Demo hanya in-memory tanpa endpoint tulis.

## Menjalankan tes dan demo lokal

Butuh Node.js >= 22, tanpa `npm install` (hanya modul builtin Node):

```bash
cd scanner
npm test
npm run demo
```

Buka `http://127.0.0.1:4173`. Semua data contoh berlabel **DEMO OFFLINE**, tidak menghubungi Binance maupun TradingView secara otomatis. Tombol TradingView baru membuka situs apabila ditekan.

Alternatif tanpa Node: buka `banksawan-yellow-preview-offline.html` yang ada di luar folder source/archive.

## Android

Source Java Android ada di folder `android/`. Package ID: `id.banksawan.yellow`, berbeda dari BR. Hanya dua tab: HOME dan UNIVERSE. Saat dibuild tanpa environment variable, aplikasi tampil sebagai **DEMO OFFLINE**.

GitHub Actions workflow `.github/workflows/android-debug.yml` memakai JDK 17 + Gradle 8.10.2 + Android SDK 35 untuk mencoba membangun debug APK di repo pengembangan YELLOW. **Workflow belum dijalankan**. Debug signing tidak sesuai untuk update APK rilis jangka panjang; signer permanen dan FCM YELLOW baru boleh dikonfigurasi setelah lulus acceptance.

## Pengujian offline as-of

Gunakan CLI:

```bash
cd scanner
npm run replay -- --parallel contoh-historis.json
```

Berkas historis harus berisi `{ "symbol": "WALUSDT", "oneMinute": [...], "fiveMinute": [...], "fifteenMinute": [...], "oneHour": [...], "tickers": [...] }`.

`--parallel` menghasilkan ringkasan per timeframe, event LONG A, intensi notifikasi offline, dan periode data tidak sehat. Tanpa flag, CLI tetap mendukung replay 1M lama untuk pembanding.

Tiap candle: `{ "endMs": 1792..., "close": 0.04, "volume": 100 }` dengan waktu akhir candle selaras UTC. Ticker historis memerlukan `symbol`, `lastPrice`, `priceChangePercent`, `observedAtMs`, `source: "BINANCE_USDM_FUTURES"`, dan `contractType: "PERPETUAL"`; ticker yang dipakai harus tersedia pada saat candle tersebut, bukan hasil 24h hari ini. Snapshot tanpa riwayat masa itu **tidak bisa membuktikan deteksi historis**.

## Peraturan keselamatan tetap berlaku

- **JANGAN** menyentuh main branch/deploy Railway BR #205 atau env/threshold/database BR.
- **JANGAN** membuat permintaan Binance live sebelum data-plane bersama/separate budget, cooldown dan health diuji menyeluruh.
- **JANGAN** membangun/men-deploy Railway berbayar tanpa persetujuan pengguna dan estimasi biaya.
- **JANGAN** mengubah mode menjadi live, mempromosikan SHADOW menjadi entry, atau mengeluarkan FCM sebelum parity, reliability, dedupe dan keamanan lulus.

Lihat `docs/AUDIT_DAN_ROADMAP.md` untuk temuan kode lama dan urutan pekerjaan berikutnya.

## Pembaruan V3 — Replay kronologis empat timeframe (tanpa Work)
- Ditambahkan sumber candle **sintetis konsisten antartimeframe** dan pengujian end-to-end state kosong -> LONG A -> intensi notifikasi pada **semua empat timeframe**.
- Pengujian sekarang **46 lulus, 0 gagal**. Jalankan `cd scanner && npm run proof` untuk laporan JSON yang memuat empat waktu/event dan kasus negatif 0,99%.
- Sumber Pine lookahead pada konteks *lower timeframe* dapat berbeda historis/realtime. `CAUSAL_REALTIME` tetap mode default; `PINE_HISTORICAL` hanya pembanding replay offline.
- `scanner/src/offline-home-journal.js` memberi simulasi persistence HOME 24 jam dan dedupe lokal dengan atomic rename serta uji restart; **bukan persistence production/FCM**.
- Lihat `docs/PROOF_AND_RELEASE_GATES.md` dan `docs/PROOF_FOUR_TF_SYNTHETIC.json`.
- APK debug, parity data nyata, FCM dan Railway baru **belum selesai/belum aktif**, dan source masih **source-only**.
