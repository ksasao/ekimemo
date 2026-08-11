// マップ管理

const STATION_POPUP_CONTAINER_STYLE = 'font-family: system-ui, sans-serif; min-width: 150px;';
const STATION_POPUP_TITLE_STYLE = 'font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #222;';
const STATION_POPUP_KANA_STYLE = 'font-size: 13px; color: #666; margin-bottom: 6px;';
const STATION_POPUP_PREFECTURE_STYLE = 'font-size: 13px; color: #444; border-top: 1px solid #ddd; padding-top: 4px; margin-bottom: 4px;';
const STATION_POPUP_SELECTED_STYLE = 'font-size: 12px; color: #888; margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;';
const STATION_POPUP_MEMO_SECTION_STYLE = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;';
const STATION_POPUP_MEMO_LABEL_STYLE = 'display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px;';
const STATION_POPUP_MEMO_TEXTAREA_STYLE = 'display: block; width: 100%; min-height: 58px; box-sizing: border-box; resize: vertical; border: 1px solid #c9d2e3; border-radius: 6px; padding: 6px 8px; font-size: 16px; line-height: 1.4; font-family: inherit;';
const STATION_POPUP_MEMO_HEADER_STYLE = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;';
const STATION_POPUP_MEMO_META_STYLE = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px;';
const STATION_POPUP_MEMO_STATUS_STYLE = 'font-size: 11px; color: #666;';
const STATION_POPUP_MEMO_SAVE_BUTTON_STYLE = [
  'display: inline-block',
  'padding: 5px 10px',
  'border: 0',
  'border-radius: 6px',
  'background: #e8f0fe',
  'color: #174ea6',
  'font-size: 12px',
  'font-weight: 600',
  'cursor: pointer'
].join('; ');
const STATION_POPUP_MEMO_DELETE_BUTTON_STYLE = [
  'display: inline-block',
  'padding: 4px 8px',
  'border: 1px solid #d0d7e2',
  'border-radius: 6px',
  'background: #fff5f5',
  'color: #b42318',
  'font-size: 12px',
  'font-weight: 600',
  'cursor: pointer'
].join('; ');
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
const STATION_MEMO_STORAGE_KEY = 'stationPopupMemos';
const STATION_MEMO_MAX_LENGTH = 120;
const STATION_MEMO_LABEL_COLOR = '#7C3AED';
const STATION_MEMO_EXPORT_HEADERS = ['最終更新日', '駅名', 'メモ本文'];
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
    this.stationMarkerMemoLabel = null;
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
    this.stationMemoCache = this.loadStationMemoCache();

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

    this.updateSelectedStationMemoLabel(station, latlng);
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

        const memoLabelIcon = this.isStationMemoLabelEnabled()
          ? this.createStationMemoLabelIcon(this.getStationMemoFirstCharacter(s.id), {
              color: STATION_MEMO_LABEL_COLOR,
            })
          : null;
        if (memoLabelIcon) {
          const memoLabel = L.marker([s.lat, s.lng], {
            icon: memoLabelIcon,
            pane: 'stationDotsPane',
            interactive: true,
            bubblingMouseEvents: false,
          });
          memoLabel.stationIndex = s.index;
          memoLabel.isStationMemoLabel = true;
          this.attachStationLabelInteraction(memoLabel);
          this.stationDotsLayer.addLayer(memoLabel);
        }
        
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

      const popupLayer = this.findStationPopupLayerByIndex(labelLayer.stationIndex);
      if (!popupLayer || !popupLayer.getPopup) {
        return;
      }

      const popup = popupLayer.getPopup();
      if (!popup) {
        return;
      }

      popupLayer.openPopup();
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

  findStationPopupLayerByIndex(stationIndex) {
    if (typeof stationIndex !== 'number') {
      return null;
    }

    if (this.stationMarker && this.stationMarker.stationIndex === stationIndex && typeof this.stationMarker.getPopup === 'function') {
      return this.stationMarker;
    }

    return this.findStationDotLayerByIndex(stationIndex);
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
    const memoValue = this.escapeHtml(this.getStationMemo(station.id));

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
    const memoStatusText = memoValue ? '保存済み' : '未保存';

    return `
      <div style="${STATION_POPUP_CONTAINER_STYLE}">
        <div style="${STATION_POPUP_TITLE_STYLE}">${stationName}</div>
        <div style="${STATION_POPUP_KANA_STYLE}">${stationKana}</div>
        <div style="${STATION_POPUP_PREFECTURE_STYLE}">${prefectureName}</div>
        ${linesHTML}
        ${locationRankHTML}
        <div style="${STATION_POPUP_MEMO_SECTION_STYLE}">
          <div style="${STATION_POPUP_MEMO_HEADER_STYLE}">
            <label style="${STATION_POPUP_MEMO_LABEL_STYLE}; margin-bottom: 0;" for="station-memo-${station.id}">一言メモ</label>
            <button type="button" class="station-memo-delete-action" data-station-id="${station.id}" style="${STATION_POPUP_MEMO_DELETE_BUTTON_STYLE}" aria-label="メモを削除" title="メモを削除">メモを削除</button>
          </div>
          <textarea id="station-memo-${station.id}" class="station-memo-input" data-station-id="${station.id}" maxlength="${STATION_MEMO_MAX_LENGTH}" placeholder="この駅のメモを入力" style="${STATION_POPUP_MEMO_TEXTAREA_STYLE}">${memoValue}</textarea>
          <div style="${STATION_POPUP_MEMO_META_STYLE}">
            <span class="station-memo-status" data-station-id="${station.id}" style="${STATION_POPUP_MEMO_STATUS_STYLE}">${memoStatusText}</span>
            <button type="button" class="station-memo-save-action" data-station-id="${station.id}" style="${STATION_POPUP_MEMO_SAVE_BUTTON_STYLE}">保存</button>
          </div>
        </div>
        ${selectedBadgeHTML}
        ${selectActionHTML}
      </div>
    `;
  }

  createStationLabelIcon(stationName, options = {}) {
    const color = options.color || '#2255CC';
    const interactive = Boolean(options.interactive);
    const width = Number.isFinite(options.width) ? options.width : 200;
    const fontSize = Number.isFinite(options.fontSize) ? options.fontSize : 16;
    const fontWeight = options.fontWeight || 700;
    const marginTop = Number.isFinite(options.marginTop) ? options.marginTop : 8;
    const safeStationName = this.escapeHtml(stationName || '');
    const style = [
      `width: ${width}px`,
      `margin-top: ${marginTop}px`,
      `font-size: ${fontSize}px`,
      `font-weight: ${fontWeight}`,
      'text-align: center',
      'text-shadow: -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
      'white-space: nowrap',
      `color: ${color}`,
      `pointer-events: ${interactive ? 'auto' : 'none'}`,
      `cursor: ${interactive ? 'pointer' : 'default'}`,
    ].join('; ');

    return L.divIcon({
      className: interactive ? 'station-label station-label-interactive' : 'station-label',
      html: `<div style="${style}">${safeStationName}</div>`,
      iconSize: [width, 32],
      iconAnchor: [Math.round(width / 2), 0],
    });
  }

  createStationMemoLabelIcon(memoCharacter, options = {}) {
    if (!memoCharacter) {
      return null;
    }

    const color = options.color || STATION_MEMO_LABEL_COLOR;
    const safeCharacter = this.escapeHtml(memoCharacter);
    const characterCount = Array.from(memoCharacter).length;
    const badgeWidth = characterCount >= 2 ? 36 : 28;
    const badgeHeight = 28;
    const tailHeight = 5;
    const iconHeight = badgeHeight + tailHeight - 1;
    const tailWidth = 10;
    const badgeStyle = [
      'display: flex',
      'align-items: center',
      'justify-content: center',
      `width: ${badgeWidth}px`,
      `height: ${badgeHeight}px`,
      'margin-left: 0',
      'border-radius: 999px',
      'background: #ffffff',
      'border: 3px solid #ffffff',
      'box-shadow: 0 2px 6px rgba(15, 23, 42, 0.35)',
      'color: #374151',
      'font-size: 18px',
      'font-weight: 800',
      'line-height: 1',
      'text-align: center',
      'pointer-events: auto',
      'font-family: system-ui, sans-serif'
    ].join('; ');
    const tailStyle = [
      'width: 0',
      'height: 0',
      'margin-top: -1px',
      'border-left: 5px solid transparent',
      'border-right: 5px solid transparent',
      `border-top: ${tailHeight}px solid #ffffff`,
      'filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.15))',
      'pointer-events: auto'
    ].join('; ');
    const wrapperStyle = [
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'justify-content: flex-start',
      'overflow: visible',
      `width: ${badgeWidth}px`,
      `height: ${iconHeight}px`,
      'pointer-events: auto'
    ].join('; ');

    return L.divIcon({
      className: 'station-memo-label',
      html: `<div style="${wrapperStyle}"><div style="${badgeStyle}">${safeCharacter}</div><div style="${tailStyle}"></div></div>`,
      iconSize: [badgeWidth, iconHeight],
      iconAnchor: [Math.round(badgeWidth / 2), iconHeight + 11],
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
      if (selectAction) {
        L.DomEvent.stop(event);
        const stationName = selectAction.getAttribute('data-station-name') || '';
        if (window.app && typeof window.app.selectStationByName === 'function') {
          window.app.selectStationByName(stationName);
        }
        return;
      }

      const saveAction = this.getStationPopupMemoSaveActionFromEvent(event, popupElement);
      if (saveAction) {
        L.DomEvent.stop(event);
        const stationId = Number(saveAction.getAttribute('data-station-id'));
        this.saveStationMemoFromPopup(popupElement, stationId);
        return;
      }

      const deleteAction = this.getStationPopupMemoDeleteActionFromEvent(event, popupElement);
      if (!deleteAction) {
        return;
      }

      L.DomEvent.stop(event);
      const stationId = Number(deleteAction.getAttribute('data-station-id'));
      this.clearStationMemoFromPopup(popupElement, stationId);
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
    popupElement.addEventListener('input', (event) => {
      const memoInput = this.getStationPopupMemoInputFromEvent(event, popupElement);
      if (!memoInput) {
        return;
      }

      const stationId = Number(memoInput.getAttribute('data-station-id'));
      this.updateStationMemoStatus(popupElement, stationId, '入力中...');
    });
    popupElement.addEventListener('change', (event) => {
      const memoInput = this.getStationPopupMemoInputFromEvent(event, popupElement);
      if (!memoInput) {
        return;
      }

      const stationId = Number(memoInput.getAttribute('data-station-id'));
      this.saveStationMemoFromPopup(popupElement, stationId);
    });
    popupElement.__stationPopupActionsBound = true;
  }

  getStationPopupMemoSaveActionFromEvent(event, popupElement) {
    if (!event || !popupElement) {
      return null;
    }

    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const saveAction = target.closest('.station-memo-save-action');
    if (!saveAction || !popupElement.contains(saveAction)) {
      return null;
    }

    return saveAction;
  }

  getStationPopupMemoInputFromEvent(event, popupElement) {
    if (!event || !popupElement) {
      return null;
    }

    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const memoInput = target.closest('.station-memo-input');
    if (!memoInput || !popupElement.contains(memoInput)) {
      return null;
    }

    return memoInput;
  }

  getStationPopupMemoDeleteActionFromEvent(event, popupElement) {
    if (!event || !popupElement) {
      return null;
    }

    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const deleteAction = target.closest('.station-memo-delete-action');
    if (!deleteAction || !popupElement.contains(deleteAction)) {
      return null;
    }

    return deleteAction;
  }

  saveStationMemoFromPopup(popupElement, stationId) {
    if (!popupElement || !Number.isFinite(stationId)) {
      return;
    }

    const memoInput = popupElement.querySelector(`.station-memo-input[data-station-id="${stationId}"]`);
    if (!memoInput) {
      return;
    }

    const memo = this.normalizeStationMemo(memoInput.value);
    memoInput.value = memo;
    this.setStationMemo(stationId, memo, new Date().toISOString());
    this.refreshStationPopupContent(stationId);
    this.refreshStationMemoDecorations(stationId);
    this.updateStationMemoStatus(popupElement, stationId, memo ? '保存済み' : '空欄で保存済み');
  }

  clearStationMemoFromPopup(popupElement, stationId) {
    if (!popupElement || !Number.isFinite(stationId)) {
      return;
    }

    const memoInput = popupElement.querySelector(`.station-memo-input[data-station-id="${stationId}"]`);
    if (!memoInput) {
      return;
    }

    memoInput.value = '';
    this.setStationMemo(stationId, '');
    this.refreshStationMemoDecorations(stationId);
    this.updateStationMemoStatus(popupElement, stationId, '削除済み');
    memoInput.focus();
  }

  updateStationMemoStatus(popupElement, stationId, text) {
    if (!popupElement || !Number.isFinite(stationId)) {
      return;
    }

    const statusElement = popupElement.querySelector(`.station-memo-status[data-station-id="${stationId}"]`);
    if (statusElement) {
      statusElement.textContent = text;
    }
  }

  getStationMemo(stationId) {
    if (!Number.isFinite(Number(stationId)) || !this.stationMemoCache) {
      return '';
    }

    const entry = this.getStationMemoEntry(stationId);
    return entry ? entry.memo : '';
  }

  getStationMemoEntry(stationId) {
    if (!Number.isFinite(Number(stationId)) || !this.stationMemoCache) {
      return null;
    }

    const rawEntry = this.stationMemoCache[String(Number(stationId))];
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
      return null;
    }

    const memo = this.normalizeStationMemo(rawEntry.memo);
    if (!memo) {
      return null;
    }

    return {
      memo,
      updatedAt: this.normalizeMemoUpdatedAt(rawEntry.updatedAt),
    };
  }

  setStationMemo(stationId, memo, updatedAt = null) {
    const normalizedStationId = String(Number(stationId));
    if (!this.stationMemoCache || normalizedStationId === 'NaN') {
      return;
    }

    if (memo) {
      const safeUpdatedAt = this.normalizeMemoUpdatedAt(updatedAt) || new Date().toISOString();
      this.stationMemoCache[normalizedStationId] = {
        memo,
        updatedAt: safeUpdatedAt,
      };
    } else {
      delete this.stationMemoCache[normalizedStationId];
    }

    this.saveStationMemoCache();
  }

  getStationMemoFirstCharacter(stationId) {
    const memo = this.getStationMemo(stationId);
    if (!memo) {
      return '';
    }

    const characters = Array.from(memo);
    if (characters.length === 0) {
      return '';
    }

    const first = characters[0];
    const second = characters[1] || '';
    if (this.isHalfWidthMemoCharacter(first) && second && this.isHalfWidthMemoCharacter(second)) {
      return `${first}${second}`;
    }

    return first;
  }

  isHalfWidthMemoCharacter(character) {
    if (!character) {
      return false;
    }

    return /^[\u0020-\u007E\uFF61-\uFF9F]$/.test(character);
  }

  updateSelectedStationMemoLabel(station, latlng) {
    if (!this.isStationMemoLabelEnabled()) {
      if (this.stationMarkerMemoLabel && this.map) {
        this.map.removeLayer(this.stationMarkerMemoLabel);
        this.stationMarkerMemoLabel = null;
      }
      return;
    }

    const memoCharacter = station ? this.getStationMemoFirstCharacter(station.id) : '';
    const memoLabelIcon = this.createStationMemoLabelIcon(memoCharacter, {
      color: STATION_MEMO_LABEL_COLOR,
    });

    if (!memoLabelIcon) {
      if (this.stationMarkerMemoLabel && this.map) {
        this.map.removeLayer(this.stationMarkerMemoLabel);
        this.stationMarkerMemoLabel = null;
      }
      return;
    }

    if (this.stationMarkerMemoLabel) {
      this.stationMarkerMemoLabel.setLatLng(latlng);
      this.stationMarkerMemoLabel.setIcon(memoLabelIcon);
      return;
    }

    this.stationMarkerMemoLabel = L.marker(latlng, {
      icon: memoLabelIcon,
      pane: 'stationPane',
      interactive: true,
      bubblingMouseEvents: false,
    }).addTo(this.map);
    this.stationMarkerMemoLabel.stationIndex = station.index;
    this.stationMarkerMemoLabel.isStationMemoLabel = true;
    this.attachStationLabelInteraction(this.stationMarkerMemoLabel);
  }

  refreshStationMemoDecorations(stationId) {
    const station = this.stationManager && this.stationManager.getStationById
      ? this.stationManager.getStationById(stationId)
      : null;
    if (!station) {
      return;
    }

    if (this.stationMarker && this.stationMarker.stationIndex === station.index) {
      this.updateSelectedStationMemoLabel(station, [station.lat, station.lng]);
    }

    if (this.stationDotsLayer && this.map) {
      const currentStationIndex = this.uiManager && typeof this.uiManager.getCurrentStationIndex === 'function'
        ? this.uiManager.getCurrentStationIndex()
        : null;
      this.updateStationDots(currentStationIndex);
    }
  }

  refreshStationPopupContent(stationId) {
    const station = this.stationManager && this.stationManager.getStationById
      ? this.stationManager.getStationById(stationId)
      : null;
    if (!station) {
      return;
    }

    const locationLatLng = this.locationManager && this.locationManager.isTracking()
      ? this.locationManager.getLastLatLng()
      : null;

    if (this.stationMarker && this.stationMarker.stationIndex === station.index && typeof this.stationMarker.setPopupContent === 'function') {
      this.stationMarker.setPopupContent(this.buildStationPopupContent(station, {
        isSelected: true,
        locationLatLng,
      }));
    }

    const stationDot = this.findStationDotLayerByIndex(station.index);
    if (stationDot && typeof stationDot.setPopupContent === 'function') {
      stationDot.setPopupContent(this.buildStationPopupContent(station, {
        isSelected: false,
        locationLatLng,
      }));
    }
  }

  loadStationMemoCache() {
    try {
      const raw = localStorage.getItem(STATION_MEMO_STORAGE_KEY);
      if (!raw || raw.length > 200000) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }

      const sanitized = {};
      Object.entries(parsed).forEach(([stationId, rawValue]) => {
        if (!/^\d+$/.test(stationId)) {
          return;
        }

        if (typeof rawValue === 'string') {
          const legacyMemo = this.normalizeStationMemo(rawValue);
          if (legacyMemo) {
            sanitized[stationId] = {
              memo: legacyMemo,
              updatedAt: '',
            };
          }
          return;
        }

        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
          return;
        }

        const normalizedMemo = this.normalizeStationMemo(rawValue.memo);
        if (normalizedMemo) {
          sanitized[stationId] = {
            memo: normalizedMemo,
            updatedAt: this.normalizeMemoUpdatedAt(rawValue.updatedAt),
          };
        }
      });
      return sanitized;
    } catch (e) {
      console.warn('localStorage access denied:', e);
      return {};
    }
  }

  saveStationMemoCache() {
    try {
      localStorage.setItem(STATION_MEMO_STORAGE_KEY, JSON.stringify(this.stationMemoCache || {}));
    } catch (e) {
      console.warn('localStorage access denied:', e);
    }
  }

  normalizeStationMemo(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
      .slice(0, STATION_MEMO_MAX_LENGTH);
  }

  normalizeMemoUpdatedAt(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString();
  }

  formatMemoUpdatedAtForExport(value) {
    const iso = this.normalizeMemoUpdatedAt(value);
    if (!iso) {
      return '';
    }

    const date = new Date(iso);
    const pad2 = (num) => String(num).padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  escapeCsvCell(value) {
    const text = String(value == null ? '' : value)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    return `"${text.replace(/"/g, '""')}"`;
  }

  buildStationMemoExportRows() {
    if (!this.stationMemoCache || typeof this.stationMemoCache !== 'object') {
      return [];
    }

    const rows = [];
    Object.entries(this.stationMemoCache).forEach(([stationId]) => {
      if (!/^\d+$/.test(stationId)) {
        return;
      }

      const entry = this.getStationMemoEntry(Number(stationId));
      if (!entry || !entry.memo) {
        return;
      }

      const station = this.stationManager && this.stationManager.getStationById
        ? this.stationManager.getStationById(Number(stationId))
        : null;
      const stationName = station && station.name ? station.name : '';

      rows.push({
        updatedAt: this.formatMemoUpdatedAtForExport(entry.updatedAt),
        stationName,
        memo: entry.memo,
      });
    });

    rows.sort((a, b) => a.stationName.localeCompare(b.stationName, 'ja'));
    return rows;
  }

  exportStationMemosAsCsv() {
    const rows = this.buildStationMemoExportRows();
    if (rows.length === 0) {
      return 0;
    }

    const lines = [
      STATION_MEMO_EXPORT_HEADERS.map((header) => this.escapeCsvCell(header)).join(','),
      ...rows.map((row) => [
        this.escapeCsvCell(row.updatedAt),
        this.escapeCsvCell(row.stationName),
        this.escapeCsvCell(row.memo),
      ].join(',')),
    ];

    const csvText = lines.join('\r\n');
    const blob = new Blob([`\uFEFF${csvText}`], { type: 'text/csv;charset=utf-8;' });
    const now = new Date();
    const pad2 = (num) => String(num).padStart(2, '0');
    const fileName = `station-memos-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}.csv`;

    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = fileName;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);

    return rows.length;
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

  isStationMemoLabelEnabled() {
    return !this.uiManager || !this.uiManager.isStationMemoLabelEnabled || this.uiManager.isStationMemoLabelEnabled();
  }

  normalizeStationAttr(attr) {
    const normalized = typeof attr === 'string' ? attr.toLowerCase() : 'unknown';
    if (normalized === 'eco' || normalized === 'cool' || normalized === 'heat') {
      return normalized;
    }
    return 'unknown';
  }
}
