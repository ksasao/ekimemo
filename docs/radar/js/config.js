// アプリケーション設定

const CONFIG = {
  // マップの初期設定
  map: {
    center: [35.681236, 139.767125], // 東京駅
    zoom: 11,
    maxZoom: 19,
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors / 駅情報は <a href="https://github.com/Seo-4d696b75/station_database/blob/main/README.md" target="_blank" rel="noopener noreferrer">駅データ</a> を利用しています'
  },

  // レイヤーのz-index
  zIndex: {
    grid: 400,
    voronoi: 500,
    stationDots: 600,
    stationMarker: 650
  },

  // ボロノイ図設定
  voronoi: {
    enabled: false,           // デフォルトでは非表示
    lineWeight: 2,
    lineOpacity: 0.6
  },

  // グリッド描画設定
  drawing: {
    gridSizes: [16, 8, 4, 2], // 段階的に細かくするグリッドサイズ
    progressiveDelay: 300,     // 次の段階への遅延(ms)
    frameTime: 16              // 1フレームの最大処理時間(ms)
  },

  // 駅ドット表示設定
  stationDots: {
    minZoom: 11,              // 駅ドットを表示する最小ズームレベル
    labelZoom: 13,            // 駅名を表示する最小ズームレベル
    maxLabelCount: 200        // 駅名を表示する最大駅数
  },

  // デバウンス設定
  debounce: {
    mapRedraw: 180,           // マップ移動後の再描画遅延(ms)
    paramRedraw: 1000,        // パラメータ変更後の再描画遅延(ms)
    searchPan: 1000,          // 検索後の自動パン遅延(ms)
    incrementalSearch: 350    // インクリメンタルサーチ遅延(ms)
  },

  // 位置情報取得設定
  location: {
    updateInterval: 1000,     // 位置情報の更新間隔(ms)
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  },

  // 検知数の設定
  detection: {
    min: 1,
    max: 50,
    default: 18,
    step: 1
  },

  // 初期表示駅
  initialStation: '品川',

  // 検索設定
  search: {
    maxCandidates: 200,
    defaultCandidates: 100
  },

  debug: {
    logCullResult: false
  }
};

// 県コードから県名への変換マップ
const PREFECTURE_NAMES = {
  1: '北海道', 2: '青森県', 3: '岩手県', 4: '宮城県', 5: '秋田県', 6: '山形県', 7: '福島県',
  8: '茨城県', 9: '栃木県', 10: '群馬県', 11: '埼玉県', 12: '千葉県', 13: '東京都', 14: '神奈川県',
  15: '新潟県', 16: '富山県', 17: '石川県', 18: '福井県', 19: '山梨県', 20: '長野県',
  21: '岐阜県', 22: '静岡県', 23: '愛知県', 24: '三重県', 25: '滋賀県', 26: '京都府', 27: '大阪府',
  28: '兵庫県', 29: '奈良県', 30: '和歌山県', 31: '鳥取県', 32: '島根県', 33: '岡山県', 34: '広島県',
  35: '山口県', 36: '徳島県', 37: '香川県', 38: '愛媛県', 39: '高知県', 40: '福岡県',
  41: '佐賀県', 42: '長崎県', 43: '熊本県', 44: '大分県', 45: '宮崎県', 46: '鹿児島県', 47: '沖縄県'
};
