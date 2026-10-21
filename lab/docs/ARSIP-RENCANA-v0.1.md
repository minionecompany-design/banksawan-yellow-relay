# YELLOW LAB — Tahapan sederhana

**Komitmen:** YELLOW GOLD `yellow-live-shadow-yc94`, APK `id.banksawan.yellow`, filter/notifikasi 5M dan 15M tidak disentuh. BR dan ONE tidak dihidupkan.

## TAHAP 1 — v0.1 (selesai: fondasi offline dan HOME-only source)

- Proyek sumber baru; Node.js test; APK Java source berbeda package id; endpoint offline tak bisa mengaku live.
- Desain 1M: hanya **A PERTAMA → PROTECT → B1 atau B2** maksimal 120 menit. Sinyal A dan HOT tidak ditampilkan. Keluaran dari seleksi masih **RESEARCH ONLY**.
- 1H audit: label Pine historis bukan bukti event realtime.

## TAHAP 2 — Akurasi offline (BELUM selesai)

- Sinkronkan evaluator referensi dengan commit YELLOW GOLD yang disetujui tanpa mengubah GOLD, lalu uji kesetaraan Pine as-of realtime.
- BRU/WLD: inspeksi event A 1H dengan jam candle, ticker Binance rolling 24H saat itu, coverage top-50, warm/cold status, alasan penolakan, dan `request.security()` lower TF historis vs live. Jika tidak ada data, hasil `UNVERIFIED`.
- JCT/DOOD dan contoh gagal: validasi benar-benar B segitiga oranye di bawah candle, bukan HOT berlian di atas. Hitung B1/B2 setelah PROTECT, 120 menit as-of, harga pada close B, MFE/MAE *setelah* B.
- Ambang **12% jarak B terhadap A** dalam kode adalah nilai hipotetis untuk test, bukan ketetapan strategi atau bukti efektivitas; optimasi hanya dengan data holdout.
- Perbaiki persistensi episode lintas restart, gap data, keluar dari universe, dan status INCOMPLETE; uji guard melawan replay duplikat dan kondisi cold-start.

## TAHAP 3 — Aman dari Binance (BELUM selesai)

- Jangan menyalakan dua scanner sekaligus tanpa anggaran request IP keseluruhan. LAB terpisah Railway tetap bisa berbagi IP / NAT.
- Scanner LAB mulai OFFLINE, lalu feed simulasi, baru uji real kecil jika pengguna memberi persetujuan; circuit breaker 418/429 harus persisten, rest rate diserialkan, candle closed, tidak ada retry storm.
- 1M FCM awal **0**; limit satu kandidat per episode, kandidat harian maksimum diuji terhadap missed winners. Lakukan uji gangguan yang tidak memengaruhi YELLOW GOLD.

## TAHAP 4 — APK & Railway LAB (BELUM selesai)

- Buat GitHub repo terpisah `banksawan-yellow-lab` (tindakan repo otomatis tidak tersedia pada konektor di sesi ini); jalankan CI Node dan Android build.
- Pastikan aplikasi debug berjalan di HP, UI hanya HOME, data tidak pernah mengarah ke YELLOW GOLD; perbaiki deep link TradingView Mobile jika memungkinkan (tombol Salin Simbol sudah disediakan sebagai fallback).
- Mintalah persetujuan pengguna khusus untuk create/deploy Railway baru, setting credentials LAB sendiri, endpoint LAB sendiri, volume sendiri, dan *belakangan* aktivasi notifikasi.

## Catatan evaluasi

Ini bukan bot trading atau jaminan ROI. Studi harus meliputi semua A1 teramati, bukan cuma koin yang kemudian pump. Jangan menyimpulkan `2h` dan `B1/B2` efektif sebelum kohort mencakup pemenang, pecundang dan data yang hilang.
