// UI管理とイベントハンドリング

class UIManager {
  constructor(stationManager) {
    this.stationManager = stationManager;
    this.currentStationIndex = null;
    this.lastSearchValue = '';
    this.incrementalSearchTimerId = null;
    
    // DOM要素
    this.searchInput = document.getElementById('searchInput');
    this.stationSelect = document.getElementById('stationSelect');
    this.nInput = document.getElementById('nInput');
    this.drawButton = document.getElementById('drawButton');
    this.selectedStationLabel = document.getElementById('selectedStationLabel');
  }

  // UI要素を初期化
  initialize() {
    this.fillDetectionCountSelect();
  }

  // 検知数セレクトボックスを設定
  fillDetectionCountSelect() {
    const { min, max, default: defaultValue, step } = CONFIG.detection;
    for (let v = min; v <= max; v += step) {
      const opt = document.createElement('option');
      opt.value = String(v);
      opt.textContent = `${v} 駅`;
      if (v === defaultValue) {
        opt.selected = true;
      }
      this.nInput.appendChild(opt);
    }
  }

  // イベントリスナーを設定
  setupEventListeners(callbacks) {
    // 検索入力
    this.searchInput.addEventListener('input', () => {
      const q = this.searchInput.value.trim();
      
      if (this.incrementalSearchTimerId !== null) {
        clearTimeout(this.incrementalSearchTimerId);
        this.incrementalSearchTimerId = null;
      }

      if (q === '') {
        this.lastSearchValue = '';
        if (callbacks.onSearchPanCancel) {
          callbacks.onSearchPanCancel();
        }
        return;
      }

      const isDeletion = q.length < this.lastSearchValue.length;
      this.lastSearchValue = q;

      if (isDeletion) {
        this.incrementalSearchTimerId = setTimeout(() => {
          this.updateStationCandidates(q);
          this.incrementalSearchTimerId = null;
        }, CONFIG.debounce.incrementalSearch);
      } else {
        this.updateStationCandidates(q);
      }

      if (callbacks.onSearchInput) {
        callbacks.onSearchInput();
      }
    });

    // 候補選択
    this.stationSelect.addEventListener('change', () => {
      const st = this.getSelectedStation();
      if (!st) return;
      this.currentStationIndex = st.index;
      this.updateSelectedStationLabel();
      if (callbacks.onStationSelect) {
        callbacks.onStationSelect(st);
      }
    });

    // 検知数変更
    this.nInput.addEventListener('input', () => {
      if (callbacks.onDetectionCountChange) {
        callbacks.onDetectionCountChange();
      }
    });

    // 描画ボタン
    this.drawButton.addEventListener('click', () => {
      const st = this.getSelectedStation();
      if (!st) {
        alert('駅を選択してください。');
        return;
      }
      this.currentStationIndex = st.index;
      this.updateSelectedStationLabel();
      if (callbacks.onDrawButtonClick) {
        callbacks.onDrawButtonClick(st);
      }
    });
  }

  // 駅候補を更新
  updateStationCandidates(query) {
    const list = this.stationManager.searchStations(query);
    
    this.stationSelect.innerHTML = '';
    const fragment = document.createDocumentFragment();

    list.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      fragment.appendChild(opt);
    });

    this.stationSelect.appendChild(fragment);

    if (list.length > 0) {
      this.stationSelect.value = list[0].id;
      this.currentStationIndex = list[0].index;
      this.updateSelectedStationLabel();
    } else {
      this.currentStationIndex = null;
      this.updateSelectedStationLabel();
    }
  }

  // 選択中の駅を取得
  getSelectedStation() {
    const id = Number(this.stationSelect.value);
    return this.stationManager.getStationById(id);
  }

  // 選択中の駅のインデックスを取得
  getCurrentStationIndex() {
    return this.currentStationIndex;
  }

  // 選択中の駅ラベルを更新
  updateSelectedStationLabel() {
    const st = this.getSelectedStation();
    this.selectedStationLabel.textContent = st
      ? `選択中の駅: ${st.name}`
      : '選択中の駅: なし';
  }

  // 検知数を取得
  getDetectionCount() {
    return Number(this.nInput.value) || CONFIG.detection.default;
  }

  // 駅を名前で選択
  selectStationByName(stationName) {
    this.searchInput.value = stationName;
    this.updateStationCandidates(stationName);
    this.updateSelectedStationLabel();
  }

  // 初期駅を設定
  selectInitialStation(stationName) {
    const st = this.stationManager.findStationByName(stationName);
    if (!st) return null;

    this.searchInput.value = '';
    this.stationSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = st.name;
    this.stationSelect.appendChild(opt);

    this.stationSelect.value = st.id;
    this.currentStationIndex = st.index;
    this.updateSelectedStationLabel();

    return st;
  }
}
