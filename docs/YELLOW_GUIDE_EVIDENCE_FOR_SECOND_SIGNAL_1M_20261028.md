# CATATAN RISET YELLOW — PETUNJUK KANDIDAT BERPOTENSI LANJUT NAIK
Tanggal: 28 Oktober 2026 WIB | Untuk audit Work | **OFFLINE RESEARCH, BUKAN SINYAL LIVE**

## 0. Jawaban inti dan batas klaim
Tugas BANKSAWAN YELLOW tetap **mendeteksi LONG A**. Tambahkan **satu penilaian kedua** terhadap kandidat HOME LONG A 1M: pantau, hindari skenario saat ini, atau kondisi entry teknis mendukung. Mesin tidak bisa meramal bahwa sebuah koin **pasti** naik, akan menjadi Binance Top 1, atau **tidak akan naik lagi**. Semua status adalah keputusan bersyarat berdasarkan data yang sudah tersedia pada waktu evaluasi. **Hijau tidak berarti entry otomatis**.

Pertahankan LONG A dan notifikasi 1M, 5M, 15M, 1H, maksimal 50 slot yang dipindai, universe price <10 USDT + 24h CHG >=1% + 24h quote volume >10M USDT sesuai konfigurasi final, HOME ringkas, TradingView, ANALISIS, FCM, Railway dan APK. 5M/15M/1H digunakan sebagai konteks untuk riset ENTRY 1M, bukan tiga mesin ENTRY baru.

## 1. Fakta screenshot dari pemilik (observasi historis, bukan hasil entry)
- IRYSUSDT: HOME LONG A 1M di 0.042080 USDT; Chg Binance 24H **+126.40% saat sinyal**; pada snapshot Binance berikutnya harga 0.14023 (+233.2% terhadap harga LONG A). Periode antar-screenshot dan titik eksekusi tidak membuktikan fill atau profit.
- AINUSDT: LONG A 1M di 0.073830; Chg 24H yang disimpan saat sinyal +93.98%; pada snapshot screener sesudahnya ~0.15646 (+111.9% dari harga LONG A). Tampilan TUNGGU tidak membuktikan kapan atau apakah setup entry valid.
- EVAAUSDT: LONG A 1M di 0.745000; screenshot berikutnya 0.8721 (+17.1% dari LONG A); status BERAKHIR berarti window watch selesai, **bukan berarti koin pasti turun**.
- BULLAUSDT: screenshot menunjukkan LONG A 1M di 0.092460 dan 5M di 0.092380; pengguna mengamati pola turun lalu pulih, tetapi screenshot HOME saja tidak mengonfirmasi urutan candle/entry/SL.
- JCT dan kasus AIN/BULLA adalah **contoh yang dipilih setelah terlihat naik**, bukan bukti kemenangan ataupun dataset acak yang bisa dipakai menghitung akurasi.
- Screenshot LIVE SHADOW menunjukkan eligible >50 (misalnya 48/52), jadi HOME/Universe **bukan seluruh pasar yang terpantau pada satu waktu**. Jangan menjadikan yang tidak muncul sebagai bukti scanner meleset tanpa audit cakupan.

**Temuan kode penting:** `binance24hChangePct` pada HOME v15 adalah **snapshot 24H yang dicatat ketika LONG A diterima** (bersama harga saat A), bukan persentase dinamis tiap refresh. Perlu label jelas "CHG 24H saat A"; untuk sinyal kedua pakai harga live dari ticker dengan timestamp as-of dan menghitung sendiri `returnSinceA`. Jangan samakan keduanya.

## 2. Tiga fenomena yang perlu dibedakan SEBELUM hasil akhir diketahui
**A. Failed-follow-through:** setelah LONG A harga naik kecil/tidak naik, lalu close di bawah struktur support, tekanan jual membesar, TF lebih tinggi berbalik. Layak label **HINDARI SKENARIO SAAT INI**, bukan klaim tidak akan pulih lagi.

**B. Pullback-recovery:** setelah LONG A harga turun dari **puncak yang telah terjadi** (boleh tetap di atas harga LONG A) lalu membuat pemulihan terstruktur (higher lows, reclaim previous highs/MA, volume pulih). **TUNGGU** selama retracement; baru pertimbangkan **HIJAU** setelah syarat objektif entry terpenuhi.

**C. Continuation:** harga langsung menguat bertahap sesudah LONG A, membentuk base/konsolidasi lalu menembus range atas dengan candle wajar dan volume memadai. Tidak harus turun melewati harga LONG A. **TUNGGU** hingga breakout dan jarak entry masuk akal; jangan mengejar candle vertikal.

**D. Sudah terlewat:** harga mencapai TP1/zona terlalu jauh, sinyal kedaluwarsa, data hilang, atau watch selesai. Label **BERAKHIR/OFF**, bukan RED.

## 3. Variabel yang BENAR-BENAR penting untuk sinyal kedua
Simak dua fase yang **harus disimpan terpisah**:
- **Dibekukan di LONG A (t0):** symbol, TF, eventId, WIB + UTC, barClosedAt, harga LONG A, CHG 24h pada A, quote vol 24h pada A, candle konteks 1M/5M/15M/1H yang sudah TUTUP, pre-A support/resistance, ATR dan baseline 20 candle 1M. Simpan as-of untuk audit agar tidak mengubah data masa lalu.
- **Setiap closed 1M sesudah A:** harga live + waktu quote dan freshness; `returnSinceA=(live/A-1)*100`; `peakSinceA` yang hanya memperhitungkan candle yang sudah lewat; `drawdownFromPeak=(live/peak-1)*100`; `lowSinceA`; volume relatif dibanding 20 candle sebelumnya; urutan higher highs/higher lows; kekuatan candle dan wick; breakout atas 3 high sebelumnya; SMA7/SMA25, ATR14; tren native 5M/15M/1H; resistance room dalam R; gap/staleness. Untuk entry aktual: tick size, spread, fee, slippage, harga fill dan batas risiko.
- **Yang TIDAK cukup sebagai sinyal tunggal:** Chg 24H tinggi/rendah, status Top Gainer/Top 1, besar persen naik setelah A, atau indikator TradingView Buy. CHG +100% bisa disusul kenaikan lagi (contoh IRYS), tetapi juga bisa disusul dump; tidak punya probabilitas terkalibrasi tanpa uji.

**Rancangan HOME minimal:** simbol, harga LONG A, CHG 24H **saat A**, TF, jam sinyal, lampu dan satu angka kecil **Perubahan sejak A** (menggunakan quote segar dan label "LIVE"); tombol TradingView dan ANALISIS. Jika quote tidak segar, jangan tampilkan angka LIVE seolah terbaru. Semua alasan, path, entry zone, SL, TP, relative volume, support/resistance tetap ada di **ANALISIS**, tidak memenuhi HOME dengan angka.

## 4. State machine sinyal kedua (konsep, bukan rilis)
**YELLOW / TUNGGU** = LONG A masuk, ada pullback awal atau gerak naik bertahap tetapi belum ada bukti lengkap; belum ada izin skenario entry. Penurunan satu candle **TIDAK OTOMATIS MERAH**.

**RED / HINDARI** = kondisi risiko saat ini objektif. Hipotesis PR #27: minimal dua close 1M berturut-turut di bawah support 20 candle *sebelum* LONG A dikurangi buffer 0.2%, candle terakhir bearish, volume jual >=1.5 kali rata-rata 20 candle, native 5M DOWN dan native 15M bukan UP. Angka ini **ambang riset** yang belum dibuktikan optimal. Jangan menampilkan RED ketika candle native/volume belum tersedia; gunakan TUNGGU/data belum siap. Jika kondisi pulih, status dapat berubah melalui observasi baru dengan alasan dan riwayat yang terekam, bukan menghapus RED yang lama.

**GREEN / MENDUKUNG** = HANYA ketika path riset V3 1M mengonfirmasi salah satu:
- Pullback: penurunan dari puncak **teramati**, minimal max(0.5% dari peak, 0.8 ATR1m), lalu setidaknya dua right candles dengan higher lows, close merebut tiga previous highs dan SMA7, volume relatif >=1.2.
- Continuation: lima candle 1M sesudah A membentuk base, range <=2 ATR, lalu close breakout base high, body >=50% range, lonjakan tidak vertikal (<=2.5 ATR candle, <=0.75 ATR extension), volume relatif >=1.5.
Kedua path harus lulus context filter native 5M/15M/1H yang tidak bertentangan, jarak stop 0.3–5% (batas riset, risiko 5% bisa sangat besar), ruang resistance >=1.5R, complete closed candles, lag <=90 detik, quote eligible segar (<30 detik), quote setelah konfirmasi, dan harga masih dalam frozen entry zone. Masa berlaku skenario 3 menit sejak confirmation. Target indikatif 1R/2R/3R; jangan menandai peluang sudah valid tanpa level yang dapat digunakan di tick size bursa.

**OFF / BERAKHIR** = watch 6 jam lewat tanpa setup; 3 menit konfirmasi lewat tanpa entry; harga sudah mencapai TP1, data continuity rusak atau tidak lagi ada skenario. BERAKHIR tidak sama dengan gagal. Tidak boleh ada GREEN yang dipulihkan dari data historis setelah restart/gap.

**Penting:** jangan menimpa state ENTRY v15 yang sudah LIVE; V3 dan second signal tetap OFFLINE di PR #26 dan #27 sampai dinyatakan layak. Lampu 3 warna satu baris saja; jangan menambah dua sistem lampu yang saling bertentangan.

## 5. Bagaimana tahu aturan membantu? Desain uji anti-bias
Ambil **seluruh** LONG A 1M pada periode uji baru, bukan cuma IRYS/AIN/JCT/BULLA yang belakangan naik. Catat pada t0, +5m, +15m, +30m, +1h, +2h dan +6h, serta setiap transisi label:
- Event ID, harga A, quote update dan timestamp, return since A, maximum favorable excursion (MFE), maximum adverse excursion (MAE), peak-to-trough drawdown, 24h CHG at A.
- Apakah status pada waktu itu TUNGGU/RED/GREEN/OFF; kapan berubah, apa alasan/gate yang terpenuhi; apakah lampu hijau terjadi sebelum kenaikan besar (bukan setelah).
- Plan entry/SL/TP1-3 dibekukan di waktu konfirmasi. Uji entry benar-benar **terisi** berdasarkan fill model yang didefinisikan; jika tidak, tulis NOT_ENTERED. Evaluasi TP1 sebelum SL dengan kasus dalam satu candle = AMBIGUOUS, data putus = INCOMPLETE_DATA. Biaya transaksi, spread dan slippage tetap dihitung.
- Hitung green-yang-malah-SL, red-yang-lalu-naik, kandidat naik-tanpa-green, waktu tunggu hingga green, terlalu-lambat, miss continuation dan tanpa konfirmasi. Deduplikasi sinyal TF sama/simbol sama pada episode pasar yang berkorelasi.
- Jangan hitung win rate atau peluang sukses bila tidak ada trade-filled dan sampel cukup. Hindari optimisasi threshold berulang atas sampel yang sama; setelah eksperimen parameter disepakati, kunci lalu uji pada data **baru**.

### Bukti saat catatan dibuat
- PR #26: penelitian ENTRY V3 fokus 1M. Replay 46 event arsip: 28 1M, 16 5M, 2 15M di luar cakupan; 15 jendela 1M selesai, 13 tersensor; dari 28 hanya 1 konfirmasi PULLBACK HUMA, **NOT_ENTERED**, nol entry terisi, belum ada win rate. Dua jalur v3 belum membuktikan kualitas pada sampel asli.
- PR #27: pure offline secondSignal1m diuji secara sintetis; 273/273 Node tests pass, Android safety CI pass. Belum ada hasil replay/prospektif memadai yang membuktikan RED menyingkirkan loser tanpa membuang winner, atau GREEN meningkatkan hasil.
- Screenshot dan daftar screener yang diberikan pemilik bisa dipakai untuk menyusun **kasus audit**; jangan menganggap angka screenshot sebagai rekonstruksi candle, fill, volume relatif, atau timestamp tertentu yang tidak disediakan.

## 6. Instruksi siap pakai untuk Work
1. Audit PR #26 dan #27, terapkan status kedua hanya pada **LONG A 1M**, tanpa menyentuh 5M/15M/1H original LONG A, 50-slot cap, FCM, Railway atau APK.
2. Uji false RED pada JCT/AIN/BULLA/IRYS **jika dan hanya jika** data native candle yang cukup tersedia; laporkan unavailable (jangan imputasi). Uji continuation dan pullback, contoh EVAA berakhir, dan kandidat yang turun lalu tidak pulih.
3. Wajib menampilkan perbandingan baseline v15 vs V3 vs proposal status kedua pada periode dan denominator yang sama, beserta semua no-entry/expired/censored/unknown data.
4. Uji batas realtime, biaya dan error handling; dokumentasikan alasan tiap warna dan transisi, serta masa berlaku.
5. Jangan merge/deploy/terbitkan APK sebelum pemilik memberi keputusan berikutnya berdasarkan hasil audit. Siapkan bukti reproducible dan kesimpulan layak/tidak layak.

**Definisi keberhasilan:** bukan "banyak jadi Binance Top 1", melainkan **sinyal kedua muncul cukup awal, mengurangi entry salah/terlambat dalam data baru tanpa menghilangkan terlalu banyak peluang valid**, dan manfaatnya terukur net of costs.
