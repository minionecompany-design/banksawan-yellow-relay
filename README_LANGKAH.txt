BANKSAWAN YELLOW — HOME 1 JAM PER SIMBOL

Sumber: branch yellow-long-a-v2-20261015, commit 56bf7c7ff385875077af38f080b97b4a30a57944.

Isi paket ini:
  scanner/src/live-home-ledger.js  [ganti file lama]
  scanner/test/live-home-ledger.test.js [ganti test lama]

Aturan setelah nanti di-deploy:
- Setiap simbol HOME kedaluwarsa 1 jam dari kemunculan pertamanya.
- HOME yang terlanjur disimpan dalam format 24h dibatasi menjadi 1h pada pembacaan berikutnya.
- Event LONG A tetap hidup hanya 5 menit.
- Dedupe klaim tetap 24 jam dan tidak menduplikasi FCM.
- Sinyal valid baru sesudah 1h dapat masuk HOME lagi.
- Tidak mengubah algoritma, API, kuota Binance, konfigurasi Railway, APK, ataupun BR.

PENTING: GitHub branch produksi YELLOW bernama yellow-long-a-v2-20261015.
MENGGANTI FILE DI BRANCH PRODUKSI DAPAT LANGSUNG MEMICU DEPLOY RAILWAY.

Rekomendasi: buat branch fix/yellow-home-1h-per-symbol-20261016 dari
branch di atas, ganti dua file pada branch fix, jalankan scanner tests offline,
baru review dan setujui merge/deploy secara terpisah.

Pengujian di sini: 6/6 focused tests PASS pada Node 22.16.0.
Belum ada commit/deploy ke GitHub/Railway.
