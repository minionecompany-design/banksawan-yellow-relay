BANKSAWAN YELLOW V9 — UI RAPI + FIREBASE PILOT

Branch: yellow-long-a-v2-20261015. JANGAN merge ke main.

Penting: Paket ini HANYA mengubah MainActivity.java (UI), android/app/build.gradle
(versionCode 5), dan 3 file test Android. Tidak mengubah scanner, REST Binance,
Firebase sender, Railway environment, maupun BR #205.

Perubahan layar:
- Hapus logo header, subjudul, banner coklat, teks bawah HOME, test sound button,
  dan hanya SEMBUNYIKAN tulisan Hilang otomatis (TTL backend tetap 24 jam).
- Tampilkan BANKSAWAN YELLOW, status LIVE SHADOW, HOME/UNIVERSE, dan
  satu tombol TradingView per HOME.
- Detail di card 2 kolom: kiri label kecil abu-abu, kanan angka tebal rata kanan.
- Tambah ruang status bar Android, menghindari teks nabrak jam/ikon HP.

Upload ke GitHub pada branch YELLOW:
1. Extract ZIP ke folder.
2. Unggah isi folder android/... dan scanner/test/... TANPA mengubah path.
3. Commit: 'YELLOW V9 clean HOME UI and BR-style candidate details'.
4. GitHub Actions Android workflow yang sudah ada akan otomatis build.
   Jika repository variable YELLOW_FIREBASE_PILOT_ENABLED=true, dua job Android
   (foreground dan Firebase) akan dijalankan; Firebase harus lulus validasi.
5. Artifact workflow saat ini masih bernama v8 meskipun versionCode APK adalah 5.
   Prioritaskan melihat run commit terbaru. Kita bisa rapikan nama workflow
   belakangan; tidak mengubah scanner.
6. Saat pemasangan APK, SIGNATURE DEBUG yang berbeda antar workflow mungkin
   menolak update di atas APK V8. Jangan uninstall tanpa mempertimbangkan data lokal.
   HOME dipasok dari Railway, tetapi preferensi lokal akan hilang bila uninstall.
7. FCM Railway tetap OFF sampai kredensial pengirim disimpan secara aman
   dan user menyetujui aktivasi/redeploy terkontrol.

Tidak ada SIGNAL yang dibuat untuk pengujian. Uji scanner alami sesudah install.
