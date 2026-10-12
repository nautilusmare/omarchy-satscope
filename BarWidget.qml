import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "maurice.bitcoin"
  ipcTarget: "maurice.bitcoin"
  manageIpc: true

  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/maurice.bitcoin/"
  readonly property string statePath: stateDir + "state.json"

  property double spot: 0
  property double changePct: NaN
  property var chartSeries: []
  property string chartSource: "coingecko"
  property double fetchedAt: 0
  property double lastGlobalAt: 0
  property bool stale: false
  property bool stateReady: false
  property string sourcesText: ""

  property var mempoolPrices: ({})
  property var globalPrices: ({})
  property var globalChanges: ({})
  property var marketCaps: ({})
  property var volumes: ({})

  property var stateFees: null
  property int blockHeight: 0
  property double hashrate: 0
  property double difficultyChange: 0
  property double difficultyProgress: 0
  property int difficultyEtaBlocks: 0
  property double difficultyTimeAvgMs: 0
  property int fngValue: 0
  property string fngClassification: ""
  property var headlines: []
  property bool onchainExpanded: false

  property bool eInFlight: false
  property string newsRaw: ""

  property bool fInFlight: false
  property string kalshiRaw: ""
  property var kalshiOdds: null

  property bool gInFlight: false
  property string farsideRaw: ""
  property var etfFlow: null

  property bool aInFlight: false
  property bool bInFlight: false
  property bool cInFlight: false
  property bool cPending: false
  property bool dInFlight: false
  // Wall-clock deadlines: QML int is 32-bit, so Date.now() + 5min overflows it.
  property double bCooldownUntil: 0
  property double cCooldownUntil: 0
  property int laneAPending: 0
  property int laneDPending: 0
  property string chartReqRange: ""
  property string chartReqCurrency: ""

  property string pricesRaw: ""
  property string heightRaw: ""
  property string feesRaw: ""
  property string globalRaw: ""
  property string chartRaw: ""
  property string hashrateRaw: ""
  property string difficultyRaw: ""
  property string fngRaw: ""

  property string focusSection: "ranges"
  property int cursorIndex: 0
  property bool cursorActive: false
  readonly property var rangeKeys: ["24h", "7d", "30d", "1y"]

  readonly property string currency: Model.normalizeCurrency(String(setting("currency", "USD")))
  readonly property string chartRange: Model.normalizeRange(String(setting("chartRange", "24h")))
  readonly property int refreshSec: Math.max(30, Math.min(600, Number(setting("refreshIntervalSec", 60)) || 60))
  readonly property bool sparklineEnabled: settingBool("sparkline", true)
  readonly property bool showChangeInBar: settingBool("showChange", false)
  readonly property bool vertical: bar ? bar.vertical : false
  readonly property bool hasQuote: spot > 0
  readonly property bool showSpark: sparklineEnabled && !vertical && series.length > 1
  readonly property bool showChangeText: showChangeInBar && !vertical && isFinite(changePct)
  readonly property bool dimmed: stale || !hasQuote
  readonly property string appearance: Model.normalizeAppearance(String(setting("barAppearance", "full")))
  // Subtle mode shows only a badge until hovered. Vertical bars keep the full
  // layout — there is no room to slide anything open along a vertical bar.
  readonly property bool subtleBar: appearance === "subtle" && !vertical
  property real revealT: (!subtleBar || (hoverArea.containsMouse && !opened)) ? 1 : 0
  readonly property bool tooltipHovered: !subtleBar && hoverArea.containsMouse && !dimmed && !opened
  readonly property int barSize: bar ? bar.barSize : Style.bar.sizeHorizontal

  readonly property var series: Model.downsampleSeries(chartSeries, 48)

  readonly property color upColor: Model.UP_COLOR
  readonly property color downColor: Model.DOWN_COLOR
  readonly property color neutralColor: bar ? bar.barForeground : Color.foreground
  readonly property color priceColor: neutralColor
  readonly property double sparkChange: {
    if (isFinite(changePct)) return changePct
    if (series.length >= 2) {
      var first = series[0].price
      var last = series[series.length - 1].price
      if (first > 0 && last > 0) return ((last - first) / first) * 100
    }
    return 0
  }
  readonly property color sparkColor: sparkChange >= 0 ? upColor : downColor
  readonly property color sparkLineColor: neutralColor
  readonly property real sparkWidth: 40
  readonly property real sparkHeight: 14
  readonly property real contentPad: Style.spaceReal(8)
  readonly property real gap: 6
  readonly property int badgeSize: Math.max(14, barSize - 8)
  readonly property real fullContentWidth: priceLabel.implicitWidth
    + (showChangeText ? gap + changeLabel.implicitWidth : 0)
    + (showSpark ? gap + sparkWidth : 0)

  readonly property string priceText: hasQuote ? Model.formatPrice(spot, currency) : "₿ —"
  readonly property string changeText: showChangeText ? Model.formatChange(changePct) : ""
  readonly property string tooltipText: buildTooltip()
  readonly property string changeLabelText: isFinite(changePct) ? Model.formatChangeCompact(changePct) : ""

  function settingBool(name, fallback) {
    var value = setting(name, fallback)
    if (value === true || value === false) return value
    var text = String(value).toLowerCase()
    if (text === "true" || text === "1") return true
    if (text === "false" || text === "0") return false
    return fallback
  }

  function parseJson(raw) {
    try {
      return JSON.parse(String(raw || "").trim())
    } catch (e) {
      return null
    }
  }

  function buildTooltip() {
    var lines = ["Bitcoin"]
    if (hasQuote) {
      lines.push(Model.formatPrice(spot, currency))
      if (isFinite(changePct)) lines.push("24h " + Model.formatChangeCompact(changePct))
    } else {
      lines.push("No data yet")
    }
    var ext = []
    if (blockHeight > 0) ext.push(blockHeight + " blocks")
    if (fngValue > 0) ext.push("F&G " + fngValue)
    if (ext.length) lines.push(ext.join(" · "))
    if (fetchedAt > 0) {
      lines.push("Updated " + Model.formatClock(fetchedAt) + " · " + Model.formatAge(fetchedAt, Date.now()))
    }
    if (sourcesText.length) lines.push(sourcesText)
    if (stale && hasQuote) lines.push("stale")
    return lines.join("\n")
  }

  function curlCmd(url, marker) {
    var cmd = ["curl", marker ? "-sS" : "-fsS", "--max-time", "6", url]
    if (marker) cmd = cmd.concat(["-w", "\n__HTTP_%{http_code}__"])
    return cmd
  }

  function splitStatus(raw) {
    var text = String(raw || "").trim()
    var marker = "__HTTP_"
    var idx = text.lastIndexOf(marker)
    if (idx === -1) return { status: 200, body: text }
    var code = parseInt(text.slice(idx + marker.length), 10)
    return { status: isFinite(code) ? code : 200, body: text.slice(0, idx).trim() }
  }

  function wrap(v, lo, hi) {
    if (v < lo) return hi
    if (v > hi) return lo
    return v
  }

  function saveSetting(key, value) {
    var next = {}
    for (var name in settings) {
      if (name !== "id") next[name] = settings[name]
    }
    next[key] = value
    root.settings = next
    if (bar && bar.shell && typeof bar.shell.updateEntryInline === "function") {
      bar.shell.updateEntryInline(root.moduleName, next)
    }
  }

  // --- data lanes -----------------------------------------------------------

  function laneAStart() {
    if (aInFlight) return
    aInFlight = true
    laneAPending = 3
    fetchPrices.running = true
    fetchHeight.running = true
    fetchFees.running = true
  }

  function laneADone() {
    laneAPending = Math.max(0, laneAPending - 1)
    if (laneAPending > 0) return
    aInFlight = false
    applyLaneA()
  }

  function applyLaneA() {
    var gotPrice = false
    if (pricesRaw) {
      var parsed = Model.parseMempoolPrices(parseJson(pricesRaw))
      if (parsed && parsed.prices) {
        mempoolPrices = parsed.prices
        gotPrice = true
      }
    }
    if (feesRaw) {
      var f = Model.parseFees(parseJson(feesRaw))
      if (f) stateFees = f
    }
    if (heightRaw) {
      var h = Model.parseBlockHeight(heightRaw)
      if (h > 0) blockHeight = h
    }
    if (gotPrice) {
      applySpotFromMempool()
      sourcesText = lastGlobalAt > 0 ? "coingecko · mempool" : "mempool"
    }
    if (stateReady) saveState()
  }

  function applySpotFromMempool() {
    var price = mempoolPrices[currency]
    var globalFresh = lastGlobalAt > 0 && Date.now() - lastGlobalAt < 600000 + 120000
    if (isFinite(price) && price > 0 && (!globalFresh || !hasQuote)) {
      spot = price
      fetchedAt = Math.floor(Date.now() / 1000)
      stale = false
    }
  }

  function laneBStart(force) {
    if (bInFlight) return
    if (!force && Date.now() < bCooldownUntil) return
    bInFlight = true
    fetchGlobal.command = curlCmd(Model.simplePriceUrl(currency), true)
    fetchGlobal.running = true
  }

  function onGlobalDone() {
    bInFlight = false
    var r = splitStatus(globalRaw)
    globalRaw = ""
    if (r.status === 429) {
      bCooldownUntil = Date.now() + 300000
      if (stateReady) saveState()
      return
    }
    var parsed = Model.parseGlobalStats(parseJson(r.body))
    if (!parsed) {
      if (stateReady) saveState()
      return
    }
    globalPrices = parsed.prices || ({})
    globalChanges = parsed.changes || ({})
    marketCaps = parsed.marketCaps || ({})
    volumes = parsed.volumes || ({})
    lastGlobalAt = Date.now()
    var price = globalPrices[currency]
    if (isFinite(price) && price > 0) {
      spot = price
    } else if (mempoolPrices[currency] > 0) {
      applySpotFromMempool()
    }
    if (isFinite(globalChanges[currency])) changePct = globalChanges[currency]
    stale = false
    fetchedAt = Math.floor(Date.now() / 1000)
    sourcesText = "coingecko · mempool"
    if (stateReady) saveState()
  }

  // One shell script for the whole lane: coingecko first, then the keyless
  // exchange mirrors. Each request is wrapped in a "@@SRC:<source>@@" sentinel
  // so the JS side can tell the blocks apart, and the script stops early as
  // soon as a body carries candles. A 429 answers with a JSON error object, so
  // without this fallback the panel kept drawing the previous range's chart and
  // looked frozen until the rate limit window passed.
  function chartScript() {
    var sources = Model.chartSources(currency, chartRange)
    var lines = []
    for (var i = 0; i < sources.length; i++) {
      lines.push("printf '@@SRC:" + sources[i].source + "@@\\n'")
      lines.push("body=$(curl -s --max-time 8 -w '\\n__HTTP_%{http_code}__' '" + sources[i].url + "')")
      lines.push("printf '%s\\n' \"$body\"")
      lines.push("if printf '%s' \"$body\" | grep -q '" + sources[i].check + "'; then exit 0; fi")
    }
    return lines.join("\n")
  }

  function chartBlocks(raw) {
    var out = []
    var chunks = String(raw || "").split("@@SRC:")
    for (var i = 0; i < chunks.length; i++) {
      var end = chunks[i].indexOf("@@")
      if (end === -1) continue
      out.push({ source: chunks[i].slice(0, end), body: chunks[i].slice(end + 2) })
    }
    return out
  }

  function laneCStart(force) {
    if (cInFlight) {
      // A range switch must never be dropped. The request in flight belongs to
      // the range the user just left, so its result is thrown away on arrival;
      // returning here without a note used to leave the chart on the old range
      // until the ten minute timer came round.
      if (chartReqRange !== chartRange || chartReqCurrency !== currency) cPending = true
      return
    }
    if (!force && Date.now() < cCooldownUntil) return
    cPending = false
    cInFlight = true
    chartReqRange = chartRange
    chartReqCurrency = currency
    fetchChart.command = ["bash", "-lc", chartScript()]
    fetchChart.running = true
  }

  // Serves a range or currency switch that landed while a request was running.
  // Deferred because the fetch process is still exiting when this is called.
  function laneCRestartIfPending() {
    if (!cPending) return
    cPending = false
    Qt.callLater(function() { root.laneCStart(true) })
  }

  function onChartDone() {
    cInFlight = false
    var raw = chartRaw
    chartRaw = ""
    if (chartReqRange !== chartRange || chartReqCurrency !== currency) {
      if (stateReady) saveState()
      laneCRestartIfPending()
      return
    }
    var blocks = chartBlocks(raw)
    var fresh = []
    var source = ""
    for (var i = 0; i < blocks.length; i++) {
      var r = splitStatus(blocks[i].body)
      // A mirror that was never needed (or was blocked) is skipped, not fatal.
      if (r.status !== 200) continue
      var series = blocks[i].source === "coingecko"
        ? Model.seriesFromCoingecko(parseJson(r.body))
        : Model.fallbackChartSeries(blocks[i].source, chartReqRange, parseJson(r.body))
      if (!series || series.length < 2) continue
      fresh = series
      source = blocks[i].source
      break
    }
    if (fresh.length < 2 && spot > 0) {
      // No source answered. Fall back to the chart already on screen with the
      // live spot appended, so the line still ends at the current price.
      fresh = Model.mergeSeriesWithSpot(chartSeries, spot, Math.floor(Date.now() / 1000))
      if (fresh.length >= 2) {
        chartSeries = Model.downsampleSeries(fresh, 160)
        if (stateReady) saveState()
        laneCRestartIfPending()
        return
      }
    }
    if (fresh.length < 2) {
      // Nothing usable from any source: stop asking for five minutes rather
      // than hammering the APIs. A switch that is still waiting is let through
      // anyway, because laneCRestartIfPending forces the next request.
      cCooldownUntil = Date.now() + 300000
      if (stateReady) saveState()
      laneCRestartIfPending()
      return
    }
    chartSeries = Model.downsampleSeries(fresh, 160)
    chartSource = source
    cCooldownUntil = 0
    if (stateReady) saveState()
    laneCRestartIfPending()
  }

  function laneDStart() {
    if (dInFlight) return
    dInFlight = true
    laneDPending = 3
    fetchHashrate.command = ["curl", "-fsS", "--max-time", "10", Model.MEMPOOL_HASHRATE_URL]
    fetchDifficulty.command = ["curl", "-fsS", "--max-time", "6", Model.MEMPOOL_DIFFICULTY_URL]
    fetchFng.command = ["curl", "-fsS", "--max-time", "6", Model.FEAR_GREED_URL]
    fetchHashrate.running = true
    fetchDifficulty.running = true
    fetchFng.running = true
  }

  function laneDDone() {
    laneDPending = Math.max(0, laneDPending - 1)
    if (laneDPending > 0) return
    dInFlight = false
    applyLaneD()
  }

  function applyLaneD() {
    if (hashrateRaw) {
      var parsed = Model.parseHashrate(parseJson(hashrateRaw))
      if (parsed) {
        hashrate = parsed.current
        if (parsed.timeAvgMs) difficultyTimeAvgMs = parsed.timeAvgMs
      }
    }
    if (difficultyRaw) {
      var d = Model.parseDifficultyAdjustment(parseJson(difficultyRaw))
      if (d) {
        difficultyChange = d.difficultyChange
        difficultyProgress = d.progressPercent
        difficultyEtaBlocks = d.remainingBlocks
        if (d.timeAvgMs !== null && d.timeAvgMs > 0) difficultyTimeAvgMs = d.timeAvgMs
      }
    }
    if (fngRaw) {
      var f = Model.parseFearGreed(parseJson(fngRaw))
      if (f) {
        fngValue = f.value
        fngClassification = f.classification
      }
    }
    if (stateReady) saveState()
  }

  // Lane E: RSS headlines (every 30 min). Feeds are plain XML, so a desktop
  // User-Agent is required — several return 403 to a bare curl. All feeds are
  // fetched in one batched shell command (total payload is ~160 KB / ~1 s) and
  // each body is wrapped in sentinel lines so the JS side can split them apart.
  readonly property string newsAgent: "Mozilla/5.0 (X11; Linux x86_64)"

  function newsScript() {
    var lines = []
    for (var i = 0; i < Model.RSS_FEEDS.length; i++) {
      var feed = Model.RSS_FEEDS[i]
      lines.push("printf '@@FEED:%s@@\\n' '" + feed.key + "'")
      lines.push("curl -sSL --max-time 12 -A '" + newsAgent + "' '" + feed.url + "'")
      lines.push("printf '\\n@@NEWSEND@@\\n'")
    }
    return lines.join("\n")
  }

  function laneEStart() {
    if (eInFlight) return
    eInFlight = true
    fetchNews.command = ["bash", "-lc", newsScript()]
    fetchNews.running = true
  }

  function newsFeedByKey(key) {
    for (var i = 0; i < Model.RSS_FEEDS.length; i++) {
      if (Model.RSS_FEEDS[i].key === key) return Model.RSS_FEEDS[i]
    }
    return null
  }

  function parseNewsBatch(raw) {
    var all = []
    var chunks = String(raw || "").split("@@NEWSEND@@")
    for (var i = 0; i < chunks.length; i++) {
      var found = /@@FEED:([a-z0-9]+)@@/.exec(chunks[i])
      if (!found) continue
      var feed = newsFeedByKey(found[1])
      if (!feed) continue
      var body = chunks[i].slice(found.index + found[0].length)
      var items = Model.parseRss(body, feed)
      for (var j = 0; j < items.length; j++) all.push(items[j])
    }
    return all
  }

  function applyLaneE() {
    eInFlight = false
    var selected = Model.selectRelevant(parseNewsBatch(newsRaw), Date.now())
    newsRaw = ""
    if (selected.length > 0) headlines = selected
    if (stateReady) saveState()
  }

  // Lane F: Kalshi terminal-distribution odds (every 30 min). One small JSON
  // request; the series rolls quarterly so the event isn't hardcoded.
  function laneFStart() {
    if (fInFlight) return
    fInFlight = true
    fetchKalshi.running = true
  }

  function applyLaneF() {
    fInFlight = false
    var odds = Model.parseKalshiRange(parseJson(kalshiRaw))
    if (odds) kalshiOdds = odds
    kalshiRaw = ""
  }

  // Lane G: Farside spot-ETF daily net flows (every 60 min). HTML, not an API,
  // and it 403s a bare curl — so a desktop User-Agent is required. The page is
  // ~270 KB; the parser keeps only the latest settled day. Flows are T+1, so
  // today's row is always pending and deliberately skipped.
  function laneGStart() {
    if (gInFlight) return
    gInFlight = true
    fetchFarside.running = true
  }

  function applyLaneG() {
    gInFlight = false
    var flow = Model.parseFarsideFlows(farsideRaw)
    if (flow) etfFlow = flow
    farsideRaw = ""
    if (stateReady) saveState()
  }

  function toggleOnchain() {
    onchainExpanded = !onchainExpanded
  }

  function toggleAppearance() {
    saveSetting("barAppearance", appearance === "subtle" ? "full" : "subtle")
  }

function forceRefresh() {
    bCooldownUntil = 0
    cCooldownUntil = 0
    laneAStart()
    laneBStart(true)
    laneCStart(false)
    laneDStart()
    laneEStart()
    laneFStart()
    laneGStart()
  }

  // --- state persistence ----------------------------------------------------

  function saveState() {
    if (!stateReady) return
    if (!hasQuote && !stateFees && blockHeight <= 0) return
    var payload = {
      version: 2,
      currency: currency,
      chartRange: chartRange,
      ts: fetchedAt,
      spot: spot,
      changePct: isFinite(changePct) ? changePct : null,
      series: chartSeries,
      fees: stateFees,
      blockHeight: blockHeight,
      hashrate: hashrate,
      difficultyChange: difficultyChange,
      difficultyProgress: difficultyProgress,
      difficultyTimeAvgMs: difficultyTimeAvgMs,
      fngValue: fngValue,
      fngClassification: fngClassification,
      headlines: headlines,
      etfFlow: etfFlow,
      sources: sourcesText.length ? sourcesText.split(" · ") : []
    }
    stateFile.setText(JSON.stringify(payload) + "\n")
  }

  function loadState(raw) {
    if (hasQuote) return
    var parsed = Model.parseState(raw)
    if (!parsed) return
    var code = currency
    var price = parsed.prices[code]
    if (!isFinite(price) || price <= 0) {
      for (var key in parsed.prices) {
        if (parsed.prices.hasOwnProperty(key) && parsed.prices[key] > 0) {
          price = parsed.prices[key]
          break
        }
      }
    }
    if (!isFinite(price) || price <= 0) return
    spot = price
    fetchedAt = parsed.ts > 0 ? parsed.ts : 0
    changePct = isFinite(parsed.changes[code]) ? parsed.changes[code] : NaN
    chartSeries = Model.downsampleSeries(parsed.series, 160)
    stateFees = parsed.fees || stateFees
    blockHeight = parsed.blockHeight || 0
    hashrate = parsed.hashrate || 0
    difficultyChange = parsed.difficultyChange || 0
    difficultyProgress = parsed.difficultyProgress || 0
    difficultyTimeAvgMs = parsed.difficultyTimeAvgMs || 0
    fngValue = parsed.fngValue || 0
    fngClassification = parsed.fngClassification || ""
    if (parsed.etfFlow) etfFlow = parsed.etfFlow
    if (parsed.headlines && parsed.headlines.length) headlines = parsed.headlines
    sourcesText = parsed.sources && parsed.sources.length ? parsed.sources.join(" · ") : ""
    stale = Model.isStale(fetchedAt, Date.now(), refreshSec)
  }

  // --- panel interaction ----------------------------------------------------

  onOpenedChanged: {
    if (!opened) return
    if (clickBar) clickBar.hideTooltip(root)
    cursorIndex = rangeKeys.indexOf(chartRange)
    if (cursorIndex < 0) cursorIndex = 0
    focusSection = "ranges"
    onchainExpanded = false
    cursorActive = true
    Qt.callLater(function() { if (root.opened) keyCatcher.forceActiveFocus() })
  }

  function selectRange(key) {
    var normalized = Model.normalizeRange(key)
    if (normalized === chartRange) return
    saveSetting("chartRange", normalized)
  }

  onChartRangeChanged: laneCStart(true)

  function moveCursor(dx, dy) {
    if (!cursorActive) return
    if (focusSection === "ranges") {
      if (dx !== 0) cursorIndex = wrap(cursorIndex + dx, 0, rangeKeys.length - 1)
      else if (dy !== 0) moveSection(dy > 0 ? 1 : -1)
    } else if (focusSection === "refresh" || focusSection === "appearance") {
      if (dx !== 0) focusSection = focusSection === "refresh" ? "appearance" : "refresh"
      else if (dy !== 0) moveSection(dy > 0 ? 1 : -1)
    } else if (focusSection === "onchain") {
      if (dx !== 0 || dy !== 0) moveSection((dx !== 0 ? dx : dy) > 0 ? 1 : -1)
    }
  }

  function moveSection(dir) {
    var sects = ["ranges", "refresh", "appearance", "onchain"]
    var i = sects.indexOf(focusSection)
    focusSection = sects[wrap(i + dir, 0, sects.length - 1)]
    cursorIndex = 0
  }

  function activateCursor() {
    if (!cursorActive || !opened) return
    if (focusSection === "ranges") selectRange(rangeKeys[cursorIndex])
    else if (focusSection === "refresh") forceRefresh()
    else if (focusSection === "appearance") toggleAppearance()
    else if (focusSection === "onchain") toggleOnchain()
  }

  function openPanel() {
    open()
  }

  // --- bar plumbing ----------------------------------------------------------

  property var clickBar: null

  onBarChanged: syncClickRegistration()
  Component.onDestruction: {
    if (clickBar && clickBar.unregisterClickTarget) clickBar.unregisterClickTarget(root)
    clickBar = null
  }

  function triggerPress(button) {
    if (clickBar) clickBar.hideTooltip(root)
    if (button === Qt.MiddleButton) {
      forceRefresh()
    } else {
      toggle()
    }
  }

  function syncClickRegistration() {
    if (clickBar && clickBar.unregisterClickTarget) clickBar.unregisterClickTarget(root)
    clickBar = root.bar
    if (clickBar && clickBar.registerClickTarget) clickBar.registerClickTarget(root)
  }

  onCurrencyChanged: {
    chartSeries = []
    spot = 0
    changePct = NaN
    stale = false
    laneAStart()
    laneBStart(true)
    laneCStart(true)
    laneDStart()
  }

  implicitWidth: visible
    ? (subtleBar
        ? badgeSize + contentPad * 2 + (gap + fullContentWidth) * revealT
        : fullContentWidth + contentPad * 2)
    : 0
  implicitHeight: barSize
  opacity: dimmed ? 0.55 : 1.0

  Behavior on revealT {
    NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
  }

  Behavior on opacity {
    NumberAnimation { duration: 160; easing.type: Easing.OutCubic }
  }

  Component.onCompleted: {
    ensureDirs.running = true
  }

  Process {
    id: ensureDirs
    command: ["mkdir", "-p", root.stateDir]
    onExited: stateFile.reload()
  }

  FileView {
    id: stateFile
    path: root.statePath
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: {
      root.stateReady = true
      root.loadState(text())
    }
    onLoadFailed: {
      root.stateReady = true
      root.loadState("")
    }
  }

  // Lane A: mempool prices + block height + fees (every refreshIntervalSec).
  Process {
    id: fetchPrices
    command: ["curl", "-fsS", "--max-time", "6", Model.MEMPOOL_PRICES_URL]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.pricesRaw = String(text || "")
    }
    onExited: root.laneADone()
  }

  Process {
    id: fetchHeight
    command: ["curl", "-fsS", "--max-time", "6", Model.MEMPOOL_HEIGHT_URL]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.heightRaw = String(text || "")
    }
    onExited: root.laneADone()
  }

  Process {
    id: fetchFees
    command: ["curl", "-fsS", "--max-time", "6", Model.MEMPOOL_FEES_URL]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.feesRaw = String(text || "")
    }
    onExited: root.laneADone()
  }

  // Lane B: coingecko simple price with market cap + volume (every 10 min).
  Process {
    id: fetchGlobal
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.globalRaw = String(text || "")
    }
    onExited: root.onGlobalDone()
  }

  // Lane C: coingecko chart for the active range (every 10 min + on change).
  Process {
    id: fetchChart
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.chartRaw = String(text || "")
    }
    onExited: root.onChartDone()
  }

  // Lane D: hashrate + difficulty adjustment + fear & greed (every 15 min).
  Process {
    id: fetchHashrate
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.hashrateRaw = String(text || "")
    }
    onExited: root.laneDDone()
  }

  Process {
    id: fetchDifficulty
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.difficultyRaw = String(text || "")
    }
    onExited: root.laneDDone()
  }

  Process {
    id: fetchFng
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.fngRaw = String(text || "")
    }
    onExited: root.laneDDone()
  }

  // Lane E: RSS feeds, all fetched in one batched shell process.
  Process {
    id: fetchNews
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.newsRaw = String(text || "")
    }
    onExited: root.applyLaneE()
  }

  // Lane F: Kalshi odds (single small JSON request).
  Process {
    id: fetchKalshi
    command: ["curl", "-sSL", "--max-time", "12", "-A", "Mozilla/5.0 (X11; Linux x86_64)", Model.KALSHI_EOY_URL]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.kalshiRaw = String(text || "")
    }
    onExited: root.applyLaneF()
  }

  // Lane G: Farside ETF flow table (HTML scrape; needs a desktop User-Agent).
  Process {
    id: fetchFarside
    command: ["curl", "-sSL", "--max-time", "15", "-A", "Mozilla/5.0 (X11; Linux x86_64)", Model.FARSIDE_BTC_URL]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.farsideRaw = String(text || "")
    }
    onExited: root.applyLaneG()
  }

  Timer {
    id: laneATimer
    interval: Math.max(30, root.refreshSec) * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneAStart()
  }

  Timer {
    id: laneBTimer
    interval: 600000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneBStart(false)
  }

  Timer {
    id: laneCTimer
    interval: 600000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneCStart(false)
  }

  Timer {
    id: laneDTimer
    interval: 900000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneDStart()
  }

  Timer {
    id: laneETimer
    interval: 1800000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneEStart()
  }

  Timer {
    id: laneFTimer
    interval: 1800000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneFStart()
  }

  Timer {
    id: laneGTimer
    interval: 3600000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.laneGStart()
  }

  Item {
    id: content
    anchors.fill: parent
    anchors.leftMargin: root.contentPad
    anchors.rightMargin: root.contentPad
    clip: root.subtleBar

    Text {
      id: badge
      visible: root.subtleBar
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      width: root.badgeSize
      horizontalAlignment: Text.AlignHCenter
      text: "₿"
      color: root.neutralColor
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.body + 2
      font.weight: Font.Bold
      renderType: Text.NativeRendering
    }

    Text {
      id: priceLabel
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: parent.left
      anchors.leftMargin: root.subtleBar ? root.badgeSize + root.gap : 0
      text: root.priceText
      color: root.priceColor
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.body
      font.weight: Font.DemiBold
      renderType: Text.NativeRendering
    }

    Text {
      id: changeLabel
      visible: root.showChangeText
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: priceLabel.right
      anchors.leftMargin: root.gap
      text: root.changeText
      color: root.sparkColor
      font.family: root.bar ? root.bar.fontFamily : Style.font.family
      font.pixelSize: Style.font.bodySmall
      renderType: Text.NativeRendering
    }

    Canvas {
      id: spark
      visible: root.showSpark
      width: root.sparkWidth
      height: root.sparkHeight
      anchors.verticalCenter: parent.verticalCenter
      anchors.left: changeLabel.visible ? changeLabel.right : priceLabel.right
      anchors.leftMargin: root.gap

      onPaint: {
        var ctx = getContext("2d")
        ctx.reset()
        var coords = Model.sparklineGeometry(root.series, width, height)
        if (coords.length < 2) return
        var color = root.sparkLineColor
        var i

        ctx.beginPath()
        ctx.moveTo(coords[0].x, coords[0].y)
        for (i = 1; i < coords.length; i++) ctx.lineTo(coords[i].x, coords[i].y)
        ctx.lineTo(coords[coords.length - 1].x, height)
        ctx.lineTo(coords[0].x, height)
        ctx.closePath()
        ctx.fillStyle = color
        ctx.globalAlpha = 0.18
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.beginPath()
        ctx.moveTo(coords[0].x, coords[0].y)
        for (i = 1; i < coords.length; i++) ctx.lineTo(coords[i].x, coords[i].y)
        ctx.strokeStyle = color
        ctx.lineWidth = 1.25
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.stroke()
      }

      onWidthChanged: requestPaint()
      onHeightChanged: requestPaint()
    }

    Connections {
      target: root
      function onSeriesChanged() { spark.requestPaint() }
      function onSparkColorChanged() { spark.requestPaint() }
      function onShowSparkChanged() { if (root.showSpark) spark.requestPaint() }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: content
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(panelContent.implicitHeight, Style.space(760))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: root.moveCursor(dx, dy)
      onActivateRequested: root.activateCursor()
      onCloseRequested: root.close()
      onTextKey: function(t) { if (t === "r") root.forceRefresh() }

      PanelContent {
        id: panelContent
        anchors.fill: parent
        widget: root
      }
    }
  }

  MouseArea {
    id: hoverArea
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.triggerPress(mouse.button)
    onEntered: if (root.bar && !root.opened && !root.subtleBar) root.bar.showTooltip(root, root.tooltipText)
    onExited: if (root.bar) root.bar.hideTooltip(root)
  }
}