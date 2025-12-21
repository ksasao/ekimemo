// ボロノイ図描画管理（GeoJSONデータを使用）

class VoronoiManager {
  constructor(map, stationManager) {
    this.map = map;
    this.stationManager = stationManager;
    this.voronoiLayer = null;
    this.isVisible = false;
  }

  // ボロノイレイヤーを初期化
  initialize() {
    this.voronoiLayer = L.layerGroup();
    
    // localStorageから状態を復元（サニタイズ処理を追加）
    try {
      const savedState = localStorage.getItem('voronoiToggleState');
      if (savedState !== null && (savedState === 'true' || savedState === 'false')) {
        this.isVisible = savedState === 'true';
      }
    } catch (e) {
      // localStorageへのアクセスが拒否された場合は無視
      console.warn('localStorage access denied:', e);
    }
    
    return this.voronoiLayer;
  }

  // ボロノイ図の表示/非表示を切り替え
  toggleVisibility() {
    this.isVisible = !this.isVisible;
    
    // localStorageに状態を保存（エラーハンドリングを追加）
    try {
      localStorage.setItem('voronoiToggleState', this.isVisible.toString());
    } catch (e) {
      // localStorageへのアクセスが拒否された場合は無視
      console.warn('localStorage access denied:', e);
    }
    
    if (this.isVisible) {
      if (!this.voronoiLayer._map) {
        this.voronoiLayer.addTo(this.map);
      }
      this.drawVoronoi();
    } else {
      if (this.voronoiLayer._map) {
        this.voronoiLayer.remove();
      }
      this.voronoiLayer.clearLayers();
    }
    
    return this.isVisible;
  }

  // ボロノイ図を描画（GeoJSONデータを使用）
  drawVoronoi() {
    if (!this.isVisible) return;

    this.voronoiLayer.clearLayers();

    const bounds = this.map.getBounds();
    let drawnCount = 0;

    // 各駅のvoronoiデータを描画
    this.stationManager.stations.forEach((station) => {
      // voronoiデータが存在しない場合はスキップ
      if (!station.voronoi || !station.voronoi.geometry) {
        return;
      }

      const geometry = station.voronoi.geometry;
      
      // Polygonの場合
      if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates.length > 0) {
        // 外側のリング（最初の座標配列）を取得
        const coords = geometry.coordinates[0];
        
        if (coords && coords.length >= 3) {
          // [lng, lat]の配列を[lat, lng]に変換
          const latlngs = coords.map(coord => [coord[1], coord[0]]);
          
          // ポリゴンの境界線のみを描画
          const polyline = L.polyline(latlngs, {
            color: '#0074D9',
            weight: 2,
            opacity: 0.5,
            pane: 'voronoiPane',
            interactive: false
          });
          
          this.voronoiLayer.addLayer(polyline);
          drawnCount++;
        }
      }
      // MultiPolygonの場合（もしあれば）
      else if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
        geometry.coordinates.forEach(polygon => {
          const coords = polygon[0];
          if (coords && coords.length >= 3) {
            const latlngs = coords.map(coord => [coord[1], coord[0]]);
            
            const polyline = L.polyline(latlngs, {
              color: '#888888',
              weight: 1,
              opacity: 0.5,
              pane: 'voronoiPane',
              interactive: false
            });
            
            this.voronoiLayer.addLayer(polyline);
            drawnCount++;
          }
        });
      }
    });
  }

  // ボロノイ図を更新
  update() {
    if (this.isVisible) {
      this.drawVoronoi();
    }
  }

  // 表示状態を取得
  getVisibility() {
    return this.isVisible;
  }
}
