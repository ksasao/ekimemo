// メインアプリケーション

class RadarApp {
  constructor() {
    this.stationManager = new StationManager();
    this.mapManager = null;
    this.locationManager = null;
    this.drawingManager = null;
    this.uiManager = null;
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
      this.mapManager = new MapManager(this.stationManager);
      const map = this.mapManager.initialize();

      // 描画マネージャーを初期化
      this.drawingManager = new DrawingManager(map, this.stationManager);
      this.drawingManager.setOverlayLayer(this.mapManager.overlayLayer);

      // 位置情報マネージャーを初期化
      this.locationManager = new LocationManager(map);
      this.locationManager.setButton(document.getElementById('currentLocationBtn'));

      // イベントリスナーを設定
      this.setupEventListeners();

      // 初期駅を設定
      this.selectInitialStation();

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
      },
      onDetectionCountChange: () => {
        this.mapManager.scheduleParamRedraw(() => {
          this.redrawOverlay();
        });
      },
      onDrawButtonClick: (station) => {
        this.mapManager.placeStationMarker(station, true);
      }
    });
  }

  // 初期駅を設定
  selectInitialStation() {
    const station = this.uiManager.selectInitialStation(CONFIG.initialStation);
    if (station) {
      this.mapManager.placeStationMarker(station, true);
      this.redrawOverlayAndStations();
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
    }
  }
}

// アプリケーションを起動
let app;
document.addEventListener('DOMContentLoaded', async () => {
  app = new RadarApp();
  window.app = app; // グローバルアクセス用
  await app.initialize();
});
