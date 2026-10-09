// Pure logic for the bitcoin plugin. Qt-free so it stays testable under
// node (functions + var only; no ES modules, no arrow functions).

var CURRENCIES = ["USD", "EUR", "GBP", "CAD", "CHF", "AUD", "JPY"];

var SYMBOLS = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  CHF: "CHF",
  AUD: "A$",
  JPY: "¥"
};

var MEMPOOL_PRICES_URL = "https://mempool.space/api/v1/prices";
var MEMPOOL_HEIGHT_URL = "https://mempool.space/api/blocks/tip/height";
var MEMPOOL_FEES_URL = "https://mempool.space/api/v1/fees/recommended";
var MEMPOOL_HASHRATE_URL = "https://mempool.space/api/v1/mining/hashrate/3d";
var MEMPOOL_DIFFICULTY_URL = "https://mempool.space/api/v1/difficulty-adjustment";
var FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1";
// Kalshi's "BTC price range EOY" series is a terminal-distribution ladder: each
// market is a price bucket with a money-weighted probability. Public, no auth,
// no pagination (28 buckets, ~50 KB, ~0.2 s). Prefer this over Polymarket's
// monthly ladders, which are one-touch (path-dependent) and mean something else.
var KALSHI_EOY_URL = "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXBTCY&limit=200";
// RSS feeds are text/XML, not rate-limited, and need a desktop User-Agent —
// several of these return 403 to a bare curl. Kept separate from the priced
// lanes so a slow feed never delays price data. Order is irrelevant; the lane
// fetches every feed in one batched request. Labels are short because they are
// rendered in the panel's right-hand meta column.
var RSS_FEEDS = [
  { key: "theblock", label: "The Block", url: "https://www.theblock.co/rss.xml" },
  { key: "coindesk", label: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { key: "ft", label: "FT", url: "https://www.ft.com/markets?format=rss" },
  { key: "bbgcrypto", label: "Bloomberg", url: "https://feeds.bloomberg.com/crypto/news.rss" },
  { key: "bbgmarkets", label: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss" },
  { key: "bbgecon", label: "Bloomberg", url: "https://feeds.bloomberg.com/economics/news.rss" },
  { key: "cnbcfinance", label: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { key: "cnbcecon", label: "CNBC", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { key: "cnbctop", label: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" }
];
var NEWS_LIMIT = 12;
var NEWS_SHOWN = 4;
// Relevance gating: bitcoin/crypto or strong macro stories are tier 1; broader
// price-action/risk stories are tier 2 and only used when tier 1 is thin, so a
// quiet news day never leaves the section empty.
var NEWS_TIER1_WINDOW_HOURS = 48;
var NEWS_TIER2_WINDOW_HOURS = 72;
// Tier 1 = any bitcoin/crypto story OR any strong macro story (both score 3).
// Tier 2 = any weak macro/price-action story (score 1), used only as a fallback.
var NEWS_TIER1_SCORE = 3;
var NEWS_TIER2_SCORE = 1;
var NEWS_MIN_ITEMS = 3;
var NEWS_DEDUPE_SIM = 0.62;
var COINGECKO_SIMPLE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp,cad,chf,aud,jpy&include_24hr_change=true";
var COINGECKO_CHART_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";

var RANGES = [
  { key: "24h", days: 1 },
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "1y", days: 365 }
];

// One block every ~10 minutes drives the halving and difficulty ETAs. The
// mempool difficulty-adjustment endpoint also reports a live timeAvg (ms),
// which the widget layers on top when available.
var BLOCKS_PER_HALVING = 210000;
var DEFAULT_BLOCK_SEC = 600;

function simplePriceUrl(currency) {
  var code = normalizeCurrency(currency);
  var inc = "usd,eur,gbp,cad,chf,aud,jpy";
  return "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin"
    + "&vs_currencies=" + code.toLowerCase()
    + "&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
}

function normalizeRange(value) {
  var key = String(value || "24h").toLowerCase();
  for (var i = 0; i < RANGES.length; i++) {
    if (RANGES[i].key === key) return key;
  }
  return "24h";
}

var BAR_APPEARANCES = ["full", "subtle"];

// Bar appearance: "full" keeps the price/chart always visible, "subtle" shows
// only a bitcoin badge until hovered. Anything unrecognised falls back to full
// so a settings typo can never hide the price.
function normalizeAppearance(value) {
  var key = String(value || "full").toLowerCase();
  for (var i = 0; i < BAR_APPEARANCES.length; i++) {
    if (BAR_APPEARANCES[i] === key) return key;
  }
  return "full";
}

function rangeKeyToDays(key) {
  var k = normalizeRange(key);
  for (var i = 0; i < RANGES.length; i++) {
    if (RANGES[i].key === k) return RANGES[i].days;
  }
  return 1;
}

function currencySymbol(code) {
  var key = String(code || "USD").toUpperCase();
  return SYMBOLS[key] || (key + " ");
}

function normalizeCurrency(code) {
  var key = String(code || "USD").toUpperCase();
  for (var i = 0; i < CURRENCIES.length; i++) {
    if (CURRENCIES[i] === key) return key;
  }
  return "USD";
}

function chartUrl(currency, range) {
  var days = rangeKeyToDays(range);
  var interval = days >= 30 ? "&interval=daily" : "";
  return COINGECKO_CHART_URL
    .replace("vs_currency=usd", "vs_currency=" + normalizeCurrency(currency).toLowerCase())
    .replace("days=1", "days=" + days) + interval;
}

// mempool.space returns whole-unit prices per currency:
//   {"time":1791286823,"USD":86304,"EUR":76655,...}
function parseMempoolPrices(raw) {
  if (!raw || typeof raw !== "object") return null;
  var out = { ts: Number(raw.time) || 0, prices: {} };
  var found = 0;
  for (var i = 0; i < CURRENCIES.length; i++) {
    var code = CURRENCIES[i];
    var value = Number(raw[code]);
    if (isFinite(value) && value > 0) {
      out.prices[code] = value;
      found++;
    }
  }
  return found > 0 ? out : null;
}

// coingecko simple/price:
//   {"bitcoin":{"usd":86290.12,"usd_24h_change":0.29,...}}
function parseCoingeckoSimple(raw) {
  if (!raw || typeof raw !== "object") return null;
  var btc = raw.bitcoin;
  if (!btc || typeof btc !== "object") return null;
  var out = { prices: {}, changes: {} };
  var found = 0;
  for (var i = 0; i < CURRENCIES.length; i++) {
    var code = CURRENCIES[i];
    var key = code.toLowerCase();
    var value = Number(btc[key]);
    if (isFinite(value) && value > 0) {
      out.prices[code] = value;
      found++;
      var change = Number(btc[key + "_24h_change"]);
      if (isFinite(change)) out.changes[code] = change;
    }
  }
  return found > 0 ? out : null;
}

// coingecko market_chart (days=1) for the sparkline:
//   {"prices":[[ms, price], ...], "market_caps":[...], "total_volumes":[...]}
function parseCoingeckoChart(raw) {
  if (!raw || typeof raw !== "object") return null;
  var prices = raw.prices;
  if (!prices || !prices.length) return null;
  var series = [];
  for (var i = 0; i < prices.length; i++) {
    var point = prices[i];
    if (!point || point.length < 2) continue;
    var ts = Number(point[0]);
    var price = Number(point[1]);
    if (isFinite(ts) && isFinite(price) && price > 0) series.push({ ts: ts, price: price });
  }
  return series.length >= 2 ? { series: series } : null;
}

// mempool.space /api/v1/fees/recommended:
//   {"fastestFee":2,"halfHourFee":1,"hourFee":1,"economyFee":1,"minimumFee":1}
function parseFees(json) {
  if (!json || typeof json !== "object") return null;
  var out = {
    high: Number(json.fastestFee),
    mid: Number(json.halfHourFee),
    low: Number(json.hourFee),
    none: Number(json.economyFee)
  };
  if (!isFinite(out.high) || out.high < 0) return null;
  if (!isFinite(out.mid) || out.mid < 0) out.mid = out.high;
  if (!isFinite(out.low) || out.low < 0) out.low = out.mid;
  if (!isFinite(out.none) || out.none < 0) out.none = out.low;
  out.high = Math.round(out.high);
  out.mid = Math.round(out.mid);
  out.low = Math.round(out.low);
  out.none = Math.round(out.none);
  return out;
}

// mempool.space /api/blocks/tip/height returns a plain integer.
function parseBlockHeight(raw) {
  var n = Number(String(raw || "").replace(/[^0-9]/g, ""));
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// coingecko simple/price with market cap + volume:
//   {"bitcoin":{"usd":86290.12,"usd_market_cap":...,"usd_24h_vol":...,"usd_24h_change":0.29}}
function parseGlobalStats(json) {
  if (!json || typeof json !== "object") return null;
  var btc = json.bitcoin;
  if (!btc || typeof btc !== "object") return null;
  var out = { prices: {}, changes: {}, marketCaps: {}, volumes: {} };
  var found = 0;
  for (var i = 0; i < CURRENCIES.length; i++) {
    var code = CURRENCIES[i];
    var key = code.toLowerCase();
    var price = Number(btc[key]);
    if (isFinite(price) && price > 0) {
      out.prices[code] = price;
      found++;
      var change = Number(btc[key + "_24h_change"]);
      if (isFinite(change)) out.changes[code] = change;
      var cap = Number(btc[key + "_market_cap"]);
      if (isFinite(cap) && cap > 0) out.marketCaps[code] = cap;
      var volume = Number(btc[key + "_24h_vol"]);
      if (isFinite(volume) && volume > 0) out.volumes[code] = volume;
    }
  }
  return found > 0 ? out : null;
}

// mempool.space /api/v1/mining/hashrate/3d:
//   {"hashrates":[{"timestamp":...,"avgHashrate":1.177e21},...],
//    "difficulty":..., "currentHashrate":..., "currentDifficulty":...}
function parseHashrate(json) {
  if (!json || typeof json !== "object") return null;
  var out = {
    current: Number(json.currentHashrate),
    difficulty: Number(json.currentDifficulty),
    series: []
  };
  var avg = json.timeAvg;
  if (isFinite(Number(avg)) && Number(avg) > 0) out.timeAvgMs = Number(avg);
  if (json.hashrates && json.hashrates.length) {
    for (var i = 0; i < json.hashrates.length; i++) {
      var point = json.hashrates[i];
      if (!point) continue;
      var ts = Number(point.timestamp);
      var hr = Number(point.avgHashrate);
      if (isFinite(ts) && isFinite(hr) && hr > 0) out.series.push({ ts: ts, value: hr });
    }
  }
  return isFinite(out.current) && out.current > 0 ? out : null;
}

// mempool.space /api/v1/difficulty-adjustment:
//   {"progressPercent":40.3,"difficultyChange":5.32,"estimatedRetargetDate":...,
//    "remainingBlocks":1202,"remainingTime":...,"nextRetargetHeight":971712,"timeAvg":570379}
function parseDifficultyAdjustment(json) {
  if (!json || typeof json !== "object") return null;
  var out = {
    progressPercent: Number(json.progressPercent),
    difficultyChange: Number(json.difficultyChange),
    nextRetargetHeight: Number(json.nextRetargetHeight),
    remainingBlocks: Number(json.remainingBlocks),
    timeAvgMs: Number(json.timeAvg),
    estimatedRetargetDate: Number(json.estimatedRetargetDate)
  };
  if (!isFinite(out.progressPercent)) out.progressPercent = 0;
  if (!isFinite(out.difficultyChange)) out.difficultyChange = 0;
  if (!isFinite(out.nextRetargetHeight) || out.nextRetargetHeight <= 0) out.nextRetargetHeight = 0;
  if (!isFinite(out.remainingBlocks) || out.remainingBlocks < 0) out.remainingBlocks = 0;
  if (!isFinite(out.timeAvgMs) || out.timeAvgMs <= 0) out.timeAvgMs = null;
  if (!isFinite(out.estimatedRetargetDate) || out.estimatedRetargetDate <= 0) out.estimatedRetargetDate = 0;
  return out;
}

// alternative.me Fear & Greed:
//   {"data":[{"value":"64","value_classification":"Greed","timestamp":...,"time_until_update":...}]}
function parseFearGreed(json) {
  if (!json || typeof json !== "object" || !json.data || !json.data.length) return null;
  var item = json.data[0];
  if (!item) return null;
  var value = Number(item.value);
  var cls = String(item.value_classification || "");
  if (!isFinite(value)) return null;
  return {
    value: Math.round(value),
    classification: cls,
    timestamp: Number(item.timestamp) || 0,
    timeUntilUpdate: Number(item.time_until_update) || 0
  };
}

// --- Kalshi terminal-distribution ladder ------------------------------------
// Each market is a price bucket ("90,000 to 94,999.99", "150,000 or above",
// "19,999.99 or below"). We read the bucket bounds from `yes_sub_title`, NOT
// from `floor_strike`: on the bottom bucket that field is undefined. Bucket
// probabilities are normalized by their sum (observed 1.009–1.017 due to
// bid/ask spread and cent rounding) so shares are comparable.

function parseKalshiBucket(subtitle) {
  var text = String(subtitle || "").toLowerCase();
  var numbers = text.match(/[0-9][0-9,]*(\.[0-9]+)?/g) || [];
  var values = [];
  for (var i = 0; i < numbers.length; i++) values.push(Number(numbers[i].replace(/,/g, "")));
  if (!values.length) return null;
  if (text.indexOf("below") !== -1) return { lo: 0, hi: values[0] };
  if (text.indexOf("above") !== -1) return { lo: values[0], hi: Infinity };
  if (values.length >= 2) return { lo: Math.min(values[0], values[1]), hi: Math.max(values[0], values[1]) };
  return null;
}

// Picks the open event with the latest expiration (the series rolls quarterly;
// never hardcode the event ticker). Status is not trusted — it flips between
// "initialized" and "active" — so we require a positive price instead.
function parseKalshiRange(json) {
  if (!json || typeof json !== "object" || !json.markets || !json.markets.length) return null;
  var markets = json.markets;
  var expiry = "";
  var i;
  for (i = 0; i < markets.length; i++) {
    var exp = String(markets[i].expiration_time || "");
    if (exp > expiry) expiry = exp;
  }
  var buckets = [];
  var event = "";
  var sum = 0;
  for (i = 0; i < markets.length; i++) {
    var market = markets[i];
    if (expiry && String(market.expiration_time || "") !== expiry) continue;
    var prob = Number(market.last_price_dollars);
    if (!isFinite(prob) || prob <= 0) continue;
    var bounds = parseKalshiBucket(market.yes_sub_title);
    if (!bounds) continue;
    if (!event) event = String(market.event_ticker || "");
    buckets.push({ lo: bounds.lo, hi: bounds.hi, prob: prob });
    sum += prob;
  }
  if (!buckets.length || sum <= 0) return null;
  for (var k = 0; k < buckets.length; k++) buckets[k].prob = buckets[k].prob / sum;
  buckets.sort(function (a, b) { return a.lo - b.lo; });

  return {
    buckets: buckets,
    p10: kalshiQuantile(buckets, 0.1),
    p25: kalshiQuantile(buckets, 0.25),
    median: kalshiQuantile(buckets, 0.5),
    p75: kalshiQuantile(buckets, 0.75),
    p90: kalshiQuantile(buckets, 0.9),
    eventTicker: event,
    expiryIso: expiry
  };
}

// Interpolated quantile of the terminal-price distribution, rounded to the
// nearest $1,000 (a $5k-wide bucket can't support more precision). Returns null
// when q is outside 0..1 or the crossing bucket is open-ended — the top bucket
// is "X or above", so there is no upper bound to interpolate into.
function kalshiQuantile(buckets, q) {
  if (!buckets || !buckets.length) return null;
  var target = Number(q);
  if (!isFinite(target) || target < 0 || target > 1) return null;
  var cumulative = 0;
  for (var i = 0; i < buckets.length; i++) {
    var before = cumulative;
    var after = cumulative + buckets[i].prob;
    if (after >= target) {
      if (!isFinite(buckets[i].hi)) return null;
      var frac = after > before ? (target - before) / (after - before) : 0;
      return Math.round((buckets[i].lo + frac * (buckets[i].hi - buckets[i].lo)) / 1000) * 1000;
    }
    cumulative = after;
  }
  return null;
}

var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var MONTH_INDEX = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

// "KXBTCY-27JAN0100" -> "End of year" (a Jan 1 terminal). Other month-ends fall
// back to "End of <Month>" so a series change can't make the label lie. The
// contract's expiration_time is the *trading cutoff* (~a week earlier), so the
// settlement date must come from the event ticker, not from expiryIso.
function kalshiHorizonLabel(eventTicker) {
  var match = /-(\d{2})([A-Za-z]{3})(\d{2})/.exec(String(eventTicker || ""));
  if (!match) return "";
  var month = MONTH_INDEX[match[2].toUpperCase()];
  if (!month) return "";
  if (month === 1 && Number(match[3]) === 1) return "End of year";
  return "End of " + MONTHS_LONG[month - 1];
}

// Percent move implied by the market's median terminal price relative to spot,
// using the median as the base (median -> current price). Positive means spot
// sits above the implied median. Returns null when either input is unusable.
function medianPremiumPct(spot, median) {
  var s = Number(spot);
  var m = Number(median);
  if (!isFinite(s) || !isFinite(m) || s <= 0 || m <= 0) return null;
  return (s / m - 1) * 100;
}

// --- Farside spot-ETF daily net flows ---------------------------------------
// Farside publishes the canonical US spot-bitcoin ETF flow table as plain HTML
// (no public JSON API; DefiLlama renders this same table). It 403s a bare curl,
// so the widget must send a desktop User-Agent. Cells are US$ millions.
//
// Two traps, both handled here:
//   1. Outflows are parenthesised ("(207.7)") on the source page.
//   2. The current (unsettled) day renders every fund cell as "-" but its
//      *total* column as "0.0". Trusting that total would report a fake
//      zero-inflow day, so a day counts only when every fund cell is numeric.
var FARSIDE_BTC_URL = "https://farside.co.uk/btc/";

function parseFarsideNumber(text) {
  var s = String(text === null || text === undefined ? "" : text).trim();
  if (!s || s === "-" || s === "—" || s === "–") return null;
  var neg = s.charAt(0) === "(" && s.charAt(s.length - 1) === ")";
  if (neg) s = s.slice(1, -1);
  s = s.replace(/[$,]/g, "").replace(/\s/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var value = Number(s);
  if (!isFinite(value)) return null;
  return neg ? -value : value;
}

function farsideCells(row) {
  var out = [];
  var cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
  for (var i = 0; i < cells.length; i++) {
    var text = decodeEntities(cells[i].replace(/<[^>]+>/g, ""));
    out.push(text.replace(/\u00a0/g, " ").trim());
  }
  return out;
}

function farsideDateIso(label) {
  var match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(String(label || "").trim());
  if (!match) return "";
  var month = MONTH_INDEX[match[2].toUpperCase()];
  if (!month) return "";
  var day = match[1].length < 2 ? "0" + match[1] : match[1];
  var mm = month < 10 ? "0" + month : String(month);
  return match[3] + "-" + mm + "-" + day;
}

// Returns the most recent fully-reported (settled) day's net flow, scanning the
// table bottom-up and rejecting any day with a blank/missing fund cell.
function parseFarsideFlows(html) {
  if (!html) return null;
  var table = /<table[^>]*class="[^"]*\betf\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(String(html));
  if (!table) return null;
  var rows = table[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  if (rows.length < 4) return null;

  var fundCount = 0;
  var data = [];
  for (var r = 0; r < rows.length; r++) {
    var cells = farsideCells(rows[r]);
    if (!cells.length) continue;
    if (farsideDateIso(cells[0])) {
      data.push(cells);
      continue;
    }
    // The ticker header row is the one built from short all-caps symbols.
    if (!fundCount && cells.length >= 6) {
      var tickers = 0;
      for (var c = 0; c < cells.length; c++) {
        if (/^[A-Z]{2,5}$/.test(cells[c])) tickers++;
      }
      if (tickers >= 6) fundCount = tickers;
    }
  }
  if (!fundCount || !data.length) return null;

  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    if (row.length < fundCount + 2) continue;
    var total = 0;
    var complete = true;
    for (var f = 1; f <= fundCount; f++) {
      var value = parseFarsideNumber(row[f]);
      if (value === null) { complete = false; break; }
      total += value;
    }
    if (!complete) continue;
    var iso = farsideDateIso(row[0]);
    if (!iso) continue;
    return {
      date: iso,
      shortDate: row[0].replace(/\s+\d{4}$/, ""),
      total: total
    };
  }
  return null;
}

// Farside flows are US$ millions. Sign-prefixed so an inflow reads "+$118.8M"
// and an outflow "-$484.9M"; colour carries the direction on top of the sign.
function formatFlowUsd(millions) {
  var m = Number(millions);
  if (!isFinite(m)) return "—";
  if (m === 0) return "$0";
  var sign = m < 0 ? "-" : "+";
  var abs = Math.abs(m);
  var body;
  if (abs >= 1000) {
    body = "$" + (abs / 1000).toFixed(2) + "B";
  } else {
    body = "$" + abs.toFixed(1) + "M";
  }
  return sign + body;
}

// Next halving block after `height`. Bitcoin halves every 210,000 blocks, so
// the formula is the next multiple of that count. ETA uses the live average
// block time (ms) when provided, ~10 minutes otherwise.
function halvingInfo(height, timeAvgMs) {
  var h = Number(height);
  if (!isFinite(h) || h <= 0) return null;
  var nextHeight = (Math.floor(h / BLOCKS_PER_HALVING) + 1) * BLOCKS_PER_HALVING;
  var blocksLeft = Math.max(0, nextHeight - h);
  var blockMs = isFinite(Number(timeAvgMs)) && Number(timeAvgMs) > 0 ? Number(timeAvgMs) : DEFAULT_BLOCK_SEC * 1000;
  var etaMs = blocksLeft * blockMs;
  var epoch = Math.floor(nextHeight / BLOCKS_PER_HALVING);
  return {
    nextHeight: nextHeight,
    blocksLeft: blocksLeft,
    epoch: epoch,
    etaMs: etaMs
  };
}

function formatHashrate(value) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return "—";
  var eh = n / 1e18;
  var s = eh >= 100 ? eh.toFixed(0) : (eh >= 10 ? eh.toFixed(1) : eh.toFixed(2));
  return s + " EH/s";
}

function formatCompact(value) {
  var n = Number(value);
  if (!isFinite(n)) return "—";
  var abs = Math.abs(n);
  var suffix = "";
  var scaled = abs;
  if (abs >= 1e12) { scaled = abs / 1e12; suffix = "T"; }
  else if (abs >= 1e9) { scaled = abs / 1e9; suffix = "B"; }
  else if (abs >= 1e6) { scaled = abs / 1e6; suffix = "M"; }
  else if (abs >= 1e3) { scaled = abs / 1e3; suffix = "K"; }
  var decimals = scaled >= 100 ? 0 : (scaled >= 10 ? 1 : 2);
  var text = scaled.toFixed(decimals);
  if (text.indexOf(".") !== -1) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return (n < 0 ? "-" : "") + text + suffix;
}

function formatDuration(ms) {
  var n = Number(ms);
  if (!isFinite(n) || n <= 0) return "—";
  var days = Math.floor(n / 86400000);
  if (days >= 365) return (days / 365).toFixed(1) + "y";
  if (days >= 30) return Math.floor(days / 30) + "mo";
  return days + "d";
}

// Fear & Greed colour ramp: extreme fear red, fear orange, greed green,
// deep-saturated green for extreme greed.
// Shared direction palette. DOWN_COLOR/UP_COLOR are the extreme ends of the
// Fear & Greed ramp so the two can't drift apart.
var FNG_EXTREME_FEAR = "#e53935";
var FNG_FEAR = "#ff9800";
var FNG_NEUTRAL = "#e9c46a";
var FNG_GREED = "#3ddc84";
var FNG_EXTREME_GREED = "#00e676";

var UP_COLOR = FNG_GREED;
var DOWN_COLOR = FNG_EXTREME_FEAR;

// Alternative.me bands: 0-24 Extreme Fear, 25-44 Fear, 45-55 Neutral,
// 56-75 Greed, 76-100 Extreme Greed. These must line up with the API's own
// value_classification, since the panel prints that label beside the color.
function fearGreedColor(value) {
  var v = Number(value);
  if (!isFinite(v)) return "#9aa0a6";
  if (v >= 76) return FNG_EXTREME_GREED;
  if (v >= 56) return FNG_GREED;
  if (v >= 45) return FNG_NEUTRAL;
  if (v >= 25) return FNG_FEAR;
  return FNG_EXTREME_FEAR;
}

var ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " "
};

function decodeEntities(text) {
  if (text === null || text === undefined) return "";
  var out = String(text);
  out = out.replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  out = out.replace(/&#(\d+);/g, function (_, dec) {
    return String.fromCharCode(parseInt(dec, 10));
  });
  out = out.replace(/&[a-zA-Z]+;/g, function (entity) {
    return ENTITIES.hasOwnProperty(entity) ? ENTITIES[entity] : entity;
  });
  return out;
}

function stripCdata(text) {
  if (text === null || text === undefined) return "";
  var value = String(text).trim();
  if (value.indexOf("<![CDATA[") === 0) value = value.slice(9);
  var end = value.lastIndexOf("]]>");
  if (end >= 0) value = value.slice(0, end);
  return value.trim();
}

function extractTag(block, tag) {
  var pattern = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
  var match = pattern.exec(block);
  if (!match) return "";
  return decodeEntities(stripCdata(match[1]));
}

// Parses an RSS 2.0 document. Only `<item>` blocks are read, so the channel's
// own `<title>` can never leak in as a headline.
function parseRss(xml, source) {
  if (!xml) return [];
  var label = source && source.label ? source.label : "News";
  var items = [];
  var blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (var i = 0; i < blocks.length; i++) {
    var title = extractTag(blocks[i], "title");
    if (!title) continue;
    var link = extractTag(blocks[i], "link");
    var published = extractTag(blocks[i], "pubDate") || extractTag(blocks[i], "date");
    var publishedMs = Date.parse(published);
    items.push({
      title: title,
      link: link,
      source: label,
      publishedMs: isFinite(publishedMs) ? publishedMs : null
    });
  }
  return items;
}

// `bySource` maps feed key -> parsed item array. Flattens, drops duplicate
// titles across feeds, sorts newest-first (undated items last), caps at limit.
function mergeHeadlines(bySource, limit) {
  var buckets = bySource || {};
  var keys = Object.keys(buckets).sort();
  var all = [];
  for (var s = 0; s < keys.length; s++) {
    var items = buckets[keys[s]] || [];
    for (var i = 0; i < items.length; i++) all.push(items[i]);
  }
  var seen = {};
  var deduped = [];
  for (var j = 0; j < all.length; j++) {
    var item = all[j];
    if (!item || !item.title) continue;
    var key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(item);
  }
  deduped.sort(function (a, b) {
    var av = isFinite(a.publishedMs) ? a.publishedMs : -Infinity;
    var bv = isFinite(b.publishedMs) ? b.publishedMs : -Infinity;
    return bv - av;
  });
  var max = limit || NEWS_LIMIT;
  return deduped.slice(0, max);
}

function headlineAge(publishedMs, nowMs) {
  if (!isFinite(publishedMs)) return "";
  var delta = (nowMs || Date.now()) - publishedMs;
  if (delta < 0) delta = 0;
  var minutes = Math.floor(delta / 60000);
  if (minutes < 60) return minutes <= 1 ? "now" : minutes + "m";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  return Math.floor(hours / 24) + "d";
}

// --- relevance gating -------------------------------------------------------
// The general-business feeds (CNBC, Bloomberg, FT) carry almost no bitcoin
// stories, so a bitcoin-only filter would leave the section empty. Instead we
// keep two kinds of story: anything bitcoin/crypto-specific (tier 1a), and
// macro/risk stories that move BTC's price and sentiment (tier 1b). Broad
// price-action stories form tier 2 and only appear on quiet days.
//
// `defi` MUST be word-bounded: unbounded it matches "de-fic-it" and "de-fiant",
// which is how "Trade deficit hits $105.6 billion" once slipped through.
var CRYPTO_PATTERN = [
  "\\bbitcoins?\\b", "\\bbtc\\b", "crypto ?currenc", "cryptocurrenc",
  "\\bethereum\\b", "\\bether\\b", "stablecoins?", "blockchain", "on-?chain",
  "hashrate", "\\bhalving\\b", "mem ?pool", "microstrategy", "\\bgrayscale\\b",
  "\\bishares\\b", "\\bdefi\\b", "tokeniz", "digital asset", "spot etf",
  "crypto etf", "etf inflows?", "etf outflows?", "\\baltcoins?\\b",
  "\\bmining\\b", "\\bsatoshi\\b", "\\bcrypto\\b"
].join("|");

var STRONG_MACRO_PATTERN = [
  "federal reserve", "\\bfomc\\b", "\\bpowell\\b", "\\bmusalem\\b",
  "\\bkashkari\\b", "rate cut", "rate hike", "rate decision", "\\bcpi\\b",
  "\\bppi\\b", "\\bpce\\b", "inflation", "jobs report", "payrolls?",
  "nonfarm", "non-farm", "unemployment rate", "tariffs?", "sanctions",
  "treasury yields?", "yield curve", "dollar index", "money supply", "\\bm2\\b",
  "hawkish", "dovish", "debt ceiling", "risk-?off", "flight to safety",
  "trade deficits?", "trade surpluses?", "trade talks",
  // Compound patterns: a lone "rates" or "fed" is too weak (and "fed" alone
  // appears in names), so require a market-relevant neighbour.
  "fed(?:'s)?\\b[^.]{0,30}(rate|inflation|policy|reserve|bank)",
  "(?:rate|inflation)[^.]{0,20}\\bfed\\b",
  "rates?\\b[^.]{0,25}\\b(rise|rising|higher|increase|hike|hikes|cut|cuts|lower|fall|falling|steady|unchanged|hold|holds)",
  "\\b(raise|raises|raised|rising|hike|hikes|hiked|cut|cuts|lower|lowers|lowered)\\b[^.]{0,20}\\brates?\\b"
].join("|");

var WEAK_MACRO_PATTERN = [
  "\\brates?\\b", "\\byields?\\b", "recession", "\\bwar\\b", "conflict",
  "geopolit", "crude", "\\boil\\b", "\\bopec\\b", "\\becb\\b", "\\bboj\\b",
  "liquidity", "\\bstrike", "melt-?up", "market wrap", "central bank",
  "stocks? (fall|falls|slide|slides|slump|slumps|rally|rallies|jump|jumps|sink|sinks)"
].join("|");

var RE_CRYPTO = new RegExp(CRYPTO_PATTERN, "i");
var RE_STRONG = new RegExp(STRONG_MACRO_PATTERN, "i");
var RE_WEAK = new RegExp(WEAK_MACRO_PATTERN, "i");

function patternMatches(re, text) {
  if (!text) return [];
  var out = [];
  var match;
  re.lastIndex = 0;
  var global = new RegExp(re.source, "gi");
  while ((match = global.exec(text)) !== null) {
    var value = match[0].toLowerCase();
    if (out.indexOf(value) === -1) out.push(value);
    if (match.index === global.lastIndex) global.lastIndex++;
  }
  return out;
}

function headlineRelevance(title) {
  var text = title || "";
  var crypto = patternMatches(RE_CRYPTO, text);
  var strong = patternMatches(RE_STRONG, text);
  var weak = patternMatches(RE_WEAK, text);
  var score = 0;
  if (crypto.length) score += 3;
  if (strong.length) score += 3;
  if (strong.length >= 2) score += 1;
  if (weak.length) score += 1;
  return {
    score: score,
    crypto: crypto,
    strong: strong,
    weak: weak
  };
}

var HEADLINE_STOPWORDS = {};
(function () {
  var words = ("the a an and or of to in on for with as at is are be by from that this it its will would could may says say said "
    + "after over into new out up down over more most than then them their there here what when who why how").split(" ");
  for (var i = 0; i < words.length; i++) HEADLINE_STOPWORDS[words[i]] = true;
})();

function headlineTokens(title) {
  var text = String(title || "").toLowerCase();
  var raw = text.match(/[a-z0-9]+/g) || [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    if (raw[i].length > 2 && !HEADLINE_STOPWORDS[raw[i]]) out.push(raw[i]);
  }
  return out;
}

// Jaccard similarity over content words. 1.0 = identical wording, 0 = disjoint.
// Used to drop near-duplicate wire syndication ("Fed's Musalem Signals Rates
// Should Rise" vs "Musalem Signals Fed Rates Should Rise Over Next Six Months").
function headlineSimilarity(a, b) {
  var ta = headlineTokens(a);
  var tb = headlineTokens(b);
  if (!ta.length || !tb.length) return 0;
  var setB = {};
  var i;
  for (i = 0; i < tb.length; i++) setB[tb[i]] = true;
  var union = {};
  var intersection = 0;
  for (i = 0; i < ta.length; i++) {
    union[ta[i]] = true;
    if (setB[ta[i]]) intersection++;
  }
  for (i = 0; i < tb.length; i++) union[tb[i]] = true;
  var unionSize = 0;
  for (var key in union) {
    if (Object.prototype.hasOwnProperty.call(union, key)) unionSize++;
  }
  return unionSize > 0 ? intersection / unionSize : 0;
}

function selectRelevant(items, nowMs) {
  var now = nowMs || Date.now();
  var list = items || [];
  var deduped = dedupeHeadlines(list, NEWS_DEDUPE_SIM);

  function withinWindow(hours) {
    var cutoff = now - hours * 3600000;
    var out = [];
    for (var i = 0; i < deduped.length; i++) {
      var item = deduped[i];
      if (!item) continue;
      if (isFinite(item.publishedMs) && item.publishedMs < cutoff) continue;
      out.push(item);
    }
    return out;
  }

  function filtered(hours, minScore) {
    var windowed = withinWindow(hours);
    var out = [];
    for (var i = 0; i < windowed.length; i++) {
      var rel = headlineRelevance(windowed[i].title);
      if (rel.score >= minScore) {
        var copy = shallowCopy(windowed[i]);
        copy.score = rel.score;
        out.push(copy);
      }
    }
    out.sort(byPublishedDesc);
    return out;
  }

  var tier1 = filtered(NEWS_TIER1_WINDOW_HOURS, NEWS_TIER1_SCORE);
  if (tier1.length >= NEWS_MIN_ITEMS) return tier1.slice(0, NEWS_LIMIT);
  var tier2 = filtered(NEWS_TIER2_WINDOW_HOURS, NEWS_TIER2_SCORE);
  if (tier2.length > tier1.length) return tier2.slice(0, NEWS_LIMIT);
  return tier1.slice(0, NEWS_LIMIT);
}

// Later duplicate of an earlier (newer-first) headline is dropped, so the
// freshest wording of a wire story wins.
function dedupeHeadlines(items, threshold) {
  var sorted = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].title) sorted.push(items[i]);
  }
  sorted.sort(byPublishedDesc);
  var kept = [];
  var seenExact = {};
  for (var j = 0; j < sorted.length; j++) {
    var item = sorted[j];
    var key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seenExact[key]) continue;
    var duplicate = false;
    for (var k = 0; k < kept.length; k++) {
      if (headlineSimilarity(item.title, kept[k].title) > threshold) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;
    seenExact[key] = true;
    kept.push(item);
  }
  return kept;
}

function shallowCopy(obj) {
  var out = {};
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

function byPublishedDesc(a, b) {
  var av = isFinite(a.publishedMs) ? a.publishedMs : -Infinity;
  var bv = isFinite(b.publishedMs) ? b.publishedMs : -Infinity;
  return bv - av;
}

// The chart endpoint is the sparkline's source of truth when it lands; the
// simple/price payload carries the 24h percentage. Merge them so the bar can
// show a price even if one endpoint is slow or rate-limited. `currency` is
// the quote currency the chart URL was built with — its series prices already
// belong to that currency.
function mergeQuote(mempool, simple, chart, currency) {
  var code = normalizeCurrency(currency);
  var prices = {};
  var changes = {};
  var series = [];
  var ts = 0;
  var sources = [];

  if (mempool) {
    for (var mempoolCode in mempool.prices) {
      if (mempool.prices.hasOwnProperty(mempoolCode)) prices[mempoolCode] = mempool.prices[mempoolCode];
    }
    if (mempool.ts > 0) ts = mempool.ts;
    sources.push("mempool");
  }
  if (simple) {
    for (var simpleCode in simple.prices) {
      if (simple.prices.hasOwnProperty(simpleCode)) prices[simpleCode] = simple.prices[simpleCode];
    }
    for (var changeCode in simple.changes) {
      if (simple.changes.hasOwnProperty(changeCode)) changes[changeCode] = simple.changes[changeCode];
    }
    sources.push("coingecko");
  }
  if (chart) {
    series = chart.series;
    if (series.length > 0) {
      var last = series[series.length - 1].price;
      var first = series[0].price;
      if (isFinite(last) && last > 0) {
        prices[code] = last;
        if (isFinite(first) && first > 0 && !changes[code]) {
          changes[code] = ((last - first) / first) * 100;
        }
        if (ts === 0) ts = Math.floor(series[series.length - 1].ts / 1000);
      }
    }
    sources.push("chart");
  }

  if (Object.keys(prices).length === 0 && series.length === 0) return null;

  return {
    prices: prices,
    changes: changes,
    series: series,
    ts: ts,
    sources: sources
  };
}

function formatPrice(value, currency) {
  var n = Number(value);
  if (!isFinite(n) || n <= 0) return "—";
  var code = normalizeCurrency(currency);
  var symbol = currencySymbol(code);
  var decimals = code === "JPY" ? 0 : (n < 100 ? 2 : 0);
  return symbol + formatNumber(n, decimals);
}

function formatNumber(value, decimals) {
  var n = Number(value);
  if (!isFinite(n)) return "—";
  var fixed = n.toFixed(decimals);
  var parts = fixed.split(".");
  var whole = parts[0];
  var sign = "";
  if (whole.charAt(0) === "-") {
    sign = "-";
    whole = whole.slice(1);
  }
  var grouped = "";
  for (var i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += ",";
    grouped += whole.charAt(i);
  }
  return sign + grouped + (parts.length > 1 ? "." + parts[1] : "");
}

function formatChange(changePct) {
  var n = Number(changePct);
  if (!isFinite(n)) return "";
  var abs = Math.abs(n).toFixed(2);
  var arrow = n > 0 ? "▲" : (n < 0 ? "▼" : "");
  var body = abs + "%";
  return arrow ? arrow + " " + body : body;
}

function formatChangeCompact(changePct) {
  var n = Number(changePct);
  if (!isFinite(n)) return "";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function formatClock(tsSeconds) {
  var ms = Number(tsSeconds);
  if (!isFinite(ms) || ms <= 0) return "—";
  if (ms < 1e12) ms = ms * 1000;
  var d = new Date(ms);
  function pad(v) { return (v < 10 ? "0" : "") + v; }
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function formatAge(tsSeconds, nowMs) {
  var ms = Number(tsSeconds);
  if (!isFinite(ms) || ms <= 0) return "—";
  if (ms < 1e12) ms = ms * 1000;
  var now = Number(nowMs);
  if (!isFinite(now) || now <= 0) now = Date.now();
  var delta = Math.max(0, Math.floor((now - ms) / 1000));
  if (delta < 60) return delta + "s ago";
  if (delta < 3600) return Math.floor(delta / 60) + "m ago";
  if (delta < 86400) return Math.floor(delta / 3600) + "h ago";
  return Math.floor(delta / 86400) + "d ago";
}

function isStale(tsSeconds, nowMs, refreshSec) {
  var ms = Number(tsSeconds);
  if (!isFinite(ms) || ms <= 0) return true;
  if (ms < 1e12) ms = ms * 1000;
  var now = Number(nowMs);
  if (!isFinite(now) || now <= 0) now = Date.now();
  var limit = Math.max(60, Number(refreshSec) || 60) * 1000 * 3;
  return (now - ms) > limit;
}

// Merge a fresh quote into an existing sparkline series. When the chart
// endpoint is down or rate-limited, the bar would otherwise lose its line;
// instead we keep the previous series and nudge its last point with the new
// spot price so the line stays live. `tsSec` is the mempool timestamp (seconds).
function mergeSeriesWithSpot(series, price, tsSec) {
  var out = series && series.length ? series.slice(0) : [];
  if (!(isFinite(Number(price)) && Number(price) > 0)) return out;
  var tsMs = Number(tsSec) > 0 ? Number(tsSec) : NaN;
  if (isFinite(tsMs) && tsMs < 1e12) tsMs = tsMs * 1000;
  if (!isFinite(tsMs)) tsMs = Date.now();
  if (out.length === 0) {
    out.push({ ts: tsMs, price: Number(price) });
    return out;
  }
  var last = out[out.length - 1];
  if (isFinite(Number(last && last.ts)) && Math.abs(Number(last.ts) - tsMs) < 60 * 60 * 1000) {
    out[out.length - 1] = { ts: tsMs, price: Number(price) };
  } else {
    out.push({ ts: tsMs, price: Number(price) });
  }
  return out;
}

// Downsample to at most `max` points for the bar sparkline. Even stride
// keeps the shape honest instead of clustering on the newest tail.
function downsampleSeries(series, max) {
  if (!series || series.length === 0) return [];
  var cap = Math.max(2, Number(max) || 24);
  if (series.length <= cap) return series.slice(0);
  var out = [];
  var step = (series.length - 1) / (cap - 1);
  for (var i = 0; i < cap; i++) {
    out.push(series[Math.round(i * step)]);
  }
  return out;
}

function sparklineGeometry(series, width, height) {
  var points = series || [];
  if (points.length < 2 || width <= 0 || height <= 0) return [];
  var min = Infinity;
  var max = -Infinity;
  for (var i = 0; i < points.length; i++) {
    var p = Number(points[i] && points[i].price);
    if (!isFinite(p)) continue;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  if (!isFinite(min) || !isFinite(max)) return [];
  var range = max - min;
  var pad = 1;
  var usableH = Math.max(1, height - pad * 2);
  var usableW = Math.max(1, width - 1);
  var coords = [];
  var count = 0;
  for (var j = 0; j < points.length; j++) {
    var price = Number(points[j] && points[j].price);
    if (!isFinite(price)) continue;
    var x = (count / (points.length - 1)) * usableW + 0.5;
    var norm = range === 0 ? 0.5 : (price - min) / range;
    var y = pad + (1 - norm) * usableH;
    coords.push({ x: x, y: y });
    count++;
  }
  return coords;
}

function sparklinePath(coords, height, closeToBaseline) {
  if (!coords || coords.length < 2) return "";
  var d = "M " + coords[0].x.toFixed(2) + " " + coords[0].y.toFixed(2);
  for (var i = 1; i < coords.length; i++) {
    d += " L " + coords[i].x.toFixed(2) + " " + coords[i].y.toFixed(2);
  }
  if (closeToBaseline && coords.length > 0) {
    var base = Math.max(0, (Number(height) || 24) - 0.5).toFixed(2);
    var lastX = coords[coords.length - 1].x.toFixed(2);
    var firstX = coords[0].x.toFixed(2);
    d += " L " + lastX + " " + base + " L " + firstX + " " + base + " Z";
  }
  return d;
}

function tooltipText(quote, currency, nowMs) {
  if (!quote) return "Bitcoin\nNo data yet";
  var code = normalizeCurrency(currency);
  var price = quote.prices[code];
  var change = quote.changes[code];
  var lines = ["Bitcoin"];
  if (isFinite(price) && price > 0) {
    lines.push(formatPrice(price, code));
  } else {
    lines.push("—");
  }
  if (isFinite(change)) {
    lines.push("24h " + formatChangeCompact(change));
  }
  if (isFinite(quote.ts) && quote.ts > 0) {
    lines.push("Updated " + formatClock(quote.ts) + " · " + formatAge(quote.ts, nowMs));
  }
  if (quote.sources && quote.sources.length) {
    lines.push(quote.sources.join(" · "));
  }
  return lines.join("\n");
}

function serializeState(quote, currency) {
  return {
    version: 1,
    currency: normalizeCurrency(currency),
    ts: quote && isFinite(quote.ts) ? quote.ts : 0,
    prices: quote && quote.prices ? quote.prices : {},
    changes: quote && quote.changes ? quote.changes : {},
    series: quote && quote.series ? quote.series : [],
    sources: quote && quote.sources ? quote.sources : []
  };
}

function parseState(raw) {
  if (!raw || typeof raw !== "string") return null;
  var text = raw.replace(/^\s+|\s+$/g, "");
  if (!text) return null;
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  var prices = {};
  var changes = {};
  var series = [];
  if (parsed.prices && typeof parsed.prices === "object") {
    for (var code in parsed.prices) {
      if (!parsed.prices.hasOwnProperty(code)) continue;
      var value = Number(parsed.prices[code]);
      if (isFinite(value) && value > 0) prices[code] = value;
    }
  }
  // Flat write path from the widget: { spot, changePct, currency }.
  var flatSpot = Number(parsed.spot);
  if ((!prices || Object.keys(prices).length === 0) && isFinite(flatSpot) && flatSpot > 0) {
    prices[normalizeCurrency(parsed.currency)] = flatSpot;
  }
  if (parsed.changes && typeof parsed.changes === "object") {
    for (var code2 in parsed.changes) {
      if (!parsed.changes.hasOwnProperty(code2)) continue;
      var change = Number(parsed.changes[code2]);
      if (isFinite(change)) changes[code2] = change;
    }
  }
  var flatChange = Number(parsed.changePct);
  if ((!changes || Object.keys(changes).length === 0) && isFinite(flatChange)) {
    changes[normalizeCurrency(parsed.currency)] = flatChange;
  }
  if (parsed.series && parsed.series.length) {
    for (var i = 0; i < parsed.series.length; i++) {
      var point = parsed.series[i];
      if (!point) continue;
      var ts = Number(point.ts !== undefined ? point.ts : (point && point.length > 1 ? point[0] : NaN));
      var price = Number(point.price !== undefined ? point.price : (point && point.length > 1 ? point[1] : NaN));
      if (isFinite(ts) && isFinite(price) && price > 0) series.push({ ts: ts, price: price });
    }
  }
  var headlines = [];
  if (parsed.headlines && parsed.headlines.length) {
    for (var h = 0; h < parsed.headlines.length && h < NEWS_LIMIT; h++) {
      var head = parsed.headlines[h];
      if (!head || !head.title) continue;
      var headMs = Number(head.publishedMs);
      headlines.push({
        title: String(head.title),
        link: String(head.link || ""),
        source: String(head.source || ""),
        publishedMs: isFinite(headMs) ? headMs : null
      });
    }
  }
  var etfFlow = null;
  if (parsed.etfFlow && typeof parsed.etfFlow === "object") {
    var flowDate = String(parsed.etfFlow.date || "");
    var flowTotal = Number(parsed.etfFlow.total);
    if (flowDate && isFinite(flowTotal)) {
      etfFlow = {
        date: flowDate,
        shortDate: String(parsed.etfFlow.shortDate || flowDate),
        total: flowTotal
      };
    }
  }
  if (Object.keys(prices).length === 0 && series.length === 0) return null;
  return {
    headlines: headlines,
    etfFlow: etfFlow,
    prices: prices,
    changes: changes,
    series: series,
    ts: Number(parsed.ts) || 0,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    chartRange: normalizeRange(parsed.chartRange),
    fees: parsed.fees && typeof parsed.fees === "object" ? parsed.fees : null,
    blockHeight: Number(parsed.blockHeight) || 0,
    hashrate: Number(parsed.hashrate) || 0,
    difficultyChange: Number(parsed.difficultyChange) || 0,
    difficultyProgress: Number(parsed.difficultyProgress) || 0,
    difficultyTimeAvgMs: Number(parsed.difficultyTimeAvgMs) || 0,
    fngValue: Number(parsed.fngValue) || 0,
    fngClassification: String(parsed.fngClassification || "")
  };
}
