// メインアプリケーション

class RadarApp {
  constructor() {
    this.stationManager = new StationManager();
    this.mapManager = null;
    this.locationManager = null;
    this.drawingManager = null;
    this.uiManager = null;
    this.voronoiManager = null;
  }

  // アプリケーションを初期化
  async initialize() {
    try {
      // 駅データを読み込む
      await this.stationManager.loadData();

      // UIマネージャーを初期化
      this.uiManager = new UIManager(this.stationManager);
      this.uiManager.initialize();

      // マップマネージャーを初期化
      this.mapManager = new MapManager(this.stationManager, this.uiManager);
      const map = this.mapManager.initialize();

      // 描画マネージャーを初期化
      this.drawingManager = new DrawingManager(map, this.stationManager);
      this.drawingManager.setOverlayLayer(this.mapManager.overlayLayer);

      // 位置情報マネージャーを初期化
      this.locationManager = new LocationManager(map, this.stationManager, this.uiManager, this.mapManager);
      this.locationManager.setButton(document.getElementById('currentLocationBtn'));
      this.mapManager.setLocationManager(this.locationManager);

      // ボロノイマネージャーを初期化
      this.voronoiManager = new VoronoiManager(map, this.stationManager);
      this.voronoiManager.initialize();

      // イベントリスナーを設定
      this.setupEventListeners();

      // ボロノイ図の状態を復元
      this.restoreVoronoiState();

      // URL共有状態を安全に適用（適用後はURLを正規化）
      const hasShareParams = this.hasShareStateParamsInUrl();
      const sharedState = this.parseSharedStateFromUrl();
      if (sharedState) {
        this.applySharedState(sharedState);
      } else {
        // 初期駅を設定
        this.selectInitialStation();
      }
      if (hasShareParams) {
        this.normalizeUrlWithoutState();
      }

    } catch (error) {
      alert(error.message);
      console.error(error);
    }
  }

  // イベントリスナーを設定
  setupEventListeners() {
    // マップイベント
    this.mapManager.setupEventListeners(
      () => {
        // マップ操作開始時
        this.drawingManager.cancelProgressiveDraw();
      },
      () => {
        // マップ操作終了時
        const currentStationIndex = this.uiManager.getCurrentStationIndex();
        if (currentStationIndex == null) return;
        this.mapManager.scheduleMapRedraw(() => {
          this.redrawOverlayAndStations();
          this.voronoiManager.update();
        });
      }
    );

    // UIイベント
    this.uiManager.setupEventListeners({
      onSearchInput: () => {
        this.mapManager.scheduleSearchPan(() => {
          const station = this.uiManager.getSelectedStation();
          if (station) {
            this.mapManager.placeStationMarker(station, true);
          }
        });
      },
      onSearchPanCancel: () => {
        // 検索パンをキャンセル（MapManager内で処理済み）
      },
      onStationSelect: (station) => {
        this.mapManager.placeStationMarker(station, true);
        this.fitMapToOverlay();
        this.locationManager.refreshLocationRank();
      },
      onDetectionCountChange: () => {
        this.mapManager.scheduleParamRedraw(() => {
          this.redrawOverlay();
          this.locationManager.refreshLocationRank();
          this.fitMapToOverlay();
        });
      },
      onDrawButtonClick: (station) => {
        this.mapManager.placeStationMarker(station, true);
        this.fitMapToOverlay();
        this.locationManager.refreshLocationRank();
      },
      onShareStateClick: async () => {
        await this.copyShareUrlToClipboard();
      }
    });

    // ボロノイ図トグル
    const voronoiToggle = document.getElementById('voronoiToggle');
    if (voronoiToggle) {
      voronoiToggle.addEventListener('change', () => {
        this.voronoiManager.toggleVisibility();
      });
    }
  }

  // ボロノイ図の状態を復元
  restoreVoronoiState() {
    const voronoiToggle = document.getElementById('voronoiToggle');
    if (voronoiToggle && this.voronoiManager) {
      const isVisible = this.voronoiManager.getVisibility();
      voronoiToggle.checked = isVisible;
      
      // 状態がtrueの場合、ボロノイ図を表示
      if (isVisible) {
        if (!this.voronoiManager.voronoiLayer._map) {
          this.voronoiManager.voronoiLayer.addTo(this.mapManager.map);
        }
        this.voronoiManager.drawVoronoi();
      }
    }
  }

  // 初期駅を設定
  selectInitialStation() {
    const station = this.uiManager.selectInitialStation(CONFIG.initialStation);
    if (station) {
      this.mapManager.placeStationMarker(station, true);
      this.redrawOverlayAndStations();
      this.fitMapToOverlay();
      this.locationManager.refreshLocationRank();
    }
  }

  // オーバーレイと駅ドットを再描画
  redrawOverlayAndStations() {
    this.redrawOverlay();
    this.updateStationDots();
  }

  // オーバーレイを再描画
  redrawOverlay() {
    const station = this.uiManager.getSelectedStation();
    const detectionCount = this.uiManager.getDetectionCount();
    if (station) {
      this.drawingManager.drawOverlay(station, detectionCount);
    }
  }

  // 駅ドットを更新
  updateStationDots() {
    const currentStationIndex = this.uiManager.getCurrentStationIndex();
    this.mapManager.updateStationDots(currentStationIndex);
  }

  // 駅を名前で選択（グローバル関数として呼ばれる）
  selectStationByName(stationName) {
    this.uiManager.selectStationByName(stationName);
    const station = this.uiManager.getSelectedStation();
    if (station) {
      this.mapManager.placeStationMarker(station, true);
      this.redrawOverlayAndStations();
      this.locationManager.refreshLocationRank();
      this.fitMapToOverlay();
    }
  }

  fitMapToOverlay() {
    if (!this.mapManager || !this.uiManager) {
      return;
    }

    const station = this.uiManager.getSelectedStation();
    if (!station) {
      return;
    }

    const detectionCount = this.uiManager.getDetectionCount();
    this.mapManager.fitOverlayToStation(station, detectionCount);
  }

  buildShareUrl() {
    const station = this.uiManager.getSelectedStation();
    if (!station || !this.mapManager || !this.mapManager.map || !this.voronoiManager) {
      return null;
    }

    const center = this.mapManager.map.getCenter();
    const zoom = this.mapManager.map.getZoom();
    const detectionCount = this.uiManager.getDetectionCount();
    const voronoiVisible = this.voronoiManager.getVisibility();

    const params = new URLSearchParams();
    params.set('lat', Number(center.lat).toFixed(6));
    params.set('lng', Number(center.lng).toFixed(6));
    params.set('z', Number(zoom).toFixed(2));
    params.set('sid', String(station.id));
    params.set('n', String(detectionCount));
    params.set('v', voronoiVisible ? '1' : '0');

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  isMobileDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }

    const ua = navigator.userAgent || '';
    const byUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
    const byPointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    return byUA || byPointer;
  }

  async copyShareUrlToClipboard() {
    const shareUrl = this.buildShareUrl();
    if (!shareUrl) {
      alert('共有URLを作成できませんでした。駅を選択してください。');
      return;
    }
    const selectedStation = this.uiManager ? this.uiManager.getSelectedStation() : null;
    const shareText = selectedStation && selectedStation.name ? selectedStation.name : '';

    const isMobile = this.isMobileDevice();

    if (isMobile) {
      if (navigator.share && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            text: shareText,
            url: shareUrl
          });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') {
            return;
          }
          console.warn('native share failed:', e);
        }
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert('シェアURLをクリップボードにコピーしました。');
          return;
        } catch (e) {
          console.warn('clipboard write failed:', e);
        }
      }
    } else {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          alert('シェアURLをクリップボードにコピーしました。');
          return;
        } catch (e) {
          console.warn('clipboard write failed:', e);
        }
      }

      if (navigator.share && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            text: shareText,
            url: shareUrl
          });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') {
            return;
          }
          console.warn('native share failed:', e);
        }
      }
    }

    prompt('このURLをコピーしてください', shareUrl);
  }

  parseSharedStateFromUrl() {
    const search = window.location.search || '';
    if (!search || search === '?') {
      return null;
    }

    if (search.length > 512) {
      return null;
    }

    const params = new URLSearchParams(search);
    const hasShareKey = ['lat', 'lng', 'z', 'sid', 'n', 'v'].some((key) => params.has(key));
    if (!hasShareKey) {
      return null;
    }

    const parsed = {};

    const parseFiniteNumber = (raw) => {
      if (typeof raw !== 'string' || raw.length === 0 || raw.length > 32) {
        return null;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };

    const rawLat = params.get('lat');
    const rawLng = params.get('lng');
    const rawZoom = params.get('z');

    if (rawLat !== null && rawLng !== null && rawZoom !== null) {
      const lat = parseFiniteNumber(rawLat);
      const lng = parseFiniteNumber(rawLng);
      const zoom = parseFiniteNumber(rawZoom);
      if (
        lat !== null && lng !== null && zoom !== null &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180 &&
        zoom >= 0 && zoom <= CONFIG.map.maxZoom
      ) {
        parsed.mapView = { lat, lng, zoom };
      }
    }

    const rawStationId = params.get('sid');
    if (rawStationId !== null && /^\d{1,10}$/.test(rawStationId)) {
      const stationId = Number(rawStationId);
      if (Number.isSafeInteger(stationId) && this.stationManager.getStationById(stationId)) {
        parsed.stationId = stationId;
      }
    }

    const rawDetectionCount = params.get('n');
    if (rawDetectionCount !== null && /^\d{1,3}$/.test(rawDetectionCount)) {
      const count = Number(rawDetectionCount);
      if (Number.isSafeInteger(count)) {
        parsed.detectionCount = Math.min(CONFIG.detection.max, Math.max(CONFIG.detection.min, count));
      }
    }

    const rawVoronoi = params.get('v');
    if (rawVoronoi === '0' || rawVoronoi === '1') {
      parsed.voronoiVisible = rawVoronoi === '1';
    }

    return Object.keys(parsed).length > 0 ? parsed : null;
  }

  hasShareStateParamsInUrl() {
    const search = window.location.search || '';
    if (!search || search === '?') {
      return false;
    }

    if (search.length > 4096) {
      return true;
    }

    const params = new URLSearchParams(search);
    return ['lat', 'lng', 'z', 'sid', 'n', 'v'].some((key) => params.has(key));
  }

  normalizeUrlWithoutState() {
    const cleanedUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState(null, '', cleanedUrl);
  }

  setVoronoiVisibility(visible) {
    if (!this.voronoiManager) {
      return;
    }

    const target = Boolean(visible);
    if (this.voronoiManager.getVisibility() !== target) {
      this.voronoiManager.toggleVisibility();
    }

    const voronoiToggle = document.getElementById('voronoiToggle');
    if (voronoiToggle) {
      voronoiToggle.checked = this.voronoiManager.getVisibility();
    }
  }

  applySharedState(sharedState) {
    if (!sharedState || typeof sharedState !== 'object') {
      return;
    }

    if (typeof sharedState.stationId === 'number') {
      this.uiManager.selectStationById(sharedState.stationId);
    }

    if (typeof sharedState.detectionCount === 'number') {
      this.uiManager.setDetectionCount(sharedState.detectionCount);
    }

    if (typeof sharedState.voronoiVisible === 'boolean') {
      this.setVoronoiVisibility(sharedState.voronoiVisible);
    }

    const station = this.uiManager.getSelectedStation();
    if (station) {
      this.mapManager.placeStationMarker(station, false);
      this.redrawOverlayAndStations();
      this.locationManager.refreshLocationRank();
    }

    if (sharedState.mapView && this.mapManager && this.mapManager.map) {
      this.mapManager.map.setView([sharedState.mapView.lat, sharedState.mapView.lng], sharedState.mapView.zoom);
    }

    this.voronoiManager.update();
  }
}

// アプリケーションを起動
let app;
document.addEventListener('DOMContentLoaded', async () => {
  app = new RadarApp();
  window.app = app; // グローバルアクセス用
  await app.initialize();
});
