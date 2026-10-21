# Tahap 3 LAB v0.3 — Filter 0%, HOME 10 jam, TradingView Mobile

Tanggal persiapan: 21 Oktober 2026. Semua pekerjaan **offline**.

## Keputusan teknis

| Fitur | LAB v0.3 | Yang belum tersedia |
| --- | --- | --- |
| 1M | Binance ticker 24h >=0%, harga <10, perpetual, as-of | Universe live, cakupan dan scanner Binance khusus LAB |
| 1H | Binance ticker 24h >=+1%, harga <10 | Pembuktian parity Pine realtime / data historis BR-WLD |
| 1M seleksi | A1 diam, PROTECT, B1/B2, maksimal 120 menit | Statistik prospektif, ambang kualitas tervalidasi, FCM |
| HOME | Hanya sinyal terpilih, tidak ada Universe, maksimal 12 kartu, hapus setelah 10 jam sejak penutupan sinyal | Publisher live (server saat ini sengaja `home:[]`) |
| TradingView | Intent `ACTION_VIEW` ditujukan eksplisit ke package native TradingView, simbol dan interval sesuai card; simbol disalin otomatis | Pengujian aktual di TradingView Mobile dan jaminan app mengikuti deeplink |

### Mengapa 1M 0% tetapi 1H tetap +1%?

Ini **eksperimen kelayakan cakupan**, bukan kesimpulan bahwa 0% meningkatkan kualitas trading. Pada 1M kita ingin mempelajari apakah A pertama muncul sebelum kandidat menembus +1% 24h. Pada 1H akar absennya sinyal BRU/WLD belum terbukti, jadi syaratnya tidak dilonggarkan.

### Tentang 10 jam

HOME 10 jam **berbeda** dari jendela A→B maksimal dua jam. Misal A 10:00, B1 lolos 10:35: kartu HOME dari 10:35 hingga 20:35. Tidak boleh reset jam ketika aplikasi dibuka, polling atau server restart. Jika B2 muncul dalam episode sama setelah B1 lolos, tidak boleh muncul ulang.

### Keselamatan yang dibuktikan oleh tes

- Evaluator fork LAB saja yang menggunakan 0%; file referensi GOLD tetap sama.
- Cek batas -0,01%; 0%; +0,5%; +1%; dan harga 9,999999 / 10 USDT.
- As-of ticker, 1H tetap +1%, no-lookahead.
- TTL 10 jam diuji di batas tepat, dan dedup B dalam satu episode.
- Source APK HOME-only, tidak memiliki jalur buka Chrome, pakai package native dan salin simbol fallback.
- Riset tidak memiliki REST Binance, WS, Firebase maupun order trading.

### Sebelum benar-benar memakai APK LAB

1. Kompilasi debug APK di GitHub Actions repository LAB tersendiri lalu instal berdampingan dengan GOLD.
2. Uji pada Android dengan TradingView Mobile versi terpasang: klik DOOD lalu JCT dan pastikan simbol berpindah. Jika aplikasi TradingView tetap menampilkan chart terakhir, gunakan simbol yang sudah otomatis disalin; jangan mengklaim fungsi deeplink terbukti tanpa tes perangkat.
3. Baru setelah itu bangun konektor data LAB dengan guard REST/IP; penelitian 3–7 hari, FCM tetap mati.
4. Tes replay lengkap dan izin eksplisit sebelum Railway LAB live / notifikasi.
