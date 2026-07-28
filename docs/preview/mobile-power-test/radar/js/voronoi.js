// ボロノイ図描画管理（GeoJSONデータを使用）

<<<<<<< HEAD
=======
const VORONOI_TOGGLE_STORAGE_KEY = 'voronoiToggleState';
const VORONOI_POLYLINE_STYLE = {
  polygon: {
    color: '#0074D9',
    weight: 2,
    opacity: 0.5,
  },
  multipolygon: {
    color: '#888888',
    weight: 1,
    opacity: 0.5,
  },
};

>>>>>>> mobile-power-test
class VoronoiManager {
  constructor(map, stationManager) {
    this.map = map;
    this.stationManager = stationManager;
    this.voronoiLayer = null;
    this.isVisible = false;
    this.hasRendered = false;
  }

  // ボロノイレイヤーを初期化
  initialize() {
    this.voronoiLayer = L.layerGroup();
    this.isVisible = !!(CONFIG && CONFIG.voronoi && CONFIG.voronoi.enabled);
    
    // localStorageから状態を復元（保存値があれば最優先）
<<<<<<< HEAD
    try {
      const savedState = localStorage.getItem('voronoiToggleState');
      if (savedState !== null && (savedState === 'true' || savedState === 'false')) {
        this.isVisible = savedState === 'true';
      }
    } catch (e) {
      // localStorageへのアクセスが拒否された場合はCONFIGの初期値を使用
      console.warn('localStorage access denied:', e);
=======
    const savedState = this.loadVisibilityState();
    if (savedState !== null) {
      this.isVisible = savedState;
>>>>>>> mobile-power-test
    }
    
    return this.voronoiLayer;
  }

  // ボロノイ図の表示/非表示を切り替え
  toggleVisibility() {
    this.isVisible = !this.isVisible;
    
    // localStorageに状態を保存（エラーハンドリングを追加）
<<<<<<< HEAD
    try {
      localStorage.setItem('voronoiToggleState', this.isVisible.toString());
    } catch (e) {
      // localStorageへのアクセスが拒否された場合は無視
      console.warn('localStorage access denied:', e);
    }
=======
    this.saveVisibilityState(this.isVisible);
>>>>>>> mobile-power-test
    
    if (this.isVisible) {
      if (!this.voronoiLayer._map) {
        this.voronoiLayer.addTo(this.map);
      }
      this.drawVoronoi({ force: false });
    } else {
      if (this.voronoiLayer._map) {
        this.voronoiLayer.remove();
      }
      this.voronoiLayer.clearLayers();
      this.hasRendered = false;
    }
    
    return this.isVisible;
  }

  // ボロノイ図を描画（GeoJSONデータを使用）
  drawVoronoi(options = {}) {
    if (!this.isVisible) return;

    const force = Boolean(options.force);
    if (!force && this.hasRendered && this.voronoiLayer && this.voronoiLayer.getLayers().length > 0) {
      return;
    }

    this.voronoiLayer.clearLayers();

    // 各駅のvoronoiデータを描画
    this.stationManager.stations.forEach((station) => {
<<<<<<< HEAD
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
          }
        });
      }
=======
      this.drawStationVoronoiGeometry(station);
>>>>>>> mobile-power-test
    });

    this.hasRendered = true;
  }

  // ボロノイ図を更新
  update() {
    // ボロノイ図はLeafletの座標変換で追従するため再描画は不要。
    return;
  }

  // 表示状態を取得
  getVisibility() {
    return this.isVisible;
  }
<<<<<<< HEAD
=======

  loadVisibilityState() {
    try {
      const savedState = localStorage.getItem(VORONOI_TOGGLE_STORAGE_KEY);
      if (savedState === 'true' || savedState === 'false') {
        return savedState === 'true';
      }
    } catch (e) {
      console.warn('localStorage access denied:', e);
    }

    return null;
  }

  saveVisibilityState(value) {
    try {
      localStorage.setItem(VORONOI_TOGGLE_STORAGE_KEY, String(Boolean(value)));
    } catch (e) {
      console.warn('localStorage access denied:', e);
    }
  }

  drawStationVoronoiGeometry(station) {
    // voronoiデータが存在しない場合はスキップ
    if (!station || !station.voronoi || !station.voronoi.geometry) {
      return;
    }

    const geometry = station.voronoi.geometry;
    if (geometry.type === 'Polygon' && geometry.coordinates && geometry.coordinates.length > 0) {
      this.drawVoronoiPolygon(geometry.coordinates[0], VORONOI_POLYLINE_STYLE.polygon);
      return;
    }

    if (geometry.type === 'MultiPolygon' && geometry.coordinates) {
      geometry.coordinates.forEach((polygon) => {
        this.drawVoronoiPolygon(polygon[0], VORONOI_POLYLINE_STYLE.multipolygon);
      });
    }
  }

  drawVoronoiPolygon(coords, style) {
    if (!coords || coords.length < 3) {
      return;
    }

    const latlngs = coords.map((coord) => [coord[1], coord[0]]);
    const polyline = L.polyline(latlngs, {
      color: style.color,
      weight: style.weight,
      opacity: style.opacity,
      pane: 'voronoiPane',
      interactive: false
    });

    this.voronoiLayer.addLayer(polyline);
  }
>>>>>>> mobile-power-test
}
