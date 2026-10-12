// Quick checks for Model.js — run with: node test-model.js
var fs = require("fs")
var path = require("path")
var src = fs.readFileSync(path.join(__dirname, "Model.js"), "utf8")
var Model = {}
new Function(src + "\n;return this")()
// Model.js declares functions in the function scope of `new Function`,
// so re-evaluate with an explicit export object instead.
Model = new Function(src + "\nreturn {CURRENCIES:CURRENCIES,SYMBOLS:SYMBOLS,MEMPOOL_PRICES_URL:MEMPOOL_PRICES_URL,MEMPOOL_HEIGHT_URL:MEMPOOL_HEIGHT_URL,MEMPOOL_FEES_URL:MEMPOOL_FEES_URL,MEMPOOL_HASHRATE_URL:MEMPOOL_HASHRATE_URL,MEMPOOL_DIFFICULTY_URL:MEMPOOL_DIFFICULTY_URL,FEAR_GREED_URL:FEAR_GREED_URL,KALSHI_EOY_URL:KALSHI_EOY_URL,parseKalshiRange:parseKalshiRange,parseKalshiBucket:parseKalshiBucket,kalshiQuantile:kalshiQuantile,kalshiHorizonLabel:kalshiHorizonLabel,medianPremiumPct:medianPremiumPct,FARSIDE_BTC_URL:FARSIDE_BTC_URL,parseFarsideNumber:parseFarsideNumber,parseFarsideFlows:parseFarsideFlows,formatFlowUsd:formatFlowUsd,BAR_APPEARANCES:BAR_APPEARANCES,normalizeAppearance:normalizeAppearance,RSS_FEEDS:RSS_FEEDS,NEWS_LIMIT:NEWS_LIMIT,NEWS_SHOWN:NEWS_SHOWN,COINGECKO_SIMPLE_URL:COINGECKO_SIMPLE_URL,COINGECKO_CHART_URL:COINGECKO_CHART_URL,currencySymbol:currencySymbol,normalizeCurrency:normalizeCurrency,chartUrl:chartUrl,chartSources:chartSources,fallbackChartSeries:fallbackChartSeries,parseBinanceKlines:parseBinanceKlines,parseKrakenOhlc:parseKrakenOhlc,parseBitstampOhlc:parseBitstampOhlc,seriesFromCoingecko:seriesFromCoingecko,tailSeries:tailSeries,simplePriceUrl:simplePriceUrl,normalizeRange:normalizeRange,rangeKeyToDays:rangeKeyToDays,parseMempoolPrices:parseMempoolPrices,parseCoingeckoSimple:parseCoingeckoSimple,parseCoingeckoChart:parseCoingeckoChart,parseFees:parseFees,parseBlockHeight:parseBlockHeight,parseGlobalStats:parseGlobalStats,parseHashrate:parseHashrate,parseDifficultyAdjustment:parseDifficultyAdjustment,parseFearGreed:parseFearGreed,parseRss:parseRss,mergeHeadlines:mergeHeadlines,headlineAge:headlineAge,decodeEntities:decodeEntities,stripCdata:stripCdata,headlineRelevance:headlineRelevance,headlineSimilarity:headlineSimilarity,dedupeHeadlines:dedupeHeadlines,selectRelevant:selectRelevant,NEWS_TIER1_WINDOW_HOURS:NEWS_TIER1_WINDOW_HOURS,NEWS_TIER2_WINDOW_HOURS:NEWS_TIER2_WINDOW_HOURS,NEWS_TIER1_SCORE:NEWS_TIER1_SCORE,NEWS_TIER2_SCORE:NEWS_TIER2_SCORE,NEWS_MIN_ITEMS:NEWS_MIN_ITEMS,NEWS_DEDUPE_SIM:NEWS_DEDUPE_SIM,halvingInfo:halvingInfo,mergeQuote:mergeQuote,formatPrice:formatPrice,formatNumber:formatNumber,formatChange:formatChange,formatChangeCompact:formatChangeCompact,formatHashrate:formatHashrate,formatCompact:formatCompact,formatDuration:formatDuration,fearGreedColor:fearGreedColor,UP_COLOR:UP_COLOR,DOWN_COLOR:DOWN_COLOR,FNG_EXTREME_FEAR:FNG_EXTREME_FEAR,FNG_FEAR:FNG_FEAR,FNG_NEUTRAL:FNG_NEUTRAL,FNG_GREED:FNG_GREED,FNG_EXTREME_GREED:FNG_EXTREME_GREED,formatClock:formatClock,formatAge:formatAge,isStale:isStale,downsampleSeries:downsampleSeries,mergeSeriesWithSpot:mergeSeriesWithSpot,sparklineGeometry:sparklineGeometry,sparklinePath:sparklinePath,tooltipText:tooltipText,serializeState:serializeState,parseState:parseState}")()

var failures = 0
function check(name, cond, extra) {
  if (!cond) {
    failures++
    console.log("FAIL " + name + (extra !== undefined ? " -> " + JSON.stringify(extra) : ""))
  } else {
    console.log("ok   " + name)
  }
}

// --- normalize / symbol
check("normalizeCurrency uppercases", Model.normalizeCurrency("eur") === "EUR")
check("normalizeCurrency falls back", Model.normalizeCurrency("XXX") === "USD")
check("normalizeCurrency default", Model.normalizeCurrency(undefined) === "USD")
check("currencySymbol USD", Model.currencySymbol("USD") === "$")
check("currencySymbol JPY", Model.currencySymbol("JPY") === "¥")
check("chartUrl currency", Model.chartUrl("EUR").indexOf("vs_currency=eur") !== -1)
check("chartUrl default usd", Model.chartUrl("USD").indexOf("vs_currency=usd") !== -1)

// --- ranges / generalized chart url
check("normalizeRange valid", Model.normalizeRange("7d") === "7d")
check("normalizeRange fallback", Model.normalizeRange("x") === "24h")
check("normalizeRange as-is", Model.normalizeRange("1y") === "1y")
check("rangeKeyToDays", Model.rangeKeyToDays("30d") === 30 && Model.rangeKeyToDays("24h") === 1)
check("normalizeAppearance full", Model.normalizeAppearance("full") === "full")
check("normalizeAppearance subtle", Model.normalizeAppearance("subtle") === "subtle")
check("normalizeAppearance case-insensitive", Model.normalizeAppearance("SUBTLE") === "subtle")
check("normalizeAppearance fallback", Model.normalizeAppearance("weird") === "full" && Model.normalizeAppearance(undefined) === "full")
check("simplePriceUrl eur", Model.simplePriceUrl("EUR").indexOf("vs_currencies=eur") !== -1 && Model.simplePriceUrl("EUR").indexOf("include_market_cap=true") !== -1)
check("chartUrl 7d", Model.chartUrl("USD", "7d").indexOf("days=7") !== -1)
check("chartUrl 1y interval", Model.chartUrl("EUR", "1y").indexOf("days=365&interval=daily") !== -1)
check("chartUrl 30d interval", Model.chartUrl("USD", "30d").indexOf("interval=daily") !== -1)
check("chartUrl 24h no interval", Model.chartUrl("USD", "24h").indexOf("interval") === -1)

// --- chart fallback sources
var cg = Model.chartSources("USD", "1y")
check("chartSources coingecko first", cg[0].source === "coingecko" && cg[0].url.indexOf("days=365") !== -1)
check("chartSources binance mirrored", cg[1].source === "binance" && cg[1].url.indexOf("BTCUSDT") !== -1 && cg[1].url.indexOf("interval=1d") !== -1)
check("chartSources kraken mirrored", cg[2].source === "kraken" && cg[2].url.indexOf("XBTUSD") !== -1 && cg[2].url.indexOf("interval=1440") !== -1)
check("chartSources bitstamp mirrored", cg[3].source === "bitstamp" && cg[3].url.indexOf("btcusd") !== -1)
check("chartSources gates stop the script early", cg[0].check === '"prices"' && cg[1].check === "__HTTP_200__" && cg[2].check === '"result"' && cg[3].check === '"ohlc"')
var chf = Model.chartSources("CHF", "24h")
check("chartSources chf uses kraken only", chf.length === 2 && chf[1].source === "kraken" && chf[1].url.indexOf("XBTCHF") !== -1 && chf[1].url.indexOf("interval=5") !== -1)
check("chartSources cad skips binance/bitstamp", (function() {
  var s = Model.chartSources("CAD", "30d")
  return s.length === 2 && s[1].source === "kraken" && s[1].url.indexOf("XBTCAD") !== -1
})())
check("chartSources unknown range falls back to 24h steps", (function() {
  var s = Model.chartSources("USD", "nope")
  return s[0].url.indexOf("days=1") !== -1 && s[1].url.indexOf("interval=5m") !== -1
})())

var klines = Model.parseBinanceKlines([[1000, "1", "2", "0.5", "1.5", "9"], [2000, "1", "2", "0.5", "1.7", "9"], ["x"]])
check("parseBinanceKlines uses close", klines && klines.length === 2 && klines[1].price === 1.7 && klines[0].ts === 1000)
check("parseBinanceKlines junk", Model.parseBinanceKlines([]) === null && Model.parseBinanceKlines("x") === null)

var kraken = Model.parseKrakenOhlc({ error: [], result: { XXBTZUSD: [[1700000000, "1", "2", "0.5", "1.5", "1", "1", 1], [1700086400, "1", "2", "0.5", "1.9", "1", "1", 1]], last: 1700000000 } })
check("parseKrakenOhlc seconds to ms", kraken && kraken.length === 2 && kraken[0].ts === 1700000000000 && kraken[1].price === 1.9)
check("parseKrakenOhlc junk", Model.parseKrakenOhlc(null) === null && Model.parseKrakenOhlc({ error: [] }) === null && Model.parseKrakenOhlc({ result: { last: 1 } }) === null)

var bitstamp = Model.parseBitstampOhlc({ data: { ohlc: [{ timestamp: "1700000000", close: "2.5" }, { timestamp: "1700086400", close: "3" }] } })
check("parseBitstampOhlc ok", bitstamp && bitstamp.length === 2 && bitstamp[0].ts === 1700000000000 && bitstamp[1].price === 3)
check("parseBitstampOhlc junk", Model.parseBitstampOhlc({}) === null)

var longSeries = []
for (var k = 0; k < 900; k++) longSeries.push({ ts: k * 1000, price: k + 1 })
var trimmed = Model.fallbackChartSeries("kraken", "24h", { result: { XXBTZUSD: longSeries.map(function(p) { return [p.ts / 1000, "0", "0", "0", String(p.price), "0", "0", 1] }) } })
check("fallbackChartSeries trims to range points", trimmed && trimmed.length === 288 && trimmed[287].price === 900)
check("fallbackChartSeries unknown source", Model.fallbackChartSeries("nope", "24h", {}) === null)
check("seriesFromCoingecko wraps parse", (function() {
  var s = Model.seriesFromCoingecko({ prices: [[1, 2], [2, 3]] })
  return s && s.length === 2 && Model.seriesFromCoingecko({ status: { error_code: 429 } }) === null
})())

// --- parsers
var mempool = Model.parseMempoolPrices({ time: 1791286823, USD: 86304, EUR: 76655 })
check("parseMempoolPrices ok", mempool && mempool.prices.USD === 86304 && mempool.ts === 1791286823)
check("parseMempoolPrices junk", Model.parseMempoolPrices("<html>") === null)
check("parseMempoolPrices empty", Model.parseMempoolPrices({}) === null)

var simple = Model.parseCoingeckoSimple({ bitcoin: { usd: 86290.12, usd_24h_change: 0.2936 } })
check("parseCoingeckoSimple ok", simple && Math.abs(simple.prices.USD - 86290.12) < 1e-9 && Math.abs(simple.changes.USD - 0.2936) < 1e-9)
check("parseCoingeckoSimple junk", Model.parseCoingeckoSimple(null) === null)

var chart = Model.parseCoingeckoChart({ prices: [[1000, 100], [2000, 110], [3000, 105]] })
check("parseCoingeckoChart ok", chart && chart.series.length === 3 && chart.series[1].price === 110)
check("parseCoingeckoChart too short", Model.parseCoingeckoChart({ prices: [[1, 2]] }) === null)
check("parseCoingeckoChart junk", Model.parseCoingeckoChart({ prices: "x" }) === null)

// --- fees / height / global / hashrate / difficulty / fng
var fees = Model.parseFees({ fastestFee: 10, halfHourFee: 8, hourFee: 5, economyFee: 2, minimumFee: 1 })
check("parseFees ok", fees && fees.high === 10 && fees.mid === 8 && fees.low === 5 && fees.none === 2)
check("parseFees junk", Model.parseFees(null) === null)
check("parseFees missing mid", Model.parseFees({ fastestFee: 4 }).mid === 4)
check("parseBlockHeight", Model.parseBlockHeight("970510") === 970510 && Model.parseBlockHeight("<html>") === 0 && Model.parseBlockHeight("") === 0)

var gs = Model.parseGlobalStats({ bitcoin: { usd: 86290, usd_market_cap: 1.7e12, usd_24h_vol: 3.2e10, usd_24h_change: 0.3 } })
check("parseGlobalStats ok", gs && gs.prices.USD === 86290 && gs.changes.USD === 0.3 && Math.abs(gs.marketCaps.USD - 1.7e12) < 1 && Math.abs(gs.volumes.USD - 3.2e10) < 1)
check("parseGlobalStats junk", Model.parseGlobalStats(null) === null && Model.parseGlobalStats({}) === null)

var hr = Model.parseHashrate({ currentHashrate: 9.5e20, currentDifficulty: 1.14e14, hashrates: [{ timestamp: 1, avgHashrate: 9e20 }, { timestamp: 2, avgHashrate: 9.4e20 }] })
check("parseHashrate ok", hr && hr.current === 9.5e20 && hr.series.length === 2 && hr.series[1].value === 9.4e20)
check("parseHashrate junk", Model.parseHashrate(null) === null)

var diff = Model.parseDifficultyAdjustment({ progressPercent: 40.38, difficultyChange: 5.32, nextRetargetHeight: 971712, remainingBlocks: 1202, timeAvg: 570379 })
check("parseDifficultyAdjustment ok", diff && diff.progressPercent === 40.38 && diff.difficultyChange === 5.32 && diff.timeAvgMs === 570379)
check("parseDifficultyAdjustment missing time", Model.parseDifficultyAdjustment({ progressPercent: 1 }).timeAvgMs === null)

var fng = Model.parseFearGreed({ data: [{ value: "64", value_classification: "Greed", timestamp: 1791417600 }] })
check("parseFearGreed ok", fng && fng.value === 64 && fng.classification === "Greed")
check("parseFearGreed junk", Model.parseFearGreed(null) === null && Model.parseFearGreed({ data: [] }) === null)

// --- RSS / news
var newsNow = 1791286823000
check("decodeEntities named", Model.decodeEntities("a &amp; b &lt;c&gt; &quot;d&quot;") === 'a & b <c> "d"')
check("decodeEntities numeric", Model.decodeEntities("&#8217;hi&#x2019;") === "\u2019hi\u2019")
check("stripCdata", Model.stripCdata("<![CDATA[Hello &amp; bye]]>") === "Hello &amp; bye")
var rssXml = "<rss><channel><title>Channel Title</title>" +
  "<item><title><![CDATA[Bitcoin &amp; friends]]></title><link><![CDATA[https://ex/a]]></link><pubDate>Thu, 08 Oct 2026 18:14:39 +0000</pubDate></item>" +
  "<item><title>Second story</title><link>https://ex/b</link><pubDate>Thu, 08 Oct 2026 12:00:00 +0000</pubDate></item>" +
  "<item><title></title><link>https://ex/empty</link></item>" +
  "</channel></rss>"
var rss = Model.parseRss(rssXml, { label: "CoinDesk" })
check("parseRss item count", rss.length === 2)
check("parseRss excludes channel title", rss.every(function (it) { return it.title !== "Channel Title" }))
check("parseRss decodes cdata/entities", rss[0].title === "Bitcoin & friends" && rss[0].link === "https://ex/a")
check("parseRss source label", rss[0].source === "CoinDesk")
check("parseRss date parsed", rss[0].publishedMs === Date.parse("Thu, 08 Oct 2026 18:14:39 +0000"))
check("parseRss missing date -> null", Model.parseRss("<item><title>x</title></item>", {})[0].publishedMs === null)
check("parseRss empty", Model.parseRss("").length === 0)

var bySource = {
  coindesk: [
    { title: "Second story", link: "https://ex/b", source: "CoinDesk", publishedMs: 2000 },
    { title: "Bitcoin & friends", link: "https://ex/a", source: "CoinDesk", publishedMs: 3000 }
  ],
  cointelegraph: [
    { title: "second story", link: "https://ex/dup", source: "Cointelegraph", publishedMs: 1000 },
    { title: "Old item", link: "https://ex/c", source: "Cointelegraph", publishedMs: 500 }
  ]
}
var news = Model.mergeHeadlines(bySource, Model.NEWS_LIMIT)
check("mergeHeadlines dedupes case-insensitively", news.length === 3)
check("mergeHeadlines newest first", news[0].title === "Bitcoin & friends" && news[1].title === "Second story")
check("mergeHeadlines keeps first source on dup", news[1].source === "CoinDesk")
check("mergeHeadlines caps", Model.mergeHeadlines(bySource, 2).length === 2)
check("mergeHeadlines empty", Model.mergeHeadlines({}, 5).length === 0)
check("headlineAge now", Model.headlineAge(newsNow - 10000, newsNow) === "now")
check("headlineAge minutes", Model.headlineAge(newsNow - 5 * 60000, newsNow) === "5m")
check("headlineAge hours", Model.headlineAge(newsNow - 3 * 3600000, newsNow) === "3h")
check("headlineAge days", Model.headlineAge(newsNow - 2 * 86400000, newsNow) === "2d")
check("headlineAge bad", Model.headlineAge(NaN, newsNow) === "")

// --- relevance gating (the "random stories" regression)
check("relevance noise scores 0", Model.headlineRelevance("Hallador Signs $693 Million Power Deal With Indiana Utility").score === 0)
check("relevance crypto matches", Model.headlineRelevance("Bitcoin breaks below $83,000 on Iran strike fears").crypto.length > 0)
check("relevance fed story", Model.headlineRelevance("Fed’s Musalem Signals Rates Should Rise Next Six-to-Nine Months").score >= Model.NEWS_TIER1_SCORE)
check("relevance cpi story", Model.headlineRelevance("Inflation on many everyday items was entirely due to tariffs, NY Fed says").score >= Model.NEWS_TIER1_SCORE)
// defi must be word-bounded: "deficit"/"defiant" are not crypto
check("relevance deficit not crypto", Model.headlineRelevance("Budget deficit widens sharply").crypto.length === 0)
check("relevance defiant not crypto", Model.headlineRelevance("Defiant traders shrug off the selloff").crypto.length === 0)
check("relevance coinbase corporate is not crypto", Model.headlineRelevance("Coinbase Bets Banks Will Be Big Customers").crypto.length === 0)

check("similarity identical", Model.headlineSimilarity("Bitcoin rises today", "Bitcoin rises today") === 1)
check("similarity musalem near-dup high", Model.headlineSimilarity(
  "Fed’s Musalem Signals Rates Should Rise Next Six-to-Nine Months",
  "Musalem Signals Fed Rates Should Rise Over Next Six-to-Nine Months") > Model.NEWS_DEDUPE_SIM)
check("similarity unrelated low", Model.headlineSimilarity("Bitcoin breaks below 83k", "Coffee prices hit record") < 0.2)

var dedupeInput = [
  { title: "Fed’s Musalem Signals Rates Should Rise Next Six-to-Nine Months", publishedMs: 2000 },
  { title: "Musalem Signals Fed Rates Should Rise Over Next Six-to-Nine Months", publishedMs: 1999 },
  { title: "Bitcoin breaks below $83,000", publishedMs: 1000 }
]
check("dedupeHeadlines removes near-dup", Model.dedupeHeadlines(dedupeInput, Model.NEWS_DEDUPE_SIM).length === 2)

// selectRelevant: tier 1 filter + freshness window
var nowSel = newsNow
var selInput = [
  { title: "Bitcoin rebounds above $85,000", source: "CoinDesk", publishedMs: nowSel - 3600000 },
  { title: "Fed signals rate cuts as inflation cools", source: "CNBC", publishedMs: nowSel - 7200000 },
  { title: "Hallador Signs $693 Million Power Deal With Indiana Utility", source: "CNBC", publishedMs: nowSel - 3600000 },
  { title: "Stale bitcoin story from long ago", source: "CoinDesk", publishedMs: nowSel - 200 * 3600000 }
]
var selected = Model.selectRelevant(selInput, nowSel)
check("selectRelevant drops noise", !selected.some(function (i) { return i.title.indexOf("Hallador") !== -1 }))
check("selectRelevant drops stale", !selected.some(function (i) { return i.title.indexOf("Stale") !== -1 }))
check("selectRelevant keeps btc + fed", selected.length === 2)
check("selectRelevant sorts newest first", selected[0].title.indexOf("Bitcoin") !== -1)

// tier 2 fallback: only weak/borderline stories, fewer than NEWS_MIN_ITEMS strong ones
var tier2Input = [
  { title: "Oil prices jump as tanker attacks escalate", source: "FT", publishedMs: nowSel - 3600000 },
  { title: "Recession fears grow as yields invert", source: "Bloomberg", publishedMs: nowSel - 3600000 }
]
var tier2 = Model.selectRelevant(tier2Input, nowSel)
check("selectRelevant tier2 fallback fires", tier2.length === 2)

// --- halving math / formatting helpers
var halv = Model.halvingInfo(970510, 570379)
check("halvingInfo next 1050000", halv && halv.nextHeight === 1050000 && halv.blocksLeft === 79490 && halv.epoch === 5)
check("halvingInfo default block time", Model.halvingInfo(970510, null).etaMs === 79490 * 600000)
check("halvingInfo bad height", Model.halvingInfo(0, 1000) === null)
check("formatHashrate", Model.formatHashrate(9.13e20) === "913 EH/s")
check("formatCompact T", Model.formatCompact(1.63e12) === "1.63T")
check("formatCompact B", Model.formatCompact(3.67e10) === "36.7B")
check("formatCompact K", Model.formatCompact(1500) === "1.5K")
check("formatDuration y", Model.formatDuration(45.3e9) === "1.4y")
check("formatDuration d", Model.formatDuration(86400000 * 5) === "5d")
check("fearGreedColor ramp", Model.fearGreedColor(10) === "#e53935" && Model.fearGreedColor(30) === "#ff9800" && Model.fearGreedColor(60) === "#3ddc84" && Model.fearGreedColor(90) === "#00e676")
check("fearGreedColor follows alternative.me bands", Model.fearGreedColor(24) === Model.FNG_EXTREME_FEAR && Model.fearGreedColor(25) === Model.FNG_FEAR && Model.fearGreedColor(44) === Model.FNG_FEAR && Model.fearGreedColor(45) === Model.FNG_NEUTRAL && Model.fearGreedColor(55) === Model.FNG_NEUTRAL && Model.fearGreedColor(56) === Model.FNG_GREED && Model.fearGreedColor(75) === Model.FNG_GREED && Model.fearGreedColor(76) === Model.FNG_EXTREME_GREED)
check("direction colors match fear-greed stops", Model.DOWN_COLOR === Model.fearGreedColor(0) && Model.UP_COLOR === Model.fearGreedColor(60))

// --- mergeQuote
var merged = Model.mergeQuote(mempool, simple, chart, "USD")
check("mergeQuote USD from chart", merged && merged.prices.USD === 105)
check("mergeQuote sources", merged && merged.sources.join(",") === "mempool,coingecko,chart")
var eur = Model.mergeQuote(mempool, null, null, "EUR")
check("mergeQuote EUR from mempool", eur && eur.prices.USD === 86304 && eur.prices.EUR === 76655)
var eurChart = Model.mergeQuote(null, null, { series: [{ ts: 1000, price: 76000 }, { ts: 2000, price: 76655 }] }, "EUR")
check("mergeQuote chart lands in EUR", eurChart && eurChart.prices.EUR === 76655)
check("mergeQuote change derived", eurChart && Math.abs(eurChart.changes.EUR - ((76655 - 76000) / 76000) * 100) < 1e-9)
check("mergeQuote nothing", Model.mergeQuote(null, null, null, "USD") === null)

// --- formatting
check("formatPrice USD 86304", Model.formatPrice(86304, "USD") === "$86,304")
check("formatPrice USD small", Model.formatPrice(86.29, "USD") === "$86.29")
check("formatPrice JPY", Model.formatPrice(13612036, "JPY") === "¥13,612,036")
check("formatPrice zero", Model.formatPrice(0, "USD") === "—")
check("formatNumber grouping", Model.formatNumber(1234567.5, 2) === "1,234,567.50")
check("formatNumber negative", Model.formatNumber(-1234.5, 1) === "-1,234.5")
check("formatChange up", Model.formatChange(0.2936) === "▲ 0.29%")
check("formatChange down", Model.formatChange(-1.5) === "▼ 1.50%")
check("formatChangeCompact up", Model.formatChangeCompact(0.2936) === "+0.29%")
check("formatChangeCompact down", Model.formatChangeCompact(-1.5) === "-1.50%")
check("formatClock", Model.formatClock(1791286823).length === 8)

// --- staleness
var now = 1791286823000
check("isStale fresh", Model.isStale(1791286823, now, 60) === false)
check("isStale old", Model.isStale(1791286000, now, 60) === true)
check("isStale missing ts", Model.isStale(0, now, 60) === true)

// --- series helpers
var series = []
for (var i = 0; i < 100; i++) series.push({ ts: i * 1000, price: 100 + Math.sin(i / 5) * 10 })
var down = Model.downsampleSeries(series, 24)
check("downsampleSeries cap", down.length === 24)
check("downsampleSeries keeps ends", down[0].price === series[0].price && down[23].price === series[99].price)
check("downsampleSeries short passthrough", Model.downsampleSeries(series.slice(0, 5), 24).length === 5)

var coords = Model.sparklineGeometry(series.slice(0, 10), 40, 14)
check("sparklineGeometry count", coords.length === 10)
check("sparklineGeometry x range", coords[0].x >= 0 && coords[9].x <= 40)
check("sparklineGeometry y range", coords.every(function (c) { return c.y >= 0 && c.y <= 14 }))
var path = Model.sparklinePath(coords, 14, false)
check("sparklinePath starts M", path.indexOf("M ") === 0)
var closed = Model.sparklinePath(coords, 14, true)
check("sparklinePath fill closes", closed.indexOf("Z") !== -1)

// --- tooltip / state round-trip
var tip = Model.tooltipText(merged, "USD", now)
check("tooltipText has price", tip.indexOf("$105") !== -1 || tip.indexOf("$105.00") !== -1 || tip.indexOf("Bitcoin") !== -1)
check("tooltipText empty", Model.tooltipText(null, "USD", now).indexOf("No data") !== -1)

var state = Model.serializeState(merged, "USD")
var restored = Model.parseState(JSON.stringify(state))
check("state round-trip prices", restored && restored.prices.USD === merged.prices.USD)
var flat = JSON.stringify({ version: 1, currency: "USD", ts: 1791286823, spot: 86304.5, changePct: 1.25, series: [{ ts: 1, price: 86000 }], sources: ["mempool"] })
var flatRestored = Model.parseState(flat)
check("parseState flat spot", flatRestored && flatRestored.prices.USD === 86304.5)
check("parseState flat change", flatRestored && flatRestored.changes.USD === 1.25)
check("parseState garbage", Model.parseState("not json") === null)
check("parseState empty", Model.parseState("") === null)
var withNews = JSON.stringify({ version: 2, currency: "USD", ts: 1791286823, spot: 86304.5, series: [{ ts: 1, price: 86000 }], headlines: [{ title: "Hello", link: "https://ex/a", source: "CoinDesk", publishedMs: 1791286000000 }] })
var newsRestored = Model.parseState(withNews)
check("parseState headlines round-trip", newsRestored && newsRestored.headlines.length === 1 && newsRestored.headlines[0].title === "Hello" && newsRestored.headlines[0].publishedMs === 1791286000000)

// --- Kalshi terminal-distribution ladder
check("kalshi bucket range", (function () { var b = Model.parseKalshiBucket("90,000 to 94,999.99"); return b && b.lo === 90000 && b.hi === 94999.99 })())
check("kalshi bucket below", (function () { var b = Model.parseKalshiBucket("19,999.99 or below"); return b && b.lo === 0 && b.hi === 19999.99 })())
check("kalshi bucket above is open-ended", (function () { var b = Model.parseKalshiBucket("150,000 or above"); return b && b.lo === 150000 && b.hi === Infinity })())
check("kalshi bucket junk", Model.parseKalshiBucket("no numbers here") === null)

var kalshiFixture = { markets: [
  { yes_sub_title: "19,999.99 or below", last_price_dollars: "0.0100", expiration_time: "2027-01-08T05:00:00Z" },
  { yes_sub_title: "20,000 to 49,999.99", last_price_dollars: "0.3900", expiration_time: "2027-01-08T05:00:00Z" },
  { yes_sub_title: "50,000 to 99,999.99", last_price_dollars: "0.6000", expiration_time: "2027-01-08T05:00:00Z" },
  { yes_sub_title: "100,000 or above", last_price_dollars: "0.0000", expiration_time: "2027-01-08T05:00:00Z" },
  { yes_sub_title: "1,000 to 1,999", last_price_dollars: "0.5000", expiration_time: "2026-04-01T05:00:00Z" }
] }
var parsedKalshi = Model.parseKalshiRange(kalshiFixture)
check("kalshi parse ok", parsedKalshi !== null)
check("kalshi drops zero-price bucket", parsedKalshi.buckets.length === 3)
check("kalshi drops other-expiry events", parsedKalshi.buckets.every(function (b) { return b.lo < 100000 }))
check("kalshi median p50 interpolated", parsedKalshi.median === 58000)
check("kalshi p25 interpolated", parsedKalshi.p25 === 38000)
check("kalshi p75 interpolated", parsedKalshi.p75 === 79000)
check("kalshi p90 interpolated", parsedKalshi.p90 === 92000)
check("kalshi p10 interpolated", parsedKalshi.p10 === 27000)

var kalshiUnnormalized = { markets: [
  { yes_sub_title: "0 to 49,999.99", last_price_dollars: "0.40", expiration_time: "2027-01-08T05:00:00Z" },
  { yes_sub_title: "50,000 or above", last_price_dollars: "0.70", expiration_time: "2027-01-08T05:00:00Z" }
] }
var normalized = Model.parseKalshiRange(kalshiUnnormalized)
check("kalshi normalizes probs to 1", Math.abs(normalized.buckets.reduce(function (a, b) { return a + b.prob }, 0) - 1) < 1e-9)
check("kalshi open-ended median null", normalized.median === null)
check("kalshi open-ended p90 null", normalized.p90 === null)

var singleBucket = Model.parseKalshiRange({ markets: [{ yes_sub_title: "0 to 49,999.99", last_price_dollars: "1", event_ticker: "KXBTCY-27JAN0100", expiration_time: "2027-01-08T05:00:00Z" }] })
check("kalshi single bucket median", singleBucket.median === 25000)
check("kalshi event ticker captured", singleBucket.eventTicker === "KXBTCY-27JAN0100")
check("kalshi quantile q<0 null", Model.kalshiQuantile(parsedKalshi.buckets, -0.1) === null)
check("kalshi quantile q>1 null", Model.kalshiQuantile(parsedKalshi.buckets, 1.5) === null)
check("kalshi quantile q=1 open-ended null", Model.kalshiQuantile(normalized.buckets, 1) === null)
check("kalshi quantile empty null", Model.kalshiQuantile([], 0.5) === null)

check("kalshi empty json null", Model.parseKalshiRange({}) === null)
check("kalshi no markets null", Model.parseKalshiRange({ markets: [] }) === null)
check("kalshi all-zero null", Model.parseKalshiRange({ markets: [{ yes_sub_title: "0 to 1", last_price_dollars: "0", expiration_time: "2027-01-08T05:00:00Z" }] }) === null)
check("kalshi horizon jan is end of year", Model.kalshiHorizonLabel("KXBTCY-27JAN0100") === "End of year")
check("kalshi horizon other month", Model.kalshiHorizonLabel("KXBTCY-27JUN3000") === "End of June")
check("kalshi horizon junk", Model.kalshiHorizonLabel("not-a-ticker") === "")

// --- Farside ETF flows
check("farside number plain", Model.parseFarsideNumber("381.4") === 381.4)
check("farside number parenthesised is negative", Model.parseFarsideNumber("(207.7)") === -207.7)
check("farside number thousands", Model.parseFarsideNumber("(1,019.9)") === -1019.9)
check("farside number zero", Model.parseFarsideNumber("0.0") === 0)
check("farside number dash is null", Model.parseFarsideNumber("-") === null)
check("farside number blank is null", Model.parseFarsideNumber("") === null && Model.parseFarsideNumber(null) === null)
check("farside number junk is null", Model.parseFarsideNumber("n/a") === null)

var farsideFixture = "<table class=\"etf\">"
  + "<thead><tr><th></th><th>IBIT</th><th>FBTC</th><th>BITB</th><th>ARKB</th><th>GBTC</th><th>BTC</th><th></th></tr></thead>"
  + "<tr><td>Fee</td><td>0.25%</td><td>0.25%</td><td>0.20%</td><td>0.21%</td><td>1.50%</td><td>0.15%</td><td></td></tr>"
  + "<tr><td>06 Oct 2026</td><td>10.0</td><td>0.0</td><td>0.0</td><td>0.0</td><td>0.0</td><td>0.0</td><td>10.0</td></tr>"
  + "<tr><td>07 Oct 2026</td><td>100.0</td><td>20.0</td><td>(50.0)</td><td>0.0</td><td>5.0</td><td>0.0</td><td>75.0</td></tr>"
  + "<tr><td>08 Oct 2026</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>0.0</td></tr>"
  + "</table>"
var flows = Model.parseFarsideFlows(farsideFixture)
check("farside picks latest settled day", flows && flows.total === 75 && flows.date === "2026-10-07" && flows.shortDate === "07 Oct")
check("farside rejects pending row with fake 0.0 total", flows && flows.date !== "2026-10-08")
check("farside no table null", Model.parseFarsideFlows("<html>nope</html>") === null)
check("farside all-pending null", Model.parseFarsideFlows(
  "<table class=\"etf\"><tr><th></th><th>IBIT</th><th>FBTC</th><th>BITB</th><th>ARKB</th><th>GBTC</th><th>BTC</th><th></th></tr>"
  + "<tr><td>08 Oct 2026</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>0.0</td></tr></table>") === null)

check("formatFlowUsd outflow", Model.formatFlowUsd(-484.9) === "-$484.9M")
check("formatFlowUsd inflow", Model.formatFlowUsd(118.8) === "+$118.8M")
check("formatFlowUsd zero", Model.formatFlowUsd(0) === "$0")
check("formatFlowUsd billions", Model.formatFlowUsd(1500) === "+$1.50B" && Model.formatFlowUsd(-2500) === "-$2.50B")
check("formatFlowUsd bad", Model.formatFlowUsd(NaN) === "—" && Model.formatFlowUsd(null) === "$0")

check("medianPremiumPct above", Math.abs(Model.medianPremiumPct(82954, 82000) - 1.1634) < 0.001)
check("medianPremiumPct below", Model.medianPremiumPct(80000, 82000) < 0)
check("medianPremiumPct equal", Model.medianPremiumPct(82000, 82000) === 0)
check("medianPremiumPct bad", Model.medianPremiumPct(0, 82000) === null && Model.medianPremiumPct(80000, 0) === null && Model.medianPremiumPct(NaN, 82000) === null)

// --- mergeSeriesWithSpot: keep the sparkline alive when chart is down
var baseSeries = [{ ts: 1791286800000, price: 86000 }, { ts: 1791288600000, price: 86300 }]
check("merge into existing nudges last point", Model.mergeSeriesWithSpot(baseSeries, 86400, 1791289200).length === 2)
check("merge into existing updates last price", Model.mergeSeriesWithSpot(baseSeries, 86400, 1791289200)[1].price === 86400)
check("merge into empty seeds series", Model.mergeSeriesWithSpot([], 86000, 1791289200).length === 1)
check("merge ignores bad price", Model.mergeSeriesWithSpot(baseSeries, NaN, 1791289200).length === 2)
var farTs = Model.mergeSeriesWithSpot(baseSeries, 86400, 1791300000)
check("merge appends after long gap", farTs.length === 3 && farTs[2].price === 86400)

// --- live API shape sanity (offline-tolerant)
if (process.env.LIVE) {
  var https = require("https")
  function get(url, cb) {
    https.get(url, function (res) {
      var body = ""
      res.on("data", function (d) { body += d })
      res.on("end", function () { cb(null, body) })
    }).on("error", function (e) { cb(e) })
  }
  get(Model.MEMPOOL_PRICES_URL, function (err, body) {
    if (err) { console.log("skip live mempool:", err.message); return }
    var parsed = Model.parseMempoolPrices(JSON.parse(body))
    console.log("live mempool USD:", parsed && parsed.prices.USD)
    check("live mempool parses", !!parsed && parsed.prices.USD > 0)
  })
  get(Model.COINGECKO_CHART_URL, function (err, body) {
    if (err) { console.log("skip live chart:", err.message); return }
    var parsed = Model.parseCoingeckoChart(JSON.parse(body))
    console.log("live chart points:", parsed && parsed.series.length)
    check("live chart parses", !!parsed && parsed.series.length >= 2)
    var g = Model.sparklineGeometry(parsed.series, 40, 14)
    check("live sparkline coords", g.length >= 2)
  })
}

if (failures > 0) {
  console.log("\n" + failures + " failure(s)")
  process.exit(1)
}
console.log("\nall checks passed")
