# Tahap 3 — Jalur singkat, tanpa mengubah YELLOW GOLD

1. **Ambil replay AS-OF yang sah** untuk 1H BR/WLD dan 1M JCT/DOOD + pecundang acak: OHLCV candle tertutup 1M/5M/15M/1H, ticker Binance 24H as-of, universe/top-50 dan state warm/cold. **Jangan pakai ticker saat ini sebagai pengganti ticker historis.** Hindari permintaan REST Binance tambahan jika data tidak tersedia; klaim tetap UNVERIFIED.
2. **Uji parity 1H** dengan commit evaluator yang sudah terverifikasi dan timestamp tepat; rekam alasan penolakan setiap setup, bukan memaksa +1% menjadi -2%.
3. **Bandingkan B1 vs B2 vs no-B** pada jendela 120 menit, termasuk contoh negatif dan INCOMPLETE. Hitung MFE/MAE dari harga **penutupan** B, bukan harga intrabar; belum jadi ROI leverage.
4. **Pembatas LIVE** jika nanti diminta: nol FCM selama shadow 3–7 hari; nol notifikasi LONG A 1M; maksimum satu hasil setelah B1/B2 yang lolos pada satu episode; batas kandidat/volume dan deduplikasi persistence harus diuji.
5. **Railway LAB independen** hanya setelah persetujuan: tidak pakai volume/key/topik FCM GOLD; sebelum menyalakan Binance kedua, tetapkan kuota REST IP konservatif dan jalur pemutusan otomatis, ukuran universe kecil, test bootstrap dan restart. Jika tidak dapat memastikan risiko Binance/isolasi, jangan deploy.
6. **APK LAB**: satu HOME, tanpa Universe; build debug via CI GitHub repo LAB yang benar-benar baru, uji paket berdampingan dengan GOLD, dan validasi deep-link TradingView native. Tidak mengasumsikan query URL otomatis memindahkan chart TV.

## Keputusan 21 Okt v0.3

0% 24h telah diterapkan pada fork evaluator 1M khusus LAB dan diuji offline; 1H tetap +1%. HOME masa depan disimpan 10 jam sejak penutupan sinyal, tanpa Universe; TradingView Mobile dicoba lewat package Android native, dengan salin simbol otomatis apabila deeplink diabaikan. Rincian pada `LAPORAN-TAHAP-3.md`. Ketiga fitur belum dihubungkan ke Binance/Railway live.
