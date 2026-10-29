BANKSAWAN YELLOW V8 – Bukti suara notifikasi LONG A (foreground)

PENTING:
- Patch hanya branch yellow-long-a-v2-20261015. JANGAN merge main / ubah BR #205.
- Ekstrak dan unggah 6 file sumber ke direktori yang tepat, termasuk file tersembunyi .github/workflows/android-debug.yml.
- NOTIFIKASI NORMAL dari LONG A sungguhan aktif hanya selama APK dibuka di layar/foreground. Events dibaca setiap ~10 detik dari YELLOW Railway API, tidak ada request Binance tambahan.
- Tombol TES SUARA NOTIFIKASI menghasilkan notifikasi uji lokal. BUKAN event LONG A, tidak mengubah HOME, tidak memanggil API, tidak mengirim trade.
- FCM background sengaja tetap OFF; agar notifikasi saat aplikasi ditutup berfungsi, perlu Firebase YELLOW mandiri (google-services.json pada GitHub secret dan service account pada Railway secret). Jangan gunakan kredensial/FCM BR.
- Bunyi notifikasi bergantung pada izin Android, volume notifikasi, pengaturan channel YELLOW dan Do Not Disturb.
- Setelah commit, buka GitHub Actions untuk artifact banksawan-yellow-v8-LIVE-SOUND-PROOF-debug dan pasang di HP.
- Di HOME tekan TES SUARA dan periksa bunyi. Untuk tes natural 1M/5M/15M, biarkan APK terbuka, tunggu event LONG A baru, cocokkan TradingView serta notifikasi.
- Satu card HOME tetap per simbol/timeframe pertama; notifikasi event per timeframe independen (1M/5M/15M/1H). Belum ada jaminan kapan 5M/15M alami akan muncul.
- No modification to Railway service/source/volume or BR #205.

Commit suggestion: Enable YELLOW V8 live foreground LONG A notifications and safe sound test
