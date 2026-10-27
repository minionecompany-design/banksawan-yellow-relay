# BANKSAWAN YELLOW — FOKUS ENTRY V3 TF 1M (28 Oktober 2026)

## Instruksi pengguna
Jika penyaringan ENTRY dua-jalur untuk semua TF terlalu kompleks, fokuskan hanya pada LONG A TF1M. Jangan hilangkan LONG A 5M, 15M, atau 1H dari HOME maupun notifikasi.

## Implementasi TERBATAS dan isolasi
- Prototipe `scanner/src/entry-readiness-v3.js` adalah eksperimen OFFLINE dan tidak diimpor oleh scanner LIVE/Railway/APK. `newReadinessWatch` sekarang MENOLAK timeframe selain `1m` dengan `READINESS_1M_ONLY`.
- 1M tetap memerlukan sejarah candle tertutup 1M/5M/15M/1H untuk izin konteks tren/volume: **empat TF sebagai sensor, bukan empat strategi ENTRY**. Tanpa data, tidak membuat GREEN.
- Mesin LONG A produksi, 50 slot, universe filter, notifikasi 1M/5M/15M/1H, Pine, HOME ringkas, lampu lama dan tombol ANALISIS **TIDAK BERUBAH**.
- Dua jalur yang diteliti pada **LONG A 1M saja** adalah pullback setelah puncak dan continuation setelah konsolidasi. Tidak ada pesanan otomatis, perintah beli, prediksi laba atau harga yang dipaksakan.
- Jendela enam jam untuk pengamatan, validitas 3 menit setelah konfirmasi, pembatalan pada gap/expiry, batas risiko 0.3–5%, filter volume/quote dan alasan penolakan tetap sama dengan V3 awal.
- Alur replay tidak menghapus kegagalan 5M/15M/1H dari arsip. Ia menyertakan kejadian tersebut dengan label eksplisit `OUT_OF_SCOPE_NON_1M`, tanpa menciptakan evaluasi ENTRY atau data GREEN fiktif. Hanya kasus `LONG_A_1M_ONLY` yang masuk penyebut dan ringkasan kinerja.
- Dataset sumber 46 kasus asli: **28 1M**, **16 5M**, **2 15M**, 0 1H; tiga tambahan tidak punya candle lengkap. Ini sampel lama yang sudah diketahui, tidak membuktikan akurasi.
- Lebih sedikit TF yang dianalisis mengurangi kompleksitas dan potensi alarm berlebih, **tidak membuktikan** 1M lebih profitable dari 5M/15M/1H.

## Release gates
1. Offline Node scanner tests + Android QA harus lulus; terutama validasi hard gate 1M, kelengkapan data, umur quote dan persistensi, no future candles, serta pelaporan pengecualian 18 kasus.
2. Ulang replay pada seluruh data asli dan lakukan penelitian prospektif dengan sampel LONG A baru, termasuk tidak-entry, rugi, candle ambigu, biaya dan sinyal yang tertahan.
3. Hanya setelah hasil prospektif memadai, buat rancangan integrasi backend/Android terpisah, cek kompatibilitas dan jalankan review pengguna. Jangan deploy V3 berdasarkan 264 tes atau hasil replay ini saja.
4. Selama V3 belum dipromosikan, **YELLOW v15 LIVE tetap berjalan**, termasuk lampu serta watch lama yang sudah ada pada TF lain. Tidak ada perubahan deployment atau rilis APK dari branch penelitian ini.

Kesimpulan: **hanya ENTRY V3 percobaan yang difokuskan ke 1M; LONG A asli tetap 4 TF.**
