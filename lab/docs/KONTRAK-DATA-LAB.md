# Kontrak LAB v0.3 — HOME future-only; belum tersedia live

Server research offline mengembalikan `mode: LAB_OFFLINE_RESEARCH`, `simulation: true`, `home: []`. APK menolak memprosesnya sebagai sinyal live.

Publisher LAB terpisah yang **nantinya telah disetujui dan diuji** wajib menghasilkan data seperti:

```json
{
  "simulation": false,
  "mode": "LAB_LIVE",
  "home": [
    {
      "id": "DOODUSDT:1m:1797000600000:LONG_B",
      "symbol": "DOODUSDT",
      "timeframe": "1m",
      "signal": "LONG_B",
      "bOrdinal": 1,
      "price": 0.0023,
      "signaledAtMs": 1797000600000,
      "expiresAtMs": 1797036600000
    }
  ]
}
```

**Data hanya contoh skema, BUKAN sinyal terbit.** `expiresAtMs = signaledAtMs + 36_000_000` (10 jam sejak candle sinyal B/1H A). 1M LONG A, HOT, LONG B3+ tidak pernah masuk HOME; B1/B2 hanya sesudah A pertama dan PROTECT terverifikasi. Satu episode menghasilkan paling banyak satu kartu, dan 12 kartu HOME maksimal.

`scanner/src/home-policy.js` menolak data yang tidak terverifikasi sebagai candle tertutup, as-of eligible, harga `>=10`, event di masa depan/kedaluwarsa, dan LONG A 1M. Data live harus memuat pembuktian tersebut secara internal. **Tidak membuat notifikasi aktif.**

`/api/status` live kelak harus menunjukkan `ok:true`, `dataFresh:true`, `mode:'LAB_LIVE'`, `simulation:false` sebelum APK menerima HOME. API LAB menggunakan domain berbeda dari GOLD.
