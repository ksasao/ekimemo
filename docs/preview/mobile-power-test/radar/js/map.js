// マップ管理

const STATION_POPUP_CONTAINER_STYLE = 'font-family: system-ui, sans-serif; min-width: 150px;';
const STATION_POPUP_TITLE_STYLE = 'font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #222;';
const STATION_POPUP_KANA_STYLE = 'font-size: 13px; color: #666; margin-bottom: 6px;';
const STATION_POPUP_PREFECTURE_STYLE = 'font-size: 13px; color: #444; border-top: 1px solid #ddd; padding-top: 4px; margin-bottom: 4px;';
const STATION_POPUP_SELECTED_STYLE = 'font-size: 12px; color: #888; margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;';
const STATION_POPUP_ACTION_WRAPPER_STYLE = 'margin-top: 8px;';
const STATION_POPUP_ACTION_STYLE = [
  'display: inline-block',
  'padding: 6px 12px',
  'background: linear-gradient(135deg, #2f80ff 0%, #175ddc 100%)',
  'color: white',
  'text-decoration: none',
  'border-radius: 6px',
  'font-size: 13px',
  'font-weight: 600',
  'text-align: center',
  'box-shadow: 0 2px 4px rgba(23, 93, 220, 0.3)',
  'transition: transform 0.1s ease, box-shadow 0.1s ease'
].join('; ');
const STATION_LABEL_BASE_STYLE = [
  'width: 200px',
  'margin-top: 8px',
  'font-size: 16px',
  'font-weight: 700',
  'text-align: center',
  'text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
  'white-space: nowrap'
].join('; ');

class MapManager {
  constructor(stationManager, uiManager) {
    this.stationManager = stationManager;
    this.uiManager = uiManager;
    this.map = null;
    this.overlayLayer = null;
    this.stationDotsLayer = null;
    this.stationMarker = null;
    this.stationMarkerLabel = null;
    this.isUserInteracting = false;
    this.locationManager = null;
    this.mapMoveStartCenter = null;
    this.mapMoveStartZoom = null;
    this.mapInteractionHadSignificantMove = false;
    
    // デバウンス用タイマー
    this.searchPanTimer = null;
    this.mapRedrawTimer = null;
    this.paramRedrawTimer = null;
  }

  setLocationManager(locationManager) {
    this.locationManager = locationManager;
  }

  // マップを初期化
  initialize() {
    const isCoarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;

    this.map = L.map('map', {
      center: CONFIG.map.center,
      zoom: CONFIG.map.zoom,
      zoomControl: true,
      preferCanvas: isCoarsePointer,
      zoomDelta: 0.5,
      zoomSnap: 0.25,
    });

    L.tileLayer(CONFIG.map.tileUrl, {
      maxZoom: CONFIG.map.maxZoom,
      attribution: CONFIG.map.attribution,
    }).addTo(this.map);

    // スケール（距離目盛り）を右下に追加
    L.control.scale({
      position: 'bottomright',
      metric: true,
      imperial: false,
      maxWidth: 150
    }).addTo(this.map);

    // グリッド描画用の pane
    this.map.createPane('gridPane');
    this.map.getPane('gridPane').style.zIndex = CONFIG.zIndex.grid;
    this.map.getPane('gridPane').style.pointerEvents = 'none';

    // ボロノイ図用の pane
    this.map.createPane('voronoiPane');
    this.map.getPane('voronoiPane').style.zIndex = CONFIG.zIndex.voronoi;
    this.map.getPane('voronoiPane').style.pointerEvents = 'none';

    // 駅ドット用 pane
    this.map.createPane('stationDotsPane');
    this.map.getPane('stationDotsPane').style.zIndex = CONFIG.zIndex.stationDots;
    
    // 駅マーカー用 pane（最前面）
    this.map.createPane('stationPane');
    this.map.getPane('stationPane').style.zIndex = CONFIG.zIndex.stationMarker;

    this.overlayLayer = L.layerGroup().addTo(this.map);
    this.stationDotsLayer = L.layerGroup().addTo(this.map);
    this.lastUserOpenedStationIndex = null;
    this.currentHighlightRanks = new Map();
    this.lastStationLabelOpenAt = 0;

    this.map.on('click', (event) => this.handleMapClick(event));

    return this.map;
  }

  // マップイベントリスナーを設定
  setupEventListeners(onMoveStart, onMoveEnd) {
    this.map.on('movestart zoomstart', () => {
      this.isUserInteracting = true;
      this.mapMoveStartCenter = this.map.getCenter();
      this.mapMoveStartZoom = this.map.getZoom();
      this.mapInteractionHadSignificantMove = false;
      if (this.searchPanTimer) {
        clearTimeout(this.searchPanTimer);
        this.searchPanTimer = null;
      }
      if (onMoveStart) onMoveStart();
    });

    this.map.on('move', () => {
      if (!this.isUserInteracting || !this.mapMoveStartCenter) {
        return;
      }

      const currentCenter = this.map.getCenter();
      const movedMeters = this.map.distance(this.mapMoveStartCenter, currentCenter);
      if (movedMeters > 15) {
        this.mapInteractionHadSignificantMove = true;
      }
    });

    this.map.on('moveend zoomend', () => {
      const currentZoom = this.map.getZoom();
      if (
        this.mapMoveStartZoom != null &&
        Number.isFinite(this.mapMoveStartZoom) &&
        currentZoom !== this.mapMoveStartZoom
      ) {
        this.mapInteractionHadSignificantMove = true;
      }

      if (this.mapInteractionHadSignificantMove) {
        this.lastUserOpenedStationIndex = null;
      }

      this.isUserInteracting = false;
      this.mapMoveStartCenter = null;
      this.mapMoveStartZoom = null;
      this.mapInteractionHadSignificantMove = false;
      if (onMoveEnd) onMoveEnd();
    });
  }

  // 駅マーカーを配置
  placeStationMarker(station, centerMap) {
    const latlng = [station.lat, station.lng];

    if (centerMap) {
      const targetZoom = Math.max(this.map.getZoom(), 13);
      this.map.setView(latlng, targetZoom);
    }

    const locationLatLng = this.locationManager && this.locationManager.isTracking()
      ? this.locationManager.getLastLatLng()
      : null;
    const popupContent = this.buildStationPopupContent(station, {
      isSelected: true,
      locationLatLng,
    });

    const trackingActive = this.locationManager && this.locationManager.isTracking();
    const highlightRanks = trackingActive ? this.currentHighlightRanks || new Map() : new Map();
    const isHighlightedByLocation = trackingActive && highlightRanks.has(station.index);
    const markerStyle = isHighlightedByLocation
      ? {
          radius: 10,
          color: '#E6C200',
          weight: 4,
          fillColor: this.resolveStationFillColor(station.attr, '#FFE45C'),
          fillOpacity: 0.95,
        }
      : {
          radius: 10,
          color: '#ff0000',
          weight: 3,
          fillColor: this.resolveStationFillColor(station.attr, '#ff4d4d'),
          fillOpacity: 0.9,
        };

    if (this.stationMarker) {
      this.stationMarker.setLatLng(latlng);
      this.stationMarker.setPopupContent(popupContent);
      this.stationMarker.setStyle(markerStyle);
      this.stationMarker.stationIndex = station.index;
    } else {
      this.stationMarker = L.circleMarker(latlng, {
        ...markerStyle,
        pane: 'stationPane',
      }).addTo(this.map);
      this.stationMarker.stationIndex = station.index;
      
      this.stationMarker.bindPopup(popupContent, {
        closeButton: true,
        offset: [0, -5]
      });
      this.attachStationPopupHandlers(this.stationMarker);
    }
    
    // 駅名ラベルを配置
    const labelIcon = this.createStationLabelIcon(station.name, {
      color: '#CC2222',
      interactive: false,
    });
    
    if (this.stationMarkerLabel) {
      this.stationMarkerLabel.setLatLng(latlng);
      this.stationMarkerLabel.setIcon(labelIcon);
    } else {
      this.stationMarkerLabel = L.marker(latlng, {
        icon: labelIcon,
        pane: 'stationPane',
        interactive: false
      }).addTo(this.map);
    }
  }

  // 画面内の駅ドットを更新
  updateStationDots(currentStationIndex) {
    const popupStationIndex = this.lastUserOpenedStationIndex;

    this.stationDotsLayer.clearLayers();
    
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    
    if (zoom <= CONFIG.stationDots.minZoom) {
      return;
    }
    
    const mapSize = this.map.getSize();
    
    // 画面内の駅数をカウント
    let visibleStationCount = 0;
    this.stationManager.stationPositions.forEach(s => {
      if (bounds.contains([s.lat, s.lng])) {
        visibleStationCount++;
      }
    });
    
    const areaPx = Math.max(1, mapSize.x * mapSize.y);
    const referenceArea = 500 * 500;
    const densityPerBlock = (visibleStationCount * referenceArea) / areaPx;
    const densityThreshold = CONFIG.stationDots.labelDensityThreshold || 5;
    const densityAllowsLabels = densityPerBlock <= densityThreshold;
    const shouldShowLabels = densityAllowsLabels && visibleStationCount < CONFIG.stationDots.maxLabelCount;
    
    const selectedStation = this.uiManager ? this.uiManager.getSelectedStation() : null;
    const highlightRanks = this.computeHighlightRanks(zoom);
    this.currentHighlightRanks = highlightRanks;
    const locationLatLng = this.locationManager && this.locationManager.isTracking()
      ? this.locationManager.getLastLatLng()
      : null;

    // 駅ドットを表示
    this.stationManager.stationPositions.forEach((s, idx) => {
      if (idx === currentStationIndex) return;
      
      if (bounds.contains([s.lat, s.lng])) {
        const rankInfo = highlightRanks.get(s.index);
        const isHighlighted = Boolean(rankInfo);
        const defaultFillColor = isHighlighted ? '#FFAA33' : '#66EE66';
        const defaultStrokeColor = isHighlighted ? '#FF8800' : '#22AA22';
        const circle = L.circleMarker([s.lat, s.lng], {
          radius: 9,
          color: this.resolveStationOutlineColor(s.attr, defaultStrokeColor, isHighlighted),
          weight: 3,
          fillColor: this.resolveStationFillColor(s.attr, defaultFillColor),
          fillOpacity: 1,
          pane: 'stationDotsPane',
          interactive: true
        });
        circle.stationIndex = s.index;
        circle.stationAttr = s.attr;
        circle.isStationDot = true;
        
        const popupContent = this.buildStationPopupContent(s, {
          isSelected: false,
          locationLatLng,
        });
        circle.bindPopup(popupContent, {
          closeButton: true,
          offset: [0, -5]
        });
        this.attachStationPopupHandlers(circle);
        
        this.stationDotsLayer.addLayer(circle);
        
        // 駅名ラベル
        if (shouldShowLabels) {
          const label = L.marker([s.lat, s.lng], {
            icon: this.createStationLabelIcon(s.name, {
              color: '#2255CC',
              interactive: true,
            }),
            pane: 'stationDotsPane',
            interactive: true,
            bubblingMouseEvents: false,
          });
          label.stationIndex = s.index;
          label.isStationLabel = true;
          this.attachStationLabelInteraction(label);
          this.stationDotsLayer.addLayer(label);
        }
      }
    });

    if (popupStationIndex != null) {
      const matchingLayer = this.stationDotsLayer
        .getLayers()
        .find((layer) => typeof layer.stationIndex === 'number' && layer.stationIndex === popupStationIndex);
      if (matchingLayer && matchingLayer.getPopup()) {
        matchingLayer.openPopup();
      }
    }
  }

  // デバウンス付きマップ再描画スケジュール
  scheduleMapRedraw(callback) {
    if (this.mapRedrawTimer) clearTimeout(this.mapRedrawTimer);
    this.mapRedrawTimer = setTimeout(callback, CONFIG.debounce.mapRedraw);
  }

  // デバウンス付きパラメータ再描画スケジュール
  scheduleParamRedraw(callback) {
    if (this.paramRedrawTimer) clearTimeout(this.paramRedrawTimer);
    this.paramRedrawTimer = setTimeout(callback, CONFIG.debounce.paramRedraw);
  }

  // デバウンス付き検索パンスケジュール
  scheduleSearchPan(callback) {
    if (this.searchPanTimer) clearTimeout(this.searchPanTimer);
    this.searchPanTimer = setTimeout(callback, CONFIG.debounce.searchPan);
  }

  handleMapClick(event) {
    if (event && event.latlng) {
      const opened = this.tryOpenNonSelectedStationPopupByLatLng(event.latlng);
      if (opened) {
        return;
      }
    }

    if (!CONFIG.debug || !CONFIG.debug.enableClickLocation) {
      return;
    }

    if (!this.locationManager || !this.locationManager.isTracking()) {
      return;
    }

    if (!event || !event.latlng) {
      return;
    }

    this.locationManager.setManualLocation(event.latlng, { pan: false });
  }

  tryOpenNonSelectedStationPopupByLatLng(latlng) {
    if (!this.map || !this.stationManager || !latlng) {
      return false;
    }

    const currentStationIndex = this.uiManager ? this.uiManager.getCurrentStationIndex() : null;
    const targetStationIndex = this.findNearestVisibleStationIndexInTapRange(latlng, currentStationIndex);
    if (targetStationIndex == null) {
      return false;
    }

    const stationDot = this.findStationDotLayerByIndex(targetStationIndex);
    if (!stationDot || !stationDot.getPopup || !stationDot.getPopup()) {
      return false;
    }

    this.lastUserOpenedStationIndex = targetStationIndex;
    stationDot.openPopup();
    return true;
  }

  findNearestVisibleStationIndexInTapRange(latlng, currentStationIndex) {
    const bounds = this.map.getBounds();
    const tapPoint = this.map.latLngToContainerPoint(latlng);
    const isCoarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const tolerancePx = isCoarsePointer
      ? (CONFIG?.stationDots?.tapTolerancePxCoarse || 30)
      : (CONFIG?.stationDots?.tapTolerancePxFine || 18);
    const toleranceSquared = tolerancePx * tolerancePx;

    let nearestIndex = null;
    let nearestDistSquared = Infinity;

    const stations = this.stationManager.stationPositions || [];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      if (!station) continue;
      if (station.index === currentStationIndex) continue;
      if (!bounds.contains([station.lat, station.lng])) continue;

      const stationPoint = this.map.latLngToContainerPoint([station.lat, station.lng]);
      const dx = stationPoint.x - tapPoint.x;
      const dy = stationPoint.y - tapPoint.y;
      const distSquared = (dx * dx) + (dy * dy);

      if (distSquared <= toleranceSquared && distSquared < nearestDistSquared) {
        nearestDistSquared = distSquared;
        nearestIndex = station.index;
      }
    }

    return nearestIndex;
  }

  // オーバーレイ領域が画面内に収まるようにズーム・中心を調整
  fitOverlayToStation(station, detectionCount) {
    if (!station || !this.map) {
      return;
    }

    const center = L.latLng(station.lat, station.lng);
    const fallbackCount = CONFIG?.detection?.default ?? 0;
    const parsedCount = Number(detectionCount);
    const count = Number.isFinite(parsedCount)
      ? Math.max(0, parsedCount)
      : Math.max(0, fallbackCount);
    const neighbors = this.stationManager.getNearestStations(station, count) || [];

    let maxDistance = 0;
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (!neighbor) continue;
      const dist = this.map.distance(center, L.latLng(neighbor.lat, neighbor.lng));
      if (Number.isFinite(dist) && dist > maxDistance) {
        maxDistance = dist;
      }
    }

    const paddingMeters = CONFIG.map.overlayFitPaddingMeters ?? 800;
    const minRadius = CONFIG.map.overlayFitMinRadiusMeters ?? 2000;
    let radius = Math.max(minRadius, maxDistance + paddingMeters);
    if (!Number.isFinite(radius) || radius <= 0) {
      radius = minRadius;
    }

    const bounds = center.toBounds(radius * 2);
    this.map.fitBounds(bounds, {
      padding: [40, 40],
      animate: true,
    });
  }

  computeHighlightRanks(zoomOverride) {
    if (!this.locationManager || !this.locationManager.isTracking()) {
      return new Map();
    }

    const zoom = zoomOverride != null ? zoomOverride : this.map.getZoom();
    if (zoom <= CONFIG.stationDots.minZoom) {
      return new Map();
    }

    const locationLatLng = this.locationManager.getLastLatLng();
    if (!locationLatLng) {
      return new Map();
    }

    const fallbackCount = CONFIG?.detection?.default ?? 0;
    const detectionCount = this.uiManager ? this.uiManager.getDetectionCount() : fallbackCount;
    const parsedCount = Number(detectionCount);
    const normalizedCount = Number.isFinite(parsedCount)
      ? Math.max(0, parsedCount)
      : Math.max(0, fallbackCount);

    if (normalizedCount <= 0) {
      return new Map();
    }

    return this.stationManager.getNearestStationsByLatLng(locationLatLng, normalizedCount);
  }

  refreshStationDotStyles() {
    if (!this.stationDotsLayer) {
      return;
    }

    const highlightRanks = this.computeHighlightRanks();
    this.currentHighlightRanks = highlightRanks;

    this.stationDotsLayer.getLayers().forEach((layer) => {
      if (!layer || !layer.isStationDot || typeof layer.stationIndex !== 'number') {
        return;
      }

      const isHighlighted = highlightRanks.has(layer.stationIndex);
      const defaultFillColor = isHighlighted ? '#FFAA33' : '#66EE66';
      const defaultStrokeColor = isHighlighted ? '#FF8800' : '#22AA22';
      layer.setStyle({
        radius: 9,
        color: this.resolveStationOutlineColor(layer.stationAttr, defaultStrokeColor, isHighlighted),
        weight: 3,
        fillColor: this.resolveStationFillColor(layer.stationAttr, defaultFillColor),
        fillOpacity: 1,
      });
    });

    if (this.stationMarker && typeof this.stationMarker.stationIndex === 'number') {
      const trackingActive = this.locationManager && this.locationManager.isTracking();
      const isSelectedHighlighted = trackingActive && highlightRanks.has(this.stationMarker.stationIndex);
      const selectedStation = this.uiManager ? this.uiManager.getSelectedStation() : null;
      const selectedAttr = selectedStation ? selectedStation.attr : 'unknown';
      this.stationMarker.setStyle(
        isSelectedHighlighted
          ? {
              radius: 10,
              color: '#E6C200',
              weight: 4,
              fillColor: this.resolveStationFillColor(selectedAttr, '#FFE45C'),
              fillOpacity: 0.95,
            }
          : {
              radius: 10,
              color: '#ff0000',
              weight: 3,
              fillColor: this.resolveStationFillColor(selectedAttr, '#ff4d4d'),
              fillOpacity: 0.9,
            }
      );
      this.stationMarker.bringToFront();
    }
  }

  attachStationLabelInteraction(labelLayer) {
    if (!labelLayer || typeof labelLayer.stationIndex !== 'number') {
      return;
    }

    const openPopup = (event) => {
      if (event) {
        L.DomEvent.stop(event);
      }

      const now = Date.now();
      if (now - this.lastStationLabelOpenAt < 320) {
        return;
      }
      this.lastStationLabelOpenAt = now;

      const stationDot = this.findStationDotLayerByIndex(labelLayer.stationIndex);
      if (!stationDot || !stationDot.getPopup) {
        return;
      }

      const popup = stationDot.getPopup();
      if (!popup) {
        return;
      }

      stationDot.openPopup();
      this.lastUserOpenedStationIndex = labelLayer.stationIndex;
    };

    labelLayer.on('click', openPopup);
    labelLayer.on('touchend', openPopup);
  }

  findStationDotLayerByIndex(stationIndex) {
    if (!this.stationDotsLayer || typeof stationIndex !== 'number') {
      return null;
    }

    const layers = this.stationDotsLayer.getLayers();
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      if (layer && layer.isStationDot && layer.stationIndex === stationIndex) {
        return layer;
      }
    }

    return null;
  }

  attachStationPopupHandlers(layer) {
    if (!layer || layer.__stationPopupHandlersBound) {
      return;
    }

    const openStationPopup = (event) => {
      if (event) {
        L.DomEvent.stop(event);
      }
      if (typeof layer.stationIndex === 'number') {
        this.lastUserOpenedStationIndex = layer.stationIndex;
      }
      if (typeof layer.openPopup === 'function') {
        layer.openPopup();
      }
    };

    layer.on('click', openStationPopup);
    layer.on('touchend', openStationPopup);

    layer.on('popupopen', (event) => {
      if (typeof layer.stationIndex === 'number') {
        this.lastUserOpenedStationIndex = layer.stationIndex;
      }

      const popupElement = event && event.popup && typeof event.popup.getElement === 'function'
        ? event.popup.getElement()
        : null;
      if (popupElement) {
        this.bindStationPopupActions(popupElement);
        return;
      }

      window.setTimeout(() => {
        const retryPopupElement = event && event.popup && typeof event.popup.getElement === 'function'
          ? event.popup.getElement()
          : null;
        this.bindStationPopupActions(retryPopupElement);
      }, 0);
    });

    layer.on('popupclose', () => {
      const isMapZooming = this.map && (this.map._zooming || this.map._moving);
      if (isMapZooming) {
        this.lastUserOpenedStationIndex = null;
      }
    });

    layer.__stationPopupHandlersBound = true;
  }

  buildStationPopupContent(station, options = {}) {
    if (!station) {
      return '';
    }

    const isSelected = Boolean(options.isSelected);
    const locationLatLng = options.locationLatLng || null;
    const prefectureName = PREFECTURE_NAMES[station.prefecture] || '不明';
    const linesHTML = this.stationManager.getLineNamesHTML(station.lines);
    const stationName = this.escapeHtml(station.name || '');
    const stationKana = this.escapeHtml(station.name_kana || '');

    const locationRankForStation = locationLatLng
      ? this.stationManager.getStationRankFromLatLng(locationLatLng, station)
      : null;
    const locationRankHTML = locationRankForStation
      ? `<div style="font-size: 13px; color: #0b5394; font-weight: 600; margin-bottom: 4px;">現在地から<span style="font-size: 15px;">${locationRankForStation.toLocaleString()}</span>駅目</div>`
      : '';

    const selectedBadgeHTML = isSelected
      ? `<div style="${STATION_POPUP_SELECTED_STYLE}">現在選択中の駅</div>`
      : '';
    const selectActionHTML = isSelected
      ? ''
      : `<div style="${STATION_POPUP_ACTION_WRAPPER_STYLE}">
          <a href="#" class="station-select-action" data-station-name="${this.escapeHtml(station.name || '')}" style="${STATION_POPUP_ACTION_STYLE}">この駅を指定</a>
        </div>`;

    return `
      <div style="${STATION_POPUP_CONTAINER_STYLE}">
        <div style="${STATION_POPUP_TITLE_STYLE}">${stationName}</div>
        <div style="${STATION_POPUP_KANA_STYLE}">${stationKana}</div>
        <div style="${STATION_POPUP_PREFECTURE_STYLE}">${prefectureName}</div>
        ${linesHTML}
        ${locationRankHTML}
        ${selectedBadgeHTML}
        ${selectActionHTML}
      </div>
    `;
  }

  createStationLabelIcon(stationName, options = {}) {
    const color = options.color || '#2255CC';
    const interactive = Boolean(options.interactive);
    const safeStationName = this.escapeHtml(stationName || '');

    return L.divIcon({
      className: interactive ? 'station-label station-label-interactive' : 'station-label',
      html: `<div style="${STATION_LABEL_BASE_STYLE}; color: ${color}; pointer-events: ${interactive ? 'auto' : 'none'}; cursor: ${interactive ? 'pointer' : 'default'};">${safeStationName}</div>`,
      iconSize: [200, 32],
      iconAnchor: [100, 0],
    });
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  bindStationPopupActions(popupElement) {
    if (!popupElement) {
      return;
    }

    if (popupElement.__stationPopupActionsBound) {
      return;
    }

    const onClick = (event) => {
      const selectAction = this.getStationPopupActionFromEvent(event, popupElement);
      if (!selectAction) {
        return;
      }

      event.preventDefault();
      const stationName = selectAction.getAttribute('data-station-name') || '';
      if (window.app && typeof window.app.selectStationByName === 'function') {
        window.app.selectStationByName(stationName);
      }
    };

    const onPointerOver = (event) => {
      const selectAction = this.getStationPopupActionFromEvent(event, popupElement);
      if (!selectAction) {
        return;
      }

      selectAction.style.transform = 'translateY(-1px)';
      selectAction.style.boxShadow = '0 3px 6px rgba(23, 93, 220, 0.4)';
    };

    const onPointerOut = (event) => {
      const selectAction = this.getStationPopupActionFromEvent(event, popupElement);
      if (!selectAction) {
        return;
      }

      selectAction.style.transform = 'translateY(0)';
      selectAction.style.boxShadow = '0 2px 4px rgba(23, 93, 220, 0.3)';
    };

    popupElement.addEventListener('click', onClick);
    popupElement.addEventListener('pointerover', onPointerOver);
    popupElement.addEventListener('pointerout', onPointerOut);
    popupElement.__stationPopupActionsBound = true;
  }

  getStationPopupActionFromEvent(event, popupElement) {
    if (!event || !popupElement) {
      return null;
    }

    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const selectAction = target.closest('.station-select-action');
    if (!selectAction || !popupElement.contains(selectAction)) {
      return null;
    }

    return selectAction;
  }

  resolveStationFillColor(attr, fallbackFillColor) {
    if (!this.isStationAttrColorEnabled()) {
      return fallbackFillColor;
    }

    const key = this.normalizeStationAttr(attr);
    const configuredColors = CONFIG?.stationDots?.attrFillColors || {};
    return configuredColors[key] || configuredColors.unknown || '#9E9E9E';
  }

  resolveStationOutlineColor(attr, fallbackStrokeColor, isHighlightedByLocation) {
    if (isHighlightedByLocation || !this.isStationAttrColorEnabled()) {
      return fallbackStrokeColor;
    }

    const key = this.normalizeStationAttr(attr);
    const configuredColors = CONFIG?.stationDots?.attrStrokeColors || {};
    return configuredColors[key] || configuredColors.unknown || '#616161';
  }

  isStationAttrColorEnabled() {
    return Boolean(this.uiManager && this.uiManager.isStationAttrColorEnabled && this.uiManager.isStationAttrColorEnabled());
  }

  normalizeStationAttr(attr) {
    const normalized = typeof attr === 'string' ? attr.toLowerCase() : 'unknown';
    if (normalized === 'eco' || normalized === 'cool' || normalized === 'heat') {
      return normalized;
    }
    return 'unknown';
  }
}
