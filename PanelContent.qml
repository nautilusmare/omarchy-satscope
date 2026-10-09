import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Flickable {
  id: panel

  property QtObject widget: null

  readonly property color fg: widget && widget.bar ? widget.bar.barForeground : Color.foreground
  readonly property color accent: fg
  readonly property string fontFamily: widget && widget.bar ? widget.bar.fontFamily : Style.font.family
  readonly property string sym: widget ? Model.currencySymbol(widget.currency) : "$"
  readonly property color up: Model.UP_COLOR
  readonly property color down: Model.DOWN_COLOR

  readonly property bool rangesFocused: widget && widget.focusSection === "ranges"
  readonly property bool refreshFocused: widget && widget.focusSection === "refresh"
  readonly property bool appearanceFocused: widget && widget.focusSection === "appearance"
  readonly property bool onchainFocused: widget && widget.focusSection === "onchain"
  readonly property bool subtleMode: widget ? widget.subtleBar : false
  readonly property int cursor: widget ? widget.cursorIndex : 0

  readonly property bool onchainExpanded: widget ? widget.onchainExpanded : false

  readonly property var odds: widget ? widget.kalshiOdds : null
  readonly property bool oddsReady: odds !== null && odds.median > 0
  readonly property string oddsHorizon: odds ? Model.kalshiHorizonLabel(odds.eventTicker) : ""
  readonly property string oddsMedianText: (odds && odds.median > 0)
    ? sym + Model.formatCompact(odds.median) : "—"
  readonly property real oddsMovePct: Model.medianPremiumPct(widget ? widget.spot : 0, odds ? odds.median : 0)
  readonly property string oddsMoveText: oddsMovePct === null
    ? "" : (oddsMovePct >= 0 ? "+" : "") + oddsMovePct.toFixed(1) + "%"
  readonly property color oddsMoveColor: (oddsMovePct !== null && oddsMovePct >= 0) ? up : down
  readonly property string oddsRangeText: (odds && odds.p25 > 0 && odds.p75 > 0)
    ? sym + Model.formatCompact(odds.p25) + " – " + sym + Model.formatCompact(odds.p75) : ""
  readonly property string oddsUpsideText: (odds && odds.p90 > 0)
    ? sym + Model.formatCompact(odds.p90) : ""

  readonly property var etfFlow: widget ? widget.etfFlow : null
  readonly property bool etfReady: etfFlow !== null
  readonly property string etfFlowText: etfFlow ? Model.formatFlowUsd(etfFlow.total) : ""
  readonly property color etfFlowColor: (etfFlow && etfFlow.total < 0)
    ? down : (etfFlow && etfFlow.total > 0 ? up : fg)
  readonly property string etfDateText: etfFlow && etfFlow.shortDate ? etfFlow.shortDate : ""

  readonly property var minMax: {
    var s = widget ? widget.chartSeries : []
    var lo = -1, hi = -1
    for (var i = 0; i < s.length; i++) {
      var p = Number(s[i].price)
      if (!isFinite(p)) continue
      if (lo < 0 || p < lo) lo = p
      if (hi < 0 || p > hi) hi = p
    }
    return lo > 0 && hi > 0 ? [lo, hi] : [0, 0]
  }
  readonly property double minPx: minMax[0]
  readonly property double maxPx: minMax[1]

  readonly property string firstClock: {
    var s = widget ? widget.chartSeries : []
    if (s.length < 1) return ""
    var ts = Number(s[0].ts)
    if (!isFinite(ts) || ts <= 0) return ""
    if (ts > 1e12) ts = Math.floor(ts / 1000)
    return Model.formatClock(ts)
  }

  readonly property string marketCapText: (widget && widget.marketCaps[widget.currency] > 0)
    ? sym + Model.formatCompact(widget.marketCaps[widget.currency]) : "—"
  readonly property string volumeText: (widget && widget.volumes[widget.currency] > 0)
    ? sym + Model.formatCompact(widget.volumes[widget.currency]) : "—"

  readonly property string halvingText: {
    if (!widget || widget.blockHeight <= 0) return "—"
    var info = Model.halvingInfo(widget.blockHeight, widget.difficultyTimeAvgMs)
    if (!info) return "—"
    return Model.formatNumber(info.blocksLeft, 0) + " blocks ~" + Model.formatDuration(info.etaMs)
  }
  readonly property string difficultyText: {
    if (!widget || widget.blockHeight <= 0) return "—"
    var parts = []
    if (widget.difficultyChange !== 0) parts.push(Model.formatChangeCompact(widget.difficultyChange))
    if (widget.difficultyProgress > 0) parts.push(widget.difficultyProgress.toFixed(1) + "%")
    if (widget.difficultyEtaBlocks > 0) parts.push(widget.difficultyEtaBlocks + " bl")
    return parts.length ? parts.join(" ") : "—"
  }

  readonly property var feeRows: [
    { "label": "No priority", "value": widget && widget.stateFees ? widget.stateFees.none : -1 },
    { "label": "Low", "value": widget && widget.stateFees ? widget.stateFees.low : -1 },
    { "label": "Mid", "value": widget && widget.stateFees ? widget.stateFees.mid : -1 },
    { "label": "High", "value": widget && widget.stateFees ? widget.stateFees.high : -1 }
  ]
  readonly property var onchainRows: [
    { "label": "Block height", "value": widget && widget.blockHeight > 0 ? Model.formatNumber(widget.blockHeight, 0) : "—" },
    { "label": "Next halving", "value": halvingText },
    { "label": "Difficulty", "value": difficultyText },
    { "label": "Hashrate", "value": widget && widget.hashrate > 0 ? Model.formatHashrate(widget.hashrate) : "—" }
  ]

  readonly property var newsItems: {
    var h = widget ? widget.headlines : []
    var now = Date.now()
    var out = []
    for (var i = 0; i < h.length && i < Model.NEWS_SHOWN; i++) {
      out.push({
        "title": h[i].title,
        "source": h[i].source,
        "link": h[i].link,
        "age": Model.headlineAge(h[i].publishedMs, now)
      })
    }
    return out
  }

  contentWidth: width
  contentHeight: col.implicitHeight
  implicitWidth: col.implicitWidth
  implicitHeight: col.implicitHeight
  clip: true
  boundsBehavior: Flickable.StopAtBounds
  flickableDirection: Flickable.VerticalFlick
  interactive: contentHeight > height

  component SectionTitle: PanelSectionHeader {
    width: panel.width
    foreground: panel.fg
    fontFamily: panel.fontFamily
  }

  component SectionHeaderToggle: Item {
    id: headerToggle
    property string title: ""
    property bool expanded: false
    property bool focused: false
    width: panel.width
    height: 26

    CursorSurface {
      anchors.fill: parent
      anchors.leftMargin: 2
      anchors.rightMargin: 2
      radius: 4
      hasCursor: headerToggle.focused
      current: headerToggle.expanded
      foreground: panel.fg
      accent: panel.accent
    }
    Rectangle {
      anchors.fill: parent
      anchors.leftMargin: 2
      anchors.rightMargin: 2
      radius: 4
      color: headerHover.containsMouse && !headerToggle.focused
        ? Util.alpha(panel.fg, 0.06) : "transparent"
      Behavior on color {
        ColorAnimation { duration: 60 }
      }
    }
    Rectangle {
      anchors.left: parent.left
      anchors.leftMargin: 2
      anchors.verticalCenter: parent.verticalCenter
      width: 3
      height: 14
      radius: 1.5
      color: headerToggle.focused
        ? panel.accent
        : Util.alpha(panel.fg, headerToggle.expanded ? 0.35 : 0.18)
      Behavior on color {
        ColorAnimation { duration: 60 }
      }
    }
    PanelSectionHeader {
      anchors.left: parent.left
      anchors.leftMargin: 9
      anchors.verticalCenter: parent.verticalCenter
      foreground: headerToggle.focused ? panel.accent : panel.fg
      fontFamily: panel.fontFamily
      text: headerToggle.title
    }
    Rectangle {
      anchors.right: parent.right
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      width: 18
      height: 18
      radius: 4
      color: Util.alpha(panel.fg, (headerToggle.focused || headerHover.containsMouse) ? 0.16 : 0.08)
      Behavior on color {
        ColorAnimation { duration: 60 }
      }
      Text {
        anchors.centerIn: parent
        text: headerToggle.expanded ? "▾" : "▸"
        color: (headerToggle.focused || headerHover.containsMouse)
          ? panel.accent
          : Util.alpha(panel.fg, 0.75)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.Bold
      }
    }
    MouseArea {
      id: headerHover
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: if (widget) widget.toggleOnchain()
    }
  }

  component KVRow: Item {
    property string label: ""
    property string value: ""
    property color valueColor: panel.fg
    property string deltaText: ""
    property color deltaColor: panel.fg
    width: panel.width
    height: 20
    Text {
      anchors.left: parent.left
      anchors.leftMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      text: parent.label
      color: Util.alpha(panel.fg, 0.6)
      font.family: panel.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
    Text {
      id: deltaValue
      visible: parent.deltaText.length > 0
      anchors.right: parent.right
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      text: parent.deltaText
      color: parent.deltaColor
      font.family: panel.fontFamily
      font.pixelSize: Style.font.bodySmall
      font.weight: Font.DemiBold
    }
    Text {
      anchors.right: deltaValue.visible ? deltaValue.left : parent.right
      anchors.rightMargin: deltaValue.visible ? 6 : 4
      anchors.verticalCenter: parent.verticalCenter
      text: parent.value
      color: parent.valueColor
      font.family: panel.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }

  component NewsRow: Item {
    id: newsRow
    property string title: ""
    property string source: ""
    property string age: ""
    property string link: ""
    width: panel.width
    height: 22

    readonly property real overflow: Math.max(0, newsTitle.implicitWidth - newsViewport.width)

    Rectangle {
      anchors.fill: parent
      anchors.leftMargin: 2
      anchors.rightMargin: 2
      radius: 4
      color: newsHover.containsMouse ? Util.alpha(panel.fg, 0.08) : "transparent"
    }

    Item {
      id: newsViewport
      anchors.left: parent.left
      anchors.leftMargin: 4
      anchors.right: meta.left
      anchors.rightMargin: 8
      anchors.verticalCenter: parent.verticalCenter
      height: parent.height
      clip: true

      Text {
        id: newsTitle
        anchors.verticalCenter: parent.verticalCenter
        x: 0
        text: newsRow.title
        color: newsRow.link.length ? panel.fg : Util.alpha(panel.fg, 0.8)
        elide: Text.ElideNone
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
    }

    SequentialAnimation {
      id: marquee
      loops: Animation.Infinite
      PauseAnimation { duration: 450 }
      PropertyAnimation {
        target: newsTitle
        property: "x"
        to: -newsRow.overflow
        duration: Math.max(1400, newsRow.overflow * 35)
        easing.type: Easing.InOutSine
      }
      PauseAnimation { duration: 700 }
      PropertyAnimation {
        target: newsTitle
        property: "x"
        to: 0
        duration: Math.max(1400, newsRow.overflow * 35)
        easing.type: Easing.InOutSine
      }
      PauseAnimation { duration: 300 }
    }

    Text {
      id: meta
      anchors.right: parent.right
      anchors.rightMargin: 4
      anchors.verticalCenter: parent.verticalCenter
      text: newsRow.age.length ? newsRow.source + " · " + newsRow.age : newsRow.source
      color: Util.alpha(panel.fg, 0.45)
      font.family: panel.fontFamily
      font.pixelSize: Style.font.caption
    }

    MouseArea {
      id: newsHover
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: newsRow.link.length ? Qt.PointingHandCursor : Qt.ArrowCursor
      onClicked: if (newsRow.link.length) Util.execArgv(["xdg-open", newsRow.link])
      onEntered: {
        if (newsRow.overflow > 0) {
          newsTitle.x = 0
          marquee.start()
        }
      }
      onExited: {
        marquee.stop()
        newsTitle.x = 0
      }
    }
  }

  Column {
    id: col
    width: panel.width
    spacing: 6

    Item {
      width: parent.width
      height: 24

      Text {
        id: priceHead
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: "Bitcoin"
        color: panel.fg
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.DemiBold
      }

      Rectangle {
        id: changePill
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: priceHead.right
        anchors.leftMargin: 8
        visible: widget && widget.hasQuote && isFinite(widget.changePct)
        width: changePillText.implicitWidth + 12
        height: 18
        radius: 9
        color: Util.alpha(widget && widget.changePct >= 0 ? panel.up : panel.down, 0.18)
        Text {
          id: changePillText
          anchors.centerIn: parent
          text: widget && isFinite(widget.changePct) ? Model.formatChangeCompact(widget.changePct) : ""
          color: widget && widget.changePct >= 0 ? panel.up : panel.down
          font.family: panel.fontFamily
          font.pixelSize: Style.font.caption
          font.weight: Font.DemiBold
        }
      }

      Item {
        id: refreshChip
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: 24
        height: 24
        Rectangle {
          anchors.fill: parent
          radius: 6
          color: Util.alpha(panel.fg, 0.07)
        }
        CursorSurface {
          anchors.fill: parent
          radius: 6
          hasCursor: panel.refreshFocused
          foreground: panel.fg
          accent: panel.accent
        }
        Text {
          anchors.centerIn: parent
          text: "↻"
          color: panel.refreshFocused ? panel.accent : panel.fg
          font.family: panel.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        MouseArea {
          anchors.fill: parent
          cursorShape: Qt.PointingHandCursor
          onClicked: if (widget) widget.forceRefresh()
        }
      }

      Item {
        id: appearanceChip
        anchors.right: refreshChip.left
        anchors.rightMargin: 6
        anchors.verticalCenter: parent.verticalCenter
        width: 30
        height: 16

        Rectangle {
          id: appearanceTrack
          anchors.fill: parent
          radius: height / 2
          color: panel.subtleMode ? Util.alpha(panel.accent, 0.30) : Util.alpha(panel.fg, 0.12)
          border.width: panel.appearanceFocused ? 1 : 0
          border.color: panel.accent
        }
        Rectangle {
          id: appearanceKnob
          width: 12
          height: 12
          radius: 6
          anchors.verticalCenter: parent.verticalCenter
          x: panel.subtleMode ? appearanceTrack.width - width - 2 : 2
          color: panel.subtleMode ? panel.accent : Util.alpha(panel.fg, 0.75)
          Behavior on x {
            NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
          }
        }
        MouseArea {
          id: appearanceHover
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: if (widget) widget.toggleAppearance()
        }
        PanelToolTip {
          visible: appearanceHover.containsMouse
          text: panel.subtleMode
            ? "Bar style: ₿ badge — hover for price and chart"
            : "Bar style: full price and chart — turn on for just the ₿ badge"
          fontFamily: panel.fontFamily
        }
      }
    }

    Text {
      width: parent.width
      text: widget && widget.hasQuote ? Model.formatPrice(widget.spot, widget.currency) : "—"
      color: panel.fg
      font.family: panel.fontFamily
      font.pixelSize: Style.font.display
      font.weight: Font.Bold
    }

    Row {
      id: rangeRow
      spacing: 4

      Repeater {
        model: widget ? widget.rangeKeys : []

        delegate: Rectangle {
          required property string modelData
          required property int index
          property bool active: widget && widget.chartRange === modelData
          property bool cursored: panel.rangesFocused && panel.cursor === index

          width: rangeLabel.implicitWidth + 18
          height: 22
          radius: 6
          border.width: cursored ? 1 : 0
          border.color: panel.accent
          color: active ? Util.alpha(panel.accent, 0.30) : Util.alpha(panel.fg, 0.07)

          Text {
            id: rangeLabel
            anchors.centerIn: parent
            text: modelData
            color: active ? panel.fg : Util.alpha(panel.fg, 0.75)
            font.family: panel.fontFamily
            font.pixelSize: Style.font.bodySmall
            font.weight: active ? Font.DemiBold : Font.Normal
          }

          MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: if (widget) widget.selectRange(modelData)
          }
        }
      }
    }

    Item {
      width: parent.width
      height: 112

      Canvas {
        id: chart
        anchors.fill: parent

        onPaint: function() {
          var ctx = getContext("2d")
          ctx.reset()
          var series = widget ? widget.chartSeries : []
          if (!series || series.length < 2) return

          var lo = panel.minPx
          var hi = panel.maxPx
          if (hi <= lo) return

          ctx.strokeStyle = Util.alpha(panel.fg, 0.12)
          ctx.lineWidth = 1
          var fracs = [0, 0.5, 1]
          for (var f = 0; f < fracs.length; f++) {
            var y = height - fracs[f] * height
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
          }

          var coords = Model.sparklineGeometry(widget.chartSeries, width, height)
          var lineColor = widget.sparkColor ? widget.sparkColor : panel.down

          ctx.beginPath()
          ctx.moveTo(coords[0].x, coords[0].y)
          for (var i2 = 1; i2 < coords.length; i2++) ctx.lineTo(coords[i2].x, coords[i2].y)
          ctx.lineTo(coords[coords.length - 1].x, height)
          ctx.lineTo(coords[0].x, height)
          ctx.closePath()
          ctx.fillStyle = lineColor
          ctx.globalAlpha = 0.18
          ctx.fill()
          ctx.globalAlpha = 1

          ctx.beginPath()
          ctx.moveTo(coords[0].x, coords[0].y)
          for (var j = 1; j < coords.length; j++) ctx.lineTo(coords[j].x, coords[j].y)
          ctx.strokeStyle = lineColor
          ctx.lineWidth = 1.5
          ctx.lineJoin = "round"
          ctx.lineCap = "round"
          ctx.stroke()
          ctx.globalAlpha = 1
        }

        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
      }

      Connections {
        target: widget
        function onChartSeriesChanged() { chart.requestPaint() }
        function onChartRangeChanged() { chart.requestPaint() }
        function onCurrencyChanged() { chart.requestPaint() }
      }

      Text {
        visible: !widget || widget.chartSeries.length < 2
        anchors.centerIn: parent
        text: "No chart data"
        color: Util.alpha(panel.fg, 0.4)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        anchors.left: parent.left
        anchors.top: parent.top
        text: panel.firstClock
        color: Util.alpha(panel.fg, 0.5)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        anchors.right: parent.right
        anchors.top: parent.top
        text: "now"
        color: Util.alpha(panel.fg, 0.5)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        text: panel.minPx > 0 ? panel.sym + Model.formatCompact(panel.minPx) : ""
        color: Util.alpha(panel.fg, 0.5)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.caption
      }
      Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        text: panel.maxPx > 0 ? panel.sym + Model.formatCompact(panel.maxPx) : ""
        color: Util.alpha(panel.fg, 0.5)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    SectionTitle { text: "Market" }

    Row {
      width: parent.width
      spacing: 28
      Column {
        spacing: 2
        Text {
          text: "Market cap"
          color: Util.alpha(panel.fg, 0.55)
          font.family: panel.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Text {
          text: panel.marketCapText
          color: panel.fg
          font.family: panel.fontFamily
          font.pixelSize: Style.font.body
          font.weight: Font.DemiBold
        }
      }
      Column {
        spacing: 2
        Text {
          text: "24h volume"
          color: Util.alpha(panel.fg, 0.55)
          font.family: panel.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Text {
          text: panel.volumeText
          color: panel.fg
          font.family: panel.fontFamily
          font.pixelSize: Style.font.body
          font.weight: Font.DemiBold
        }
      }
    }

    Item {
      id: onchainBlock
      width: parent.width
      height: onchainHeader.height + (widget && widget.onchainExpanded ? onchainBody.implicitHeight : 0)
      clip: true

      Behavior on height {
        NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
      }

      SectionHeaderToggle {
        id: onchainHeader
        title: "On-chain"
        expanded: widget && widget.onchainExpanded
        focused: panel.onchainFocused
      }

      Column {
        id: onchainBody
        width: parent.width
        anchors.top: onchainHeader.bottom
        spacing: 2

        Repeater {
          model: panel.feeRows
          delegate: KVRow {
            required property var modelData
            label: modelData.label + " fee"
            value: modelData.value >= 0 ? modelData.value + " sat/vB" : "—"
          }
        }

        Repeater {
          model: panel.onchainRows
          delegate: KVRow {
            required property var modelData
            label: modelData.label
            value: modelData.value
          }
        }
      }
    }

    SectionTitle { text: "Sentiment" }

    Item {
      id: fngRow
      width: parent.width
      height: 16

      readonly property bool hasValue: widget && widget.fngValue > 0
      readonly property int value: hasValue ? Math.max(0, Math.min(100, widget.fngValue)) : 0

      Rectangle {
        id: fngTrack
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - 80
        height: 6
        radius: 3

        gradient: Gradient {
          orientation: Gradient.Horizontal
          GradientStop { position: 0.00; color: Model.FNG_EXTREME_FEAR }
          GradientStop { position: 0.25; color: Model.FNG_FEAR }
          GradientStop { position: 0.50; color: Model.FNG_NEUTRAL }
          GradientStop { position: 0.75; color: Model.FNG_GREED }
          GradientStop { position: 1.00; color: Model.FNG_EXTREME_GREED }
        }

        Rectangle {
          id: fngDot
          visible: fngRow.hasValue
          width: 9
          height: 9
          radius: 4.5
          y: (fngTrack.height - height) / 2
          x: Math.max(0, Math.min(fngTrack.width - width, (fngTrack.width - width) * fngRow.value / 100))
          color: panel.fg
          border.width: 1
          border.color: Color.background

          Behavior on x {
            NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
          }
        }
      }

      Text {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: 74
        text: fngRow.hasValue
          ? widget.fngValue + " " + widget.fngClassification
          : "—"
        color: Model.fearGreedColor(widget ? widget.fngValue : 0)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
        font.weight: Font.DemiBold
        horizontalAlignment: Text.AlignRight
        elide: Text.ElideRight
      }
    }

    Item {
      id: oddsBlock
      width: parent.width
      height: panel.oddsReady ? oddsCol.implicitHeight : 0
      visible: panel.oddsReady
      clip: true

      Column {
        id: oddsCol
        width: parent.width
        spacing: 2

        Item {
          width: parent.width
          height: oddsCaption.height
          Text {
            id: oddsCaption
            anchors.left: parent.left
            topPadding: 2
            text: "Market odds" + (panel.oddsHorizon.length ? " · " + panel.oddsHorizon : "")
            color: Util.alpha(panel.fg, 0.5)
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.weight: Font.DemiBold
          }
          Text {
            anchors.right: parent.right
            topPadding: 2
            text: "Kalshi"
            color: Util.alpha(panel.fg, 0.5)
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.weight: Font.DemiBold
          }
        }

        KVRow {
          label: "Implied median"
          value: panel.oddsMedianText
          deltaText: panel.oddsMoveText
          deltaColor: panel.oddsMoveColor
        }

        KVRow {
          visible: panel.oddsRangeText.length > 0
          label: "50% range"
          value: panel.oddsRangeText
        }

        KVRow {
          visible: panel.oddsUpsideText.length > 0
          label: "Upside (10% chance)"
          value: panel.oddsUpsideText
        }
      }
    }

    Item {
      id: etfBlock
      width: parent.width
      height: panel.etfReady ? etfCol.implicitHeight : 0
      visible: panel.etfReady
      clip: true

      Column {
        id: etfCol
        width: parent.width
        spacing: 2

        Item {
          width: parent.width
          height: etfCaption.height
          Text {
            id: etfCaption
            anchors.left: parent.left
            topPadding: 2
            text: "ETF flows" + (panel.etfDateText.length ? " · " + panel.etfDateText : "")
            color: Util.alpha(panel.fg, 0.5)
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.weight: Font.DemiBold
          }
          Text {
            anchors.right: parent.right
            topPadding: 2
            text: "Farside"
            color: Util.alpha(panel.fg, 0.5)
            font.family: panel.fontFamily
            font.pixelSize: Style.font.caption
            font.weight: Font.DemiBold
          }
        }

        KVRow {
          label: "Net flow"
          value: panel.etfFlowText
          valueColor: panel.etfFlowColor
        }
      }
    }

    SectionTitle { text: "News" }

    Repeater {
      model: panel.newsItems
      delegate: NewsRow {
        required property var modelData
        title: modelData.title
        source: modelData.source
        age: modelData.age
        link: modelData.link
      }
    }

    Item {
      width: parent.width
      height: 20
      visible: !widget || widget.headlines.length === 0
      Text {
        anchors.left: parent.left
        anchors.leftMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        text: "No price-relevant news yet"
        color: Util.alpha(panel.fg, 0.4)
        font.family: panel.fontFamily
        font.pixelSize: Style.font.bodySmall
      }
    }
  }
}