const BASE = "https://fapi.binance.com";

const PRICE_MAX = 30;
const CHANGE_MIN = 1;          // Universe APK: >= +1%
const SCAN_MS = 60_000;        // scan tiap 1 menit
const TIMEFRAMES = ["1m", "5m", "15m", "1h"];

async function getJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "banksawan-yellow-scanner/1.0" }
  });

  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText} ${url}`);
  }

  return r.json();
}

async function loadUniverse() {
  const [exchangeInfo, tickers] = await Promise.all([
    getJson(`${BASE}/fapi/v1/exchangeInfo`),
    getJson(`${BASE}/fapi/v1/ticker/24hr`)
  ]);

  const perpetual = new Set(
    exchangeInfo.symbols
      .filter(s =>
        s.status === "TRADING" &&
        s.contractType === "PERPETUAL" &&
        s.quoteAsset === "USDT"
      )
      .map(s => s.symbol)
  );

  return tickers
    .filter(t => perpetual.has(t.symbol))
    .map(t => ({
      symbol: t.symbol,
      price: Number(t.lastPrice),
      change24h: Number(t.priceChangePercent),
      volumeQuote: Number(t.quoteVolume)
    }))
    .filter(x =>
      Number.isFinite(x.price) &&
      x.price > 0 &&
      x.price < PRICE_MAX &&
      Number.isFinite(x.change24h) &&
      x.change24h >= CHANGE_MIN
    )
    .sort((a, b) => b.change24h - a.change24h);
}

async function loadKlines(symbol, interval, limit = 120) {
  const q = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit)
  });

  const rows = await getJson(`${BASE}/fapi/v1/klines?${q}`);

  return rows.map(k => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
    quoteVolume: Number(k[7])
  }));
}

async function inspectCoin(coin) {
  const tf = {};

  for (const interval of TIMEFRAMES) {
    tf[interval] = await loadKlines(coin.symbol, interval);
  }

  return {
    ...coin,
    tf
  };
}

/*
  PENTING:
  Jangan isi fungsi ini dengan tebakan.

  Di sinilah nanti rumus asli BANKSAWAN LONG A / YELLOW
  dari Pine Script dipindahkan.

  Sampai rumus asli tersedia, selalu false agar APK
  tidak menerima sinyal palsu.
*/
function isBanksawanYellow(snapshot) {
  return false;
}

async function scanOnce() {
  const started = new Date();
  console.log(
    `[SCANNER] start ${started.toISOString()}`
  );

  const universe = await loadUniverse();

  console.log(
    `[SCANNER] universe=${universe.length}`
  );

  // Untuk tahap validasi awal, batasi agar tidak menghajar rate limit.
  // Setelah engine Yellow selesai, concurrency kita optimalkan.
  for (const coin of universe) {
    try {
      const snapshot = await inspectCoin(coin);

      if (isBanksawanYellow(snapshot)) {
        console.log(
          `[YELLOW] ${coin.symbol} price=${coin.price} change=${coin.change24h}%`
        );

        // Belum push Firebase sampai rumus Yellow asli sudah dipasang.
      } else {
        console.log(
          `[CHECK] ${coin.symbol} ${coin.change24h.toFixed(2)}%`
        );
      }
    } catch (e) {
      console.error(
        `[ERROR] ${coin.symbol}:`,
        e.message
      );
    }

    // jeda kecil agar request Binance tidak ditembak serentak
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(
    `[SCANNER] done ${new Date().toISOString()}`
  );
}

let running = false;

async function loop() {
  if (running) return;

  running = true;

  try {
    await scanOnce();
  } catch (e) {
    console.error("[SCANNER FATAL]", e);
  } finally {
    running = false;
  }
}

console.log("BANKSAWAN YELLOW SCANNER BOOT");
loop();
setInterval(loop, SCAN_MS);
