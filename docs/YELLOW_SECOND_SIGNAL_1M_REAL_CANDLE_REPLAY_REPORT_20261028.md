# YELLOW — REAL-CANDLE REPLAY: SECOND SIGNAL TF1M
28 Oktober 2026 WIB | **Tidak LIVE — bahan audit Work**

## Mandat dan cakupan
Pemilik meminta menguji seluruh petunjuk kandidat: momentum harga sejak LONG A, penurunan gagal yang semestinya dihindari, pullback pulih, kenaikan bertahap (continuation), volume, konteks 5M/15M/1H, peringatan risiko dan peluang warna. Pengujian yang benar tidak boleh berpura-pura memiliki quote Binance historis apabila arsip hanya menyimpan candle.

- Source: **46** kejadian LONG A yang ada pada `docs/evidence/entry-v3-20261028/manifest.json`, setiap sumber candle gzip **divalidasi SHA256** sebelum proses. **28 kejadian 1M** diputar ulang, **16 5M dan 2 15M** tetap ada dalam laporan sebagai `OUT_OF_SCOPE_NON_1M`. Tiga kejadian lain tanpa data: NOM 1M, NOM 5M, INJ 5M. Tidak ada pemilihan kasus pemenang saja.
- Setiap 1M candle tertutup ditinjau pada `bar.endMs+1000` dengan snapshot `endMs <= bar.endMs`, tanpa akses ke candle masa depan ketika lampu diputuskan. Mesin V3 `advanceReadinessWatch` dan proposal `secondSignal1m` diputar secara kausal, **ticker=null** karena tidak tersedia quote timestamp, 24H change, bid/ask dan quote volume historis. Persentase sejak A dihitung pada harga close candle, **bukan harga live**.
- Horizon penilaian maksimal **360 menit** setelah sinyal; 15/28 jendela enam jam lengkap, 13 tersensor. Perlu verifikasi ketersediaan native HTF tepat saat close bila menghubungkan ke LIVE.
- Tes terakhir GitHub Actions **run 40612518277** (source SHA `3839add4d0b40f5dca737cb583c18df8289f5904`): **279/279 Node scanner lulus**, 6 source contracts dan 15 Python release-safety lulus; step replay archived second signal lulus, evidence artifact `yellow-second-signal-1m-actual-candle-replay` ID **12783752199**, berisi `full-replay.json` dan `summary.json`. Signed release terpisah di-skip; Android QA diperiksa secara independen dalam run yang sama.

## Ringkasan hasil pada arsip (BUKAN estimasi probabilitas)
| Ukuran | Hasil |
|---|---:|
| Kasus LONG A 1M | 28 |
| Pengamatan penuh 6 jam | 15 |
| Belum lengkap / censored | 13 |
| Kasus pernah MERAH | **5** |
| Kemunculan MERAH selama closed minutes | 19 |
| Kemunculan KUNING selama closed minutes | 7.462 |
| OFF / BERAKHIR selama closed minutes | 299 |
| Satu event dengan >=20% MFE | **2 kejadian**, AIN dan EVAA |
| RED sebelum event dengan MFE >=20% | **0/2** dalam arsip yang tersedia |
| Kasus merah lalu naik >=10% dari harga saat merah | **0/5** dalam observasi tersisa, tiga kasus red memiliki jendela keseluruhan tersensor |
| Kasus merah lalu naik >=5% dari harga saat merah | **1/5**, JCT |
| Konfirmasi candle V3 1M | **1** PULLBACK HUMA; di evaluasi fill lama berstatus NOT_ENTERED |
| Konfirmasi candle CONTINUATION V3 1M | 0 |
| HIJAU historis yang sah | **TIDAK DAPAT DINILAI** tanpa stream quote fresh dan market eligibility |

**Jangan menyebut HIJAU=0 sebagai nol peluang GREEN.** Rekonstruksi warna hijau dilarang oleh desain test saat ticker historis tidak tersedia. Namun prototype V3 hanya satu kali mengonfirmasi dari candle, sehingga tidak membuktikan ia akan menangkap pemenang.

### Dua kenaikan besar yang terekam (MFE terhadap harga A, maksimum HIGH 1M hingga 6 jam)
- `AINUSDT:1m:1793080560000:LONG_A`: **+32,16011%** maksimum, MAE -10,74017%; 6 jam lengkap. Tidak mendapat RED pada replay, namun juga tidak ada GREEN valid yang dapat direkonstruksi.
- `EVAAUSDT:1m:1793121060000:LONG_A`: **+30,13423%** maksimum, MAE -0,01342%; 6 jam lengkap. Tidak mendapat RED; seri contoh continuation yang perlu dianalisis secara terpisah. Tidak ada GREEN valid yang dapat direkonstruksi.
- **Catatan penting:** Ini ID kejadian berbeda dari angka screenshot AIN `0.07383` atau EVAA `0.745` jika timestamp/entry berbeda. Jangan mencampur return antarkejadian meskipun simbol sama.
- **IRYS** tidak termasuk 28 kasus 1M dalam arsip replay ini. Screenshot harga A / kemudian saja **tidak cukup** untuk menguji dinamika 1M, volume dan lampu.
- Ada 7 kejadian dengan MFE >=5% dalam data yang tersedia (termasuk AIN yang muncul dua kali sebagai dua event berbeda); **MFE adalah kesempatan kenaikan tinggi dari harga A, bukan profit yang pernah dicapai via order**.

### Semua kejadian yang pernah mendapat MERAH
| Event | MERAH sesudah LONG A | Kembali naik dari harga saat RED (max HIGH) | Window 6h lengkap? |
|---|---:|---:|---|
| CT 1M | 116 menit | +2,80% | Ya |
| 1000BONK 1M | 134 menit | +1,05% | Tidak |
| HUMA 1M | 153 menit | +0,51% | Tidak |
| JCT 1M | 171 menit | **+5,12%** | Ya |
| BABY 1M | 203 menit | +0,35% | Tidak |

Median muncul MERAH = **153 menit** setelah LONG A. **Ini terlambat untuk menjadikannya alarm awal tanpa revisi.** JCT membuktikan label MERAH **tidak boleh berarti koin tidak akan naik lagi**. JCT sempat memulihkan harga melewati harga A setelah RED pada periode observasi yang sama.

### Persentase dan volume — mana yang sudah bisa dinilai?
- **Return sejak LONG A** dapat direkonstruksi per closed 1M candle: `(close1m/priceA - 1)*100`. MFE/MAE dan perubahan per 5/15/30/60/120/360 menit dilaporkan di `full-replay.json` hanya bila tersedia candle pada waktu terkait.
- **Volume relatif 1M** ditaksir dari volume closed candle dibanding 20 candle sebelumnya (indikator market activity, bukan agresi pembeli/penjual dari order flow yang tak tersedia). Dalam prototipe RED perlu volume >=1.5x dan tren native 5M DOWN, 15M bukan UP.
- **CHG% 24H saat A tidak ada** pada seluruh 28 data event dalam manifest. Oleh sebab itu **belum bisa menguji** apakah 24H +1%, +10%, +100% memprediksi kelanjutan. Screenshot IRYS/AIN boleh jadi ilustrasi tetapi tidak valid untuk perhitungan statistik.
- **GREEN berdasarkan quote** tidak tersedia; ticker last price as-of, quote freshness, 24H change saat konfirmasi, quote volume 24H dan spread tidak ada. Tidak boleh memakai OHLC close untuk mengaku mendapat GREEN pada aplikasi nyata.
- **Hasil TP1 versus SL** untuk sinyal kedua tidak bisa dinilai: tidak ada eksekusi order dan hanya satu plan V3 yang tidak terisi pada simulasi lama.

## Evaluasi per hipotesis
1. **Hindari kenaikan palsu**: hanya 5/28 memberi RED, dan RED paling awal muncul pada menit 116, bukan menit-menit awal. Aturan terlalu lambat untuk fungsi peringatan dini; harus diuji ulang terhadap kesempatan yang benar-benar tersedia sesudah A. Lima kasus bukan bukti prediktif.
2. **Pullback pulih**: satu candle setup V3 pada HUMA tapi bukan entry terisi; dua kandidat naik >=20% belum otomatis mendapat sinyal kedua yang dapat diverifikasi. Belum lulus kriteria penangkapan peluang.
3. **Continuation**: EVAA tumbuh >30% dalam pengamatan lengkap tanpa merosot jauh (MAE ~0%), sedangkan V3 menghasilkan **0 konfirmasi continuation**. Ini **gap besar** pada tujuan pengguna yang penting diuji lagi; tidak boleh ditutup dengan melonggarkan threshold terhadap kejadian yang sama saja.
4. **Persentase 24H**: gagal diuji statistik karena kolom t0 tidak tersedia. **Persentase sejak A** baru sebatas indikator post-event, belum terbukti membawa kekuatan prediksi tambahan.
5. **Skenario dan warna**: prinsip pemisahan YELLOW / RED / GREEN / OFF telah lulus regression logika, termasuk data stale / future-peeking / non1M, tetapi belum validasi nilai trading.
6. **Sinyal tidak terlambat**: **tidak tercapai** pada lima kasus RED (median 153m). Ukur konfirmasi sebelum kenaikan, bukan setelah jadi top gainer.

## Keputusan dan rekomendasi untuk audit Work
**NO GO LIVE SECOND SIGNAL** saat ini. Pertahankan YELLOW v15 LIVE yang sudah ada; PR #26 dan #27 tetap Draft. Jangan build APK/deploy Railway dari laporan ini.

Langkah terukur berikutnya:
1. Audit `full-replay.json` pada 28 event, terutama AIN (pullback), EVAA (continuation), JCT (false-warning/recovery), CT dan BABY (red), HUMA (plan NOT_ENTERED). Uji ambang dengan data *baru* bukan memaksakan cocok dengan lima contoh sejarah.
2. Pastikan penyimpanan `CHG 24H at A`, `quote volume at A`, `last price as-of`, `ticker observedAt`, setiap perpindahan lampu dan snapshot context 4 TF. Jika tidak ada data, berikan UNKNOWN, bukan RED/GREEN.
3. Percobaan prospektif/forward unseen: latency A→warna pertama, A→HIJAU, MFE/MAE setelah tiap warna, false RED, missed gain, missed continuation, fill ENTRY & outcome net costs. Tanpa puluhan kasus independen dan bukti dari data tak terlihat, jangan klaim probabilitas.
4. Review apakah logika RED harus menangani risiko di menit 1–30 terpisah dari trend breakdown lama. Hindari false-red saat pullback yang sehat.
5. Jangan jadikan status HIJAU sebagai perintah entry; tetap validasi harga/volume/risk dan masa 3 menit.

## Reproduce
```bash
node --test --test-concurrency=4 scanner/test/*.test.js
node scanner/scripts/compare-second-signal-1m.mjs docs/evidence/entry-v3-20261028/manifest.json > full-replay.json
```
GitHub Actions artifact: https://github.com/minionecompany-design/banksawan-yellow-relay/actions/runs/40612518277

**Interpretasi jujur:** uji coba keseluruhan PETUNJUK belum selesai; yang sudah selesai adalah replay awal candle, bukan pembuktian kemampuan memprediksi kenaikan. False RED di JCT serta nol continuation adalah alasan konkret untuk tidak deploy.
