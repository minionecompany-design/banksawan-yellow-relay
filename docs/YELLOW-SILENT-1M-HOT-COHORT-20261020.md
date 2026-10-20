# YELLOW — eksperimen pasif 1M LONG A → HOT (20 Oktober 2026)

## Tujuan pengguna
Tetap hanya menampilkan dan mengirim LONG A **5M/15M/1H**. User tidak ingin daftar/FCM 1M membludak lagi. Penelitian khusus: apakah LONG A 1M yang diikuti HOT oranye berbentuk **belah ketupat** pada Pine dalam maksimum 2 jam dapat membedakan penguatan bertahap seperti JCT dari kandidat yang gagal. **LONG B oranye berbentuk segitiga berbeda dari HOT.**

## Cara kerja shadow, SELALU diam-diam
- Runtime option opt-in **`YELLOW_1M_HOT_SHADOW_ENABLED=true`**; default false. Tanpa flag, code ini tidak menulis data atau mengubah pemindaian.
- Menggunakan **hasil state 1M asli yang sudah dihitung** oleh scanner (LONG A dan `countUp`, `tradeState`), serta 1M CLOSED bars CandleBook existing. Tidak ada request Binance/WS baru.
- LONG A 1M yang memang ditahan sebelum HOME/FCM menjadi episode `symbol+eventId+startPrice+time`, selama 120 menit. HOT **hanya setelah A** bila `tradeState !== 0` dan `countUp` tepat 9/13/14/15/16, konsisten Pine v1.3.
- Simpan waktu/harga HOT 1, 2, 3 serta jumlah HOT seluruhnya; `selected` hanyalah calon hipotesis bila harga penutupan HOT di atas harga penutupan A. Tidak ada rekomendasi entry otomatis.
- 120 candle 1M lanjutan dicatat kontinu; jika gap/cakupan terputus, episode `INCOMPLETE`, **tidak dihitung sebagai sinyal palsu**. Hasil dengan jendela selesai `COMPLETE`. High/low dari candle A tidak dipakai sebagai return pasca-sinyal. High/low HOT sendiri tidak dipakai sebagai return pasca-HOT; hanya candle SETELAH HOT untuk menghindari lookahead.
- Statistik agregat saja di `/api/status.shadow1mHot`: `enabled,initialized,storageFailures,lastFault,persisted,allRetained,last24h`. **Tidak ada simbol per episode, daftar 1M, kartu HOME, endpoint baru, event feed, FCM, atau push.**
- Maksimum 240 episode, retensi 7 hari, file JSON atomik terpisah `/data/yellow-1m-hot-research-v1.json`, debounce penulisan 60 detik, fail-open jika hanya recorder yang rusak. Data paling akhir hingga 60 detik bisa hilang jika proses mendadak mati; counters restart dapat direset. Apabila kelas exception dan recorder dinonaktifkan, jalur detektor/FCM normal tetap utuh.
- Agregasi dibedakan: HOT dalam 2 jam, HOT 1/2/3, HOT yang harganya > A, seluruh episode selesai, episode kehilangan candle, `weakWithoutConfirmation` (tidak terkonfirmasi dan MFE dari A <2% dalam 2 jam), `strongWithoutConfirmation` (tanpa konfirmasi tapi MFE dari A ≥5%), `strongAfterConfirmation` (MFE setelah HOT ≥5%), `weakAfterConfirmation` (MFE setelah HOT <2%). **Batas 2% dan 5% hanya bucket riset pra-definisi, BUKAN laba trading, false positive/negative terbukti, GOLD cutoff, atau biaya/slippage.**
- **Kohort observasi prospektif saja**: contoh JCT screenshot 20 Okt tidak boleh dihitung sebagai tertangkap sebelum observer live. Jangan lakukan retrospektif menggunakan harga hari ini untuk `ticker24h` saat 10:51; yang tidak diliput scanner saat itu juga tidak dapat diklaim sebagai kandidat terlewat.

## Contoh format LAPORAN untuk pengguna, BUKAN daftar koin
```
LAPORAN SILENT 1M + HOT — 24 jam (semua angka dari status saat nanti aktif)
LONG A 1M diamati: N
Episode belum selesai / tidak lengkap: N / N
Episode 2 jam lengkap: N
Punya HOT pertama / kedua / ketiga: N / N / N
Konfirmasi positif harga HOT > harga A: N
Tanpa konfirmasi, kenaikan maksimal <2%: N (calon lemah tersaring)
Tanpa konfirmasi, ternyata sempat naik >=5%: N (peluang kuat terlewat)
Dengan konfirmasi, kenaikan setelah HOT >=5%: N
Dengan konfirmasi, kenaikan setelah HOT <2%: N
Status persist / fault: N / -
```
Tidak ada daftar 1M di HOME. Kalau sampel cukup dan user meminta, auditor membandingkan hasil dengan 5M/15M/1H, volume kandidat dan loss of winners. Jangan kirim alert 1M tanpa uji sampel berimbang.

## Proses pelepasan yang terpisah
1. Cabang dan PR penelitian terpisah, review test/CI dulu. **Jangan deploy otomatis.**
2. Untuk menjalankan eksperimen yang sungguh nyata butuh **izin eksplisit satu kali merge+deploy dan opt-in env `YELLOW_1M_HOT_SHADOW_ENABLED=true`**. User saat ini hanya mengizinkan penyiapan uji coba; production/FCM/HOME tidak diubah sampai approval.
3. Deployment melakukan restart normal scanner; setelah aktivasi kembali pantau WS/cold state dan guard Binance. Tidak menambah berat requests.
4. Setelah aktivasi dan durasi minimal 3–7 hari natural, baca `/api/status.shadow1mHot` untuk ringkasan; laporkan *N/A* jika pending/INCOMPLETE, bukan menuduh sinyal palsu. Tidak ada perubahan threshold GOLD-only.
