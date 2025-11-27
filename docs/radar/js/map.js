// マップ管理

class MapManager {
  constructor(stationManager) {
    this.stationManager = stationManager;
    this.map = null;
    this.overlayLayer = null;
    this.stationDotsLayer = null;
    this.stationMarker = null;
    this.stationMarkerLabel = null;
    this.isUserInteracting = false;
    
    // デバウンス用タイマー
    this.searchPanTimer = null;
    this.mapRedrawTimer = null;
    this.paramRedrawTimer = null;
  }

  // マップを初期化
  initialize() {
    this.map = L.map('map', {
      center: CONFIG.map.center,
      zoom: CONFIG.map.zoom,
      zoomControl: true,
      preferCanvas: false,
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

    return this.map;
  }

  // マップイベントリスナーを設定
  setupEventListeners(onMoveStart, onMoveEnd) {
    this.map.on('movestart zoomstart', () => {
      this.isUserInteracting = true;
      if (this.searchPanTimer) {
        clearTimeout(this.searchPanTimer);
        this.searchPanTimer = null;
      }
      if (onMoveStart) onMoveStart();
    });

    this.map.on('moveend zoomend', () => {
      this.isUserInteracting = false;
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

    const prefectureName = PREFECTURE_NAMES[station.prefecture] || '不明';
    const linesHTML = this.stationManager.getLineNamesHTML(station.lines);
    const popupContent = `
      <div style="font-family: system-ui, sans-serif; min-width: 150px;">
        <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #222;">${station.name}</div>
        <div style="font-size: 13px; color: #666; margin-bottom: 6px;">${station.name_kana}</div>
        <div style="font-size: 13px; color: #444; border-top: 1px solid #ddd; padding-top: 4px;">${prefectureName}</div>
        ${linesHTML}
        <div style="font-size: 12px; color: #888; margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee;">現在選択中の駅</div>
      </div>
    `;

    if (this.stationMarker) {
      this.stationMarker.setLatLng(latlng);
      this.stationMarker.setPopupContent(popupContent);
    } else {
      this.stationMarker = L.circleMarker(latlng, {
        radius: 10,
        color: '#ff0000',
        weight: 3,
        fillColor: '#ff4d4d',
        fillOpacity: 0.9,
        pane: 'stationPane',
      }).addTo(this.map);
      
      this.stationMarker.bindPopup(popupContent, {
        closeButton: true,
        offset: [0, -5]
      });
    }
    
    // 駅名ラベルを配置
    const labelIcon = L.divIcon({
      className: 'station-label',
      html: `<div style="
        position: absolute;
        left: -100px;
        top: 8px;
        width: 200px;
        font-size: 16px;
        font-weight: 700;
        color: #CC2222;
        text-align: center;
        text-shadow: 
          -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff,
          -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff,
          -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
        white-space: nowrap;
        pointer-events: none;
      ">${station.name}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
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
    this.stationDotsLayer.clearLayers();
    
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    
    if (zoom <= CONFIG.stationDots.minZoom) {
      return;
    }
    
    const showLabels = zoom >= CONFIG.stationDots.labelZoom;
    
    // 画面内の駅数をカウント
    let visibleStationCount = 0;
    this.stationManager.stationPositions.forEach(s => {
      if (bounds.contains([s.lat, s.lng])) {
        visibleStationCount++;
      }
    });
    
    const shouldShowLabels = showLabels && visibleStationCount < CONFIG.stationDots.maxLabelCount;
    
    // 駅ドットを表示
    this.stationManager.stationPositions.forEach((s, idx) => {
      if (idx === currentStationIndex) return;
      
      if (bounds.contains([s.lat, s.lng])) {
        const circle = L.circleMarker([s.lat, s.lng], {
          radius: 9,
          color: '#22AA22',
          weight: 3,
          fillColor: '#66EE66',
          fillOpacity: 1,
          pane: 'stationDotsPane',
          interactive: true
        });
        
        const prefectureName = PREFECTURE_NAMES[s.prefecture] || '不明';
        const linesHTML = this.stationManager.getLineNamesHTML(s.lines);
        const popupContent = `
          <div style="font-family: system-ui, sans-serif; min-width: 150px;">
            <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #222;">${s.name}</div>
            <div style="font-size: 13px; color: #666; margin-bottom: 6px;">${s.name_kana}</div>
            <div style="font-size: 13px; color: #444; border-top: 1px solid #ddd; padding-top: 4px; margin-bottom: 4px;">${prefectureName}</div>
            ${linesHTML}
            <div style="margin-top: 8px;">
              <a href="#" onclick="window.app.selectStationByName('${s.name.replace(/'/g, "\\'")}'); return false;" style="
                display: inline-block;
                padding: 6px 12px;
                background: linear-gradient(135deg, #2f80ff 0%, #175ddc 100%);
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                text-align: center;
                box-shadow: 0 2px 4px rgba(23, 93, 220, 0.3);
                transition: transform 0.1s ease, box-shadow 0.1s ease;
              " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 3px 6px rgba(23, 93, 220, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(23, 93, 220, 0.3)';">この駅を指定</a>
            </div>
          </div>
        `;
        circle.bindPopup(popupContent, {
          closeButton: true,
          offset: [0, -5]
        });
        
        this.stationDotsLayer.addLayer(circle);
        
        // 駅名ラベル
        if (shouldShowLabels) {
          const label = L.marker([s.lat, s.lng], {
            icon: L.divIcon({
              className: 'station-label',
              html: `<div style="
                position: absolute;
                left: -100px;
                top: 8px;
                width: 200px;
                font-size: 16px;
                font-weight: 700;
                color: #2255CC;
                text-align: center;
                text-shadow: 
                  -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff,
                  -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff,
                  -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
                white-space: nowrap;
                pointer-events: none;
              ">${s.name}</div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            }),
            pane: 'stationDotsPane',
            interactive: false
          });
          this.stationDotsLayer.addLayer(label);
        }
      }
    });
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
}
