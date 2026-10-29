# BANKSAWAN YELLOW: Audit kode lama dan roadmap (15 Oktober 2026)

## Bukti yang dibaca (read-only)
- Repo `minionecompany-design/banksawan-yellow-relay`, branch `main`.
- `README.md`: data-plane v1.5, 499 closed candle bootstrap di 4 timeframe, cache live 1M, Quality Gate shadow, Early Engine shadow.
- `scanner.js`: Binance USD-M REST, `PRICE_MAX=30`, `TF_CHANGE_MIN={1m:1,5m:0,15m:0,1h:0}`, `UNIVERSE_CHANGE_MIN=0`, 60 detik scanner, empat worker, 1800 request-weight/min pada proses YELLOW sendiri. Penemuan sinyal per timeframe dan dedupe lokal `symbol_TF_barClose`.
- `server.js`: Express endpoint POST `/yellow`, FCM topic `banksawan-yellow`, env `FIREBASE_SERVICE_ACCOUNT_JSON` dibutuhkan di boot, `RELAY_ENFORCE_EXPIRY=false` default.
- `quality-engine.js`: quality shadow atau enforce; enable enforce mengubah keputusan pengiriman.
- `early-engine.js`: early phase observer shadow.
- Source Pine Script user `BANKSAWAN LONG MTF v1.3`: MA 7/25/99, RSI14 dan MA RSI14, volume ratio >=0.75, distance MA7 <=2.5%, pullback window 30 bar 1M, MTF previous candle 5/15/60, LONG A dan siklus protect/reclaim/final exit.

## Keputusan desain yang dipertahankan
- User memilih ikon **1K** yang diberikan.
- Hanya **HOME** dan **UNIVERSE**, tidak ada tab Pantau/Kandidat/Bukti.
- HOME: entry LONG A pertama per simbol hidup 24 jam, clock independen dan tidak diperpanjang duplikasi.
- Universe: Binance USD-M USDT PERPETUAL, status trading, harga `<10 USDT`, perubahan 24h Binance `>= +1%` dengan prioritas `>= +5%`.
- Shortcut TradingView `https://www.tradingview.com/chart/?symbol=BINANCE%3AWALUSDT.P`, dibentuk dari simbol valid.
- Dua sistem tetap terpisah: repo/aplikasi/keputusan YELLOW; tidak mengubah BR #205.

## Temuan risiko yang harus diperbaiki sebelum live
1. Pada `server.js` lama, POST `/yellow` dalam cuplikan yang diperiksa tidak mengautentikasi sumber peristiwa. HTTP POST yang berhasil berpotensi memicu FCM; endpoint wajib dijaga oleh validasi identitas, replay protection, dan payload schema.
2. `RELAY_ENFORCE_EXPIRY=false` memungkinkan pengiriman event yang sudah kedaluwarsa; harus diubah dan dites, tetapi hanya setelah ada desain delivery yang lengkap.
3. `tfState.lastEventId` adalah dedupe in-memory; perlu persistence dan idempotency saat proses restart/race sebelum notifikasi.
4. Scanner lama memanggil Binance langsung. Batas request weight 1800/min pada proses itu bukan kuota gabungan semua Railway project/IP; cold start bisa berat. Menghidupkannya sekarang bisa menaikkan risiko 429/418 dan bentrok dengan BR #205. Jangan aktifkan.
5. `README.md` lama menyebut outcome logger masih in-memory. Untuk 24h outcome yang bisa dipercaya perlu penyimpanan terukur dan retensi hemat; jangan buat database berukuran besar.
6. Hanya tersedia tes unit lokal untuk prototipe 1M; belum ada replay parity Pine yang terukur untuk kasus SKDD 5M, maupun bukti first-sighting bagi kandidat gainer.
7. Paket Android demo belum diuji build, physical device, update signer, FCM+polling race, battery/doze, atau state after restart.

## Tahapan lanjut (tanpa Work dan tanpa perubahan production)

**Gate 1 — Fondasi offline (evaluator paralel selesai, bukti live belum)**
- [x] Evaluator 1M/5M/15M/1H **paralel**, masing-masing state independen; satu event LONG A cukup untuk intensi notifikasi, tanpa menunggu sinyal di TF lain. Kondisi MTF internal Pine tidak dihapus. Filter +1% Binance dan harga <10.
- [x] HOME 24h per simbol, UNIVERSE, ikon dan link TradingView.
- [x] Test guards filter, MTF, freshness, no-Binance server demo, positive synthetic trigger.
- [x] Struktur Android debug + workflow build (belum dieksekusi).
- [ ] Bukti parity pada data historis riil (snapshot screenshot tidak cukup untuk OHLC replay).

**Gate 2 — Kelengkapan Yellow lama (belum)**
- [x] Fondasi evaluator + pengujian 5M/15M/1H mandiri seperti kode YELLOW lama.
- [ ] Uji **parity TradingView Pine** dengan dataset candle asli untuk 5M/15M/1H, terutama semantik `request.security()` lintas TF dan SKDD; ini BELUM terverifikasi.
- [x] Replay kronologis offline empat TF, menolak future ticker dan mengidentifikasi periode data tidak sehat.
- [ ] Uji fixture historis real long+negative, waktu pertama A, gap/late/reconnect, biaya request.
- [ ] Fail-closed bila timestamp/kline/ticker tidak valid; replay historis tanpa hindsight.

**Gate 3 — Infrastruktur aman (belum)**
- [ ] Pilih data-plane bersama yang tidak meminta Binance REST tambahan selama proof #205, atau desain budget terpisah setelah mendapat izin dan lulus kuota.
- [ ] Backend HTTPS auth + schema + durable idempotent ingest, bounded storage, HOME TTL, GET /api/home + /api/universe.
- [ ] Uji P95 latency, health, 418/429/451/cooldownBlocks, request-weight agregat, WebSocket freshness, crash recovery.
- [ ] Persetujuan eksplisit untuk Railway project baru dan perkiraan tagihan (target total <= US$10–12/bulan tidak dijamin).

**Gate 4 — Android/FCM (belum)**
- [ ] Kompilasi debug APK via GitHub Actions/Android SDK, tes di HP user.
- [ ] Permanent signing key terpisah dari BR; jangan mengganti BR signer.
- [ ] FCM YELLOW sendiri: valid event id, atomik polling+FCM dedupe, expired event silent, background/offline test.
- [ ] Rilis hanya setelah persetujuan eksplisit user.

## Tidak dikerjakan dalam sesi ini
Tidak ada commit GitHub, Railway deploy/restart, perubahan env, maintenance DB, ataupun Binance API call. Saya sempat mencoba membuat branch YELLOW, tetapi integrasi GitHub mengembalikan HTTP 403; source dibagikan sebagai arsip offline agar tidak memblokir kemajuan kerja.
