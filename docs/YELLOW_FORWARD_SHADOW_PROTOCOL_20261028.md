# Forward shadow 1M — frozen collection protocol

Status: research only, no production imports, no orders, FCM, Railway changes or APK. Continue PR28 source9513be09. All new genuine LONG A 1M are the denominator, including failures, missing warmup, late discovery, gaps and restart censoring. Other LONG A TFs remain unchanged and are explicitly excluded from second-signal decisions.

Separate operator-run process: read original `/api/events` every5s and take one bounded `/api/research/candles` warmup per newly observed symbol. These two GET routes do not publish the existing HOME green. Never poll `/api/home` or `/api/analysis`, whose assessments can publish baseline green. Subsequent market inputs come from a separate free public Binance market WebSocket: native closed1m/5m/15m/1h and all-market24h ticker. No API keys, new app or paid API. The observer timestamps its own receipt, not the production scanner's receipt; this distinction remains an explicit limitation.

Warmup is available only from its actual receipt forward, filtered to the first event's original signal close. It is not prospective outcome data. There is no REST backfill to repair a post-A gap. Matching native higher-TF delivery may defer a minute at most90s. Decisions retain actual receipt order/time and cannot be rewritten after later inputs. All input, evidence and output transactions go to a bounded append-only fsynced SHA256-chain journal. Clock reversal, corrupt/truncated journal, disk/capacity failure and unexpected stream closure stop collection fail-closed. Restart replays and validates committed transactions, then censors active opportunities/positions; it never reactivates a previous green.

Compare unchanged v15 watch, fixed V3, V4 and ONE compositor on identical inputs. V3/V4 candle confirmations, individual gates, priority, one-lamp transitions, first GREEN, original event price/24h stats, ticker exchange time/local receipt, return since A, candle OHLCV, volume relative to prior20 and native context are recorded. PANTAU PRIORITAS stays YELLOW/non-entry; RED is conditional risk, not SHORT or a claim the asset can never recover.

Two explicitly different simulations: (1) existing next-full-minute-open OHLC paper,14bps combined assumed cost, ambiguity/gaps retained; (2) first eligible GREEN ticker LTP paper, later ticker SL/TP1/120min exit,14bps assumed cost. The second is a quote-observed hypothetical fill, not an executable ask or actual trade. TP2/3 touches are diagnostics only. No spread/order-book/slippage certification is inferred. A paper position remains open independently of the three-minute invitation after it has filled; a data gap censors it. No candle's pre-entry high/low can exit a ticker-entered position.

Ticker-only exits are named `OBSERVED_TP1_FIRST` / `OBSERVED_SL_FIRST`, not verified market-path outcomes: moves between samples remain unknown. A gap of30s between observed samples censors an open ticker simulation. Timeout uses the first fresh sample at/after120min and is labeled `OBSERVED_TIMEOUT`; it is not a precisely executable price at the deadline. TP2/3 diagnostics stop at the120min horizon. Limits:1000 source events,200 retained symbols (<=801 subscriptions),512 queued journal inputs,512MiB journal by default; reaching a limit stops collection, never silently discards losers. No automatic reconnection/backfill hides outages.

Overlapping six-hour signal windows for the same symbol form one connected market episode. Repeated TF/events are not independent trades. Missing windows, dropped coverage and censored positions stay in reports. Retrospective archive and synthetic fixtures are never labeled prospective. Dataset size alone cannot authorize GO; a separate preregistered improvement/uncertainty and cost review is required.

The code prepares collection. It does not start a persistent production service. A continuous host with durable separate storage, working public WebSocket access, synchronized clock and monitored disk/coverage is needed for meaningful forward data. Explicit owner approval remains necessary for any merge, Railway deployment or APK release.

## Operator runbook

Use Node22+, an exact clean reviewed research checkout, a clock synchronized to UTC, and a separate writable durable directory. The default command is safe to inspect without network:

```sh
node scanner/scripts/collect-forward-shadow-1m.mjs --plan
```

When a dedicated observer host is available, the explicit collection command is:

```sh
YELLOW_RESEARCH_SHA="$(git rev-parse HEAD)"
node scanner/scripts/collect-forward-shadow-1m.mjs --collect /var/lib/yellow-forward-research "$YELLOW_RESEARCH_SHA" 12
```

This runs at most12h, polls the two existing GET routes, subscribes to public market streams, and writes only to that directory. It does not deploy anything. `forward-config.json` freezes the cohort/source; `forward-shadow.ndjson` is the fsynced transaction truth; `forward-receipt.json` is a regenerable report. For a changed source use a NEW cohort directory. Never tune an active cohort. Preserve directories and all stop/failure receipts. Inspect every coverage issue. A process restart censors old active watches/positions and creates a new context generation for NEW events, without repairing old outcomes.

Unexpected WS closure, event-feed failure, clock reversal, invalid market payload or storage bound stops the process. No retry/IP-evasion/proxy mechanism is implemented. Exit, disk and clock require external host monitoring. A stale `.lock` after a hard kill must be reviewed against the recorded PID and journal integrity by the operator; the collector never steals it automatically. Do not edit/truncate a torn journal to make it look complete; preserve it as a failed collection and begin a new directory.

A buffered-candle404 (symbol left the scanner) records `WARMUP_SYMBOL_NOT_BUFFERED` and censors that symbol's cases while allowing other candidates to continue. It is not silently dropped, retried with future data or counted as a complete opportunity. Other HTTP/source faults stop collection.

Binance source references, checked28Oct2026: [market connection routing/limits](https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/websocket-market-streams/Connect) and [market stream schema including closed klines and24h tickers](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/ws-streams/market). Collector receipt timestamps belong to this observer, not the production feed. The continuous public-feed path and real forward cohort have not been certified by synthetic CI.
