# BANKSAWAN YELLOW — 4TF LONG A IMMUTABLE, 1M SECOND SIGNAL FIRST
Tanggal 28 Oktober 2026 WIB — arahan pemilik setelah observasi LIVE dimulai.

## Keputusan strategi dan keselamatan
1. **LONG A 1M/5M/15M/1H semua wajib aktif; notifikasi dan Pine asli tidak boleh berubah.**
2. **Sinyal kedua / PANTAU PRIORITAS / HINDARI / ENTRY MENDUKUNG tetap hanya pada LONG A 1M.** Native 5M/15M/1H digunakan untuk konfirmasi; tidak membuat tiga engine atau notifikasi ENTRY tambahan pada tahap ini.
3. Alasan pemilik memusatkan di 1M: pergerakan setelah LONG A dan kesempatan menuju LONG B sering berjarak dekat. Ini observasi pengguna, **bukan trigger LONG B baru**. Eksperimen A→B-only/1M silent lama tetap dibatalkan.
4. Jika uji forward prospektif 1M membuktikan false signal / latency / paper-entry-cost yang memadai, pertimbangkan satu-per-satu TF 5M kemudian 15M/1H dalam modul CPU-only memanfaatkan data native yang sudah ada. TIDAK boleh menambah jaringan Binance semata untuk menghitung status kedua TF lain. Uji per TF dengan denominator terpisah; jangan salin threshold ATR/volume 1M mentah ke 1H.
5. UI APK tetap sederhana, satu lampu status kedua untuk 1M, LONG A notifikasi asli empat TF; informasi lain di ANALISIS. Tidak ada penambahan notifikasi berulang, order, atau API berbayar.

## Hasil audit Binance — LIVE v15
- `scanner/src/live-market.js`: satu WS ticker dan satu WS kline pasar untuk sumber data, `maxTracked<=50`, native lanes `['1m','5m','15m','1h']`, bukan empat instans scanner terpisah.
- `scanner/src/live-request-guard.js`: semua `fapi.binance.com/fapi/v1/` REST diizinkan melalui satu serial guard; budget lokal `weightPerMinute=60`, `minGapMs=750`, pause saat `x-mbx-used-weight-1m >= 400`, `HTTP 418/429/451` dilatch persistently, tidak retry pada ban/geo-restriction. REST pause menghentikan polling sementara; WS failure/reconnect dibatasi fail-closed. Tidak dapat menjamin exchange tidak memberlakukan policy berbasis IP/burst eksternal.
- `scanner/src/live-main.js`: stop fail-closed untuk halt; jangan restart storm atau melakukan IP/proxy bypass.

## Pengaman riset Forward Shadow (PR #28)
- Sumber baru tidak memakai `fapi.binance.com` REST secara langsung. Hanya dua GET read-only milik YELLOW `/api/events` dan `/api/research/candles`, serta satu public Binance **routed** USD-M market WebSocket `wss://fstream.binance.com/market/stream`. Tidak ada API key, order, user-stream, webhook/FCM, atau mutation Railway.
- `scanner/scripts/lib/forward-shadow-subscription-budget.mjs`: semua subscribe 1M+5M+15M+1H pada **satu koneksi riset** dibatch maks 20 simbol ×4 native candle =80 streams per pesan, **maks 1 pesan kontrol per 1000 ms**, limit 200 simbol unik + all-market ticker =801 stream (di bawah batas Binance 1024). Duplikat symbol tidak menambah stream; jika limit tercapai, fail closed dan catat kasus terpotong, jangan diam-diam skip. Hanya satu SUBSCRIBE all-market ticker saat WS open, ditahan 1000 ms sebelum subscribe berikutnya.
- Jangan membuat 4 WS terpisah per TF atau koneksi per kandidat. Satu feed berfungsi sebagai konteks seluruh timeframe. Walaupun inbound market messages banyak, batas 10/s di dokumentasi merujuk **incoming client control messages to Binance**, bukan jumlah data ticker yang diterima klien.
- Koneksi gagal/ditutup, payload tidak valid, data gap, dan kehilangan source menghentikan penelitian dan membatalkan indikator GREEN yang tidak punya bukti. Jangan retry tanpa batas, mengatur server/proxy/IP untuk menghindari pembatasan, atau memakai snapshot masa depan.
- Penelitian yang sudah berjalan di GitHub Action SHA lama tetap memakai kode sesuai SHA-nya; perubahan keamanan ini **tidak retroaktif** ke sesi pengamat yang telah berjalan. Uji tambahan perlu source clean SHA terbaru. Sesudah 60 menit pelajari artifact dan log sesungguhnya, bukan mengklaim bahwa pilot memverifikasi strategi.

## Sumber resmi
- Binance USD-M WebSocket market stream docs: https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Connect
  * route `/market`, 10 incoming control messages/s, 1024 streams/koneksi, 24h lifetime;
- Binance USD-M general info: https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info
  * HTTP 429 request-rate excess, 418 repeated abuse IP ban, follow current API information; HTTP 451 may reflect jurisdiction restrictions, not an ordinary cooldown to circumvent.

## Release gate
**NO GO untuk mengirim ENTRY baru ke APK sampai audit prospektif memperlihatkan kemampuan mengenali kandidat, keterjangkauan entry dan TP/SL versus baseline, kelengkapan data serta nol efek pada 4TF LONG A/FCM.** Sumber produksi v15 tidak diubah oleh riset. Biaya/menit GitHub Actions harus diperhitungkan; Railway service tambahan memerlukan persetujuan pemilik.
