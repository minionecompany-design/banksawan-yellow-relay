# BANKSAWAN YELLOW — Persiapan FCM latar belakang (TANPA mengganggu scanner)

## Status dan batasan

Patch ini hanya mengubah **GitHub Actions** dan menambahkan skrip validasi + .gitignore.
Tidak menyentuh kode algoritma LONG A, data-plane Binance, Railway, atau BR #205.
APK V8 saat ini **tetap bekerja seperti sebelumnya**. FCM Railway **tetap OFF**.

Jalur Android receiver dan backend FCM sender **sudah tersedia** di source sebelumnya.
Receiver Android membaca pesan data-only jenis `YELLOW_LONG_A` dan menggunakan dedupe yang
sama dengan notifikasi foreground. Topic YELLOW: `banksawan-yellow-v2`. Tidak boleh pakai topic BR.

## Urutan aman

1. Pasang/Hubungkan Firebase resmi di ChatGPT bila tersedia, supaya pengelolaan project
   independen bisa dilakukan langsung dari aplikasi. Atau gunakan https://console.firebase.google.com/.
2. Gunakan project Firebase terpisah yang SUDAH ADA: `banksawan-yellow`; bukan `banksawan-radar` atau `banksawan-entry`.
3. Di project Firebase YELLOW sudah terdaftar app Android kedua **BANKSAWAN YELLOW V8**, package `id.banksawan.yellow`.
   Jangan gunakan app lama `com.banksawan.yellowclean`.
4. Download file `google-services.json` **khusus app `id.banksawan.yellow`**. Jangan commit file itu atau
   kirim ke chat. Gunakan GitHub repository Settings → Secrets and variables → Actions →
   New repository secret:
   `YELLOW_FIREBASE_GOOGLE_SERVICES_JSON_BASE64` = base64 dari isi file konfigurasi.
   Hindari mem-posting base64 di chat; buat dari komputer pribadi.
5. Pada GitHub repository SECRETS (bukan Variables),
   `YELLOW_FIREBASE_PROJECT_ID` sudah disimpan oleh user dengan nilai `banksawan-yellow`.
   Workflow membaca `${{ secrets.YELLOW_FIREBASE_PROJECT_ID }}`.
6. Pada GitHub repository Variables: `YELLOW_FIREBASE_PILOT_ENABLED` = `true`
   **hanya ketika siap untuk menjalankan build FCM opsional**. Default: tidak ada/false.
7. Workflow GitHub yang baru tetap menghasilkan APK V8 foreground di job lama.
   Saat PILOT_ENABLED=true, job kedua memvalidasi project ID + package Android,
   dan **gagal tertutup** bila secret hilang/mismatch. Artifact FCM tersendiri:
   `banksawan-yellow-v8-FCM-BACKGROUND-PILOT-debug`.
8. Instal artifact FCM pilot di HP; izinkan notifikasi, periksa Firebase token/topic.
   Apabila sertifikat debug berbeda dan Android menolak update, simpan data penting
   terlebih dahulu karena reinstall bisa menghapus preferensi lokal YELLOW.
9. Aktivasi pengiriman backend baru dilakukan SESUDAH terbukti project, app, token/topic,
   build dan uji background. Service account khusus YELLOW disimpan sebagai secret
   `YELLOW_FCM_SERVICE_ACCOUNT_JSON` **HANYA di Railway YELLOW**.
   `YELLOW_FCM_ENABLED=true` adalah tahap aktivasi terpisah yang biasanya memicu redeploy
   Railway scanner. Jadwalkan terkontrol setelah pembuktian/checkpoint, jangan dilakukan
   sambil scanner dipantau sebagai baseline.
10. Uji pesan FCM data-only terkontrol, lalu kandidat LONG A alami pada 1M/5M/15M.
    Gunakan event ID asli, dedupe, dan kedaluwarsa maksimal 5 menit.

## Prosedur pengaman

- Jangan gunakan Firebase project, topic, atau service account BR #205.
- Jangan memasukkan private key Firebase dalam GitHub source atau chat.
- Tidak ada transaksi trading, tidak ada endpoint Binance tambahan.
- Build khusus YELLOW tetap pada branch `yellow-long-a-v2-20261015`; JANGAN merge `main`.
- FCM data-only `onMessageReceived` dapat berjalan saat aplikasi di-background,
  tetapi Android Doze, penghemat baterai, permission, dan layanan Google Play bisa
  membuat notifikasi tertunda/tidak terkirim. Butuh pembuktian nyata di HP.
- Jangan menganggap suara TES lokal sama dengan bukti pengiriman Firebase.
- Jika GitHub Actions gagal karena workflow `if`/secret, tetap gunakan V8 lama;
  jangan me-redeploy Railway untuk membetulkan build Android.

## Verifikasi lokal skrip

`python3 -m unittest discover -s scripts -p 'test_*.py' -v`

## Source resmi

https://firebase.google.com/docs/android/google-services-plugin-and-file
https://firebase.google.com/docs/cloud-messaging/android/receive-messages
https://firebase.google.com/docs/cloud-messaging/android-message-priority

## Koreksi GitHub per 15 Oktober 2026

Dua nilai sudah dibuat sebagai GitHub repository **Secrets**, sesuai screenshot:
`YELLOW_FIREBASE_GOOGLE_SERVICES_JSON_BASE64` dan `YELLOW_FIREBASE_PROJECT_ID`.
Gunakan workflow versi patch ini, yang membaca project ID dari **secrets**,
bukan `vars`. Tidak perlu menyalin ulang Project ID ke Variables.
Repo Variable `YELLOW_FIREBASE_PILOT_ENABLED` tetap **BELUM DIBUAT/false**
sampai workflow terpasang dan kita siap build pilot.
