// UI管理とイベントハンドリング

class UIManager {
  constructor(stationManager) {
    this.stationManager = stationManager;
    this.currentStationIndex = null;
    this.lastSearchValue = '';
    this.incrementalSearchTimerId = null;
    this.currentLocationRank = null;
    this.notificationRetryTimer = null;
    this.notificationReady = false;
    this.audioContext = null;
    this.notificationAudioReady = false;
    this.notificationAudioElement = null;
    this.notificationAudioDataUri = './audio/notification-tone.wav';
    this.audioUnlockBound = false;
    
    // DOM要素
    this.searchInput = document.getElementById('searchInput');
    this.searchClearButton = document.getElementById('searchClearBtn');
    this.stationSelect = document.getElementById('stationSelect');
    this.nInput = document.getElementById('nInput');
    this.drawButton = document.getElementById('drawButton');
    this.shareStateButton = document.getElementById('shareStateBtn');
    this.nearestStationNotifyToggle = document.getElementById('nearestStationNotifyToggle');
    this.highFrequencyGpsToggle = document.getElementById('highFrequencyGpsToggle');
    this.stationAttrColorToggle = document.getElementById('stationAttrColorToggle');
    this.selectedStationLabel = document.getElementById('selectedStationLabel');
    this.nearestStationNotice = document.getElementById('nearestStationNotice');
    this.nearestStationNoticeText = document.getElementById('nearestStationNoticeText');
    this.nearestStationNoticeTimer = null;
    this.previewNotificationSoundButton = document.getElementById('previewNotificationSoundBtn');
    this.appContainer = document.getElementById('app');
    this.controlsContainer = document.getElementById('controls');
    this.controlsDrawerToggle = document.getElementById('controlsDrawerToggle');
    this.controlsDrawerCloseButton = document.getElementById('controlsDrawerCloseBtn');
    this.mobileDrawerMediaQuery = window.matchMedia('(max-width: 639px)');
    this.isMobileDrawerOpen = false;
  }

  // UI要素を初期化
  initialize() {
    this.fillDetectionCountSelect();
    this.setNearestStationNotificationEnabled(CONFIG?.nearestStationNotification?.enabledByDefault !== false);
    this.setHighFrequencyGpsEnabled(false);
    this.setStationAttrColorEnabled(Boolean(CONFIG?.stationDots?.colorByAttrEnabledByDefault));
    this.initializeMobileDrawer();
    this.initializeNotificationSupport();
    this.initializeAudioUnlockListeners();
    if (this.searchClearButton) {
      this.searchClearButton.addEventListener('click', () => {
        this.handleSearchClear();
      });
    }
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
      this.closeMobileDrawer();
      if (callbacks.onDrawButtonClick) {
        callbacks.onDrawButtonClick(st);
      }
    });

    // 状態共有ボタン
    if (this.shareStateButton) {
      this.shareStateButton.addEventListener('click', () => {
        if (callbacks.onShareStateClick) {
          callbacks.onShareStateClick();
        }
      });
    }

    if (this.nearestStationNotifyToggle) {
      this.nearestStationNotifyToggle.addEventListener('change', async () => {
        if (this.nearestStationNotifyToggle.checked) {
          await this.ensureBrowserNotificationPermission();
          await this.prepareNotificationAudio();
        }
        if (!this.nearestStationNotifyToggle.checked) {
          this.hideNearestStationNotification();
        }
        if (callbacks.onNearestStationNotifySettingChange) {
          callbacks.onNearestStationNotifySettingChange(this.nearestStationNotifyToggle.checked);
        }
      });
    }

    if (this.highFrequencyGpsToggle) {
      this.highFrequencyGpsToggle.addEventListener('change', () => {
        if (callbacks.onHighFrequencyGpsSettingChange) {
          callbacks.onHighFrequencyGpsSettingChange(this.highFrequencyGpsToggle.checked);
        }
      });
    }

    if (this.stationAttrColorToggle) {
      this.stationAttrColorToggle.addEventListener('change', () => {
        if (callbacks.onStationAttrColorSettingChange) {
          callbacks.onStationAttrColorSettingChange(this.stationAttrColorToggle.checked);
        }
      });
    }

    if (this.previewNotificationSoundButton) {
      this.previewNotificationSoundButton.addEventListener('click', async () => {
        await this.prepareNotificationAudio();
        this.playNotificationSound();
      });
    }
  }

  // 駅候補を更新
  updateStationCandidates(query) {
    const list = this.stationManager.searchStations(query);
    
    // innerHTML の代わりに個別に子要素を削除（XSS対策）
    while (this.stationSelect.firstChild) {
      this.stationSelect.removeChild(this.stationSelect.firstChild);
    }
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
    if (!st) {
      this.selectedStationLabel.textContent = '選択中の駅: なし';
      return;
    }

    const rankText = this.currentLocationRank != null
      ? ` (現在地から${this.currentLocationRank.toLocaleString()}駅目)`
      : '';

    this.selectedStationLabel.textContent = `選択中の駅: ${st.name}${rankText}`;
  }

  // 検知数を取得
  getDetectionCount() {
    if (!this.nInput) {
      return CONFIG.detection.default;
    }

    const rawValue = Number(this.nInput.value);
    if (!Number.isFinite(rawValue)) {
      return CONFIG.detection.default;
    }

    const { min, max } = CONFIG.detection;
    return Math.min(max, Math.max(min, rawValue));
  }

  setLocationRank(rank) {
    this.currentLocationRank = rank != null ? rank : null;
    this.updateSelectedStationLabel();
  }

  handleSearchClear() {
    if (!this.searchInput) return;

    const hadValue = this.searchInput.value.length > 0;
    this.searchInput.value = '';
    this.lastSearchValue = '';

    // 既存の入力ハンドラを再利用して状態をリセット
    const event = new Event('input', { bubbles: true });
    this.searchInput.dispatchEvent(event);

    if (!hadValue && typeof this.searchInput.focus === 'function') {
      this.searchInput.focus();
    } else if (typeof this.searchInput.focus === 'function') {
      // valueがあった場合もフォーカスを戻す
      this.searchInput.focus();
    }
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
    // innerHTML の代わりに個別に子要素を削除（XSS対策）
    while (this.stationSelect.firstChild) {
      this.stationSelect.removeChild(this.stationSelect.firstChild);
    }
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.textContent = st.name;
    this.stationSelect.appendChild(opt);

    this.stationSelect.value = st.id;
    this.currentStationIndex = st.index;
    this.updateSelectedStationLabel();

    return st;
  }

  // 駅IDで駅を選択
  selectStationById(stationId) {
    const station = this.stationManager.getStationById(stationId);
    if (!station || !this.stationSelect) {
      return null;
    }

    while (this.stationSelect.firstChild) {
      this.stationSelect.removeChild(this.stationSelect.firstChild);
    }

    const option = document.createElement('option');
    option.value = station.id;
    option.textContent = station.name;
    this.stationSelect.appendChild(option);

    this.stationSelect.value = station.id;
    this.currentStationIndex = station.index;
    this.updateSelectedStationLabel();

    return station;
  }

  // 検知数を設定（範囲外はクランプ）
  setDetectionCount(count) {
    if (!this.nInput) {
      return CONFIG.detection.default;
    }

    const numeric = Number(count);
    if (!Number.isFinite(numeric)) {
      this.nInput.value = String(CONFIG.detection.default);
      return CONFIG.detection.default;
    }

    const { min, max } = CONFIG.detection;
    const clamped = Math.min(max, Math.max(min, Math.round(numeric)));
    this.nInput.value = String(clamped);
    return clamped;
  }

  setNearestStationNotificationEnabled(enabled) {
    if (!this.nearestStationNotifyToggle) {
      return;
    }
    this.nearestStationNotifyToggle.checked = Boolean(enabled);
  }

  isNearestStationNotificationEnabled() {
    if (!this.nearestStationNotifyToggle) {
      return true;
    }
    return this.nearestStationNotifyToggle.checked;
  }

  setStationAttrColorEnabled(enabled) {
    if (!this.stationAttrColorToggle) {
      return;
    }
    this.stationAttrColorToggle.checked = Boolean(enabled);
  }

  setHighFrequencyGpsEnabled(enabled) {
    if (!this.highFrequencyGpsToggle) {
      return;
    }
    this.highFrequencyGpsToggle.checked = Boolean(enabled);
  }

  isHighFrequencyGpsEnabled() {
    if (!this.highFrequencyGpsToggle) {
      return false;
    }
    return this.highFrequencyGpsToggle.checked;
  }

  isStationAttrColorEnabled() {
    if (!this.stationAttrColorToggle) {
      return Boolean(CONFIG?.stationDots?.colorByAttrEnabledByDefault);
    }
    return this.stationAttrColorToggle.checked;
  }

  initializeNotificationSupport() {
    this.notificationReady = false;
    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker is not supported in this browser.');
      return;
    }

    if (!window.isSecureContext) {
      console.warn('[PWA] Secure context is required for Service Worker registration.');
      return;
    }

    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
      console.info('[PWA] Service Worker registered:', registration.scope);
      return navigator.serviceWorker.ready;
    }).then(() => {
      this.notificationReady = true;
    }).catch((error) => {
      this.notificationReady = false;
      console.error('[PWA] Service Worker registration failed:', error);
    });
  }

  initializeAudioUnlockListeners() {
    if (this.audioUnlockBound) {
      return;
    }

    const unlockAudio = () => {
      this.audioUnlockBound = true;
      void this.prepareNotificationAudio();
    };

    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('mousedown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
  }

  initializeNotificationAudio() {
    if (this.notificationAudioElement) {
      return this.notificationAudioElement;
    }

    const audio = new Audio();
    audio.src = this.notificationAudioDataUri;
    audio.preload = 'auto';
    audio.volume = 0.8;
    audio.muted = false;
    audio.load();
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    this.notificationAudioElement = audio;
    return audio;
  }

  async prepareNotificationAudio() {
    if (this.notificationAudioReady) {
      return true;
    }

    this.initializeNotificationAudio();

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return false;
    }

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.notificationAudioReady = true;
      return true;
    } catch (error) {
      console.warn('Failed to prepare notification audio:', error);
      return false;
    }
  }

  playNotificationSound() {
    this.initializeNotificationAudio();

    if (this.notificationAudioElement) {
      try {
        this.notificationAudioElement.pause();
        this.notificationAudioElement.currentTime = 0;
        const playPromise = this.notificationAudioElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            this.playNotificationSoundViaWebAudio();
          });
        }
        return;
      } catch (error) {
        console.warn('Failed to play notification audio element:', error);
      }
    }

    this.playNotificationSoundViaWebAudio();
  }

  playNotificationSoundViaWebAudio() {
    if (!this.audioContext || !this.notificationAudioReady) {
      return;
    }

    const now = this.audioContext.currentTime;
    const fadeOutDuration = 0.035;
    const melody = [
      { frequency: 440.0, duration: 0.10, delay: 0.00 },
      { frequency: 349.23, duration: 0.11, delay: 0.10 },
      { frequency: 523.25, duration: 0.14, delay: 0.22 }
    ];

    const accompaniment = [
      { frequency: 261.63, duration: 0.22, delay: 0.00 },
      { frequency: 196.0, duration: 0.14, delay: 0.10 },
      { frequency: 392.0, duration: 0.10, delay: 0.22 }
    ];

    accompaniment.forEach((note) => {
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, now + note.delay);
      gainNode.gain.exponentialRampToValueAtTime(0.036, now + note.delay + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration + fadeOutDuration);

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.delay);
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 0.995, now + note.delay + note.duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start(now + note.delay);
      oscillator.stop(now + note.delay + note.duration + fadeOutDuration + 0.005);
    });

    melody.forEach((note) => {
      const gainNode = this.audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, now + note.delay);
      gainNode.gain.exponentialRampToValueAtTime(0.18, now + note.delay + 0.012);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.delay + note.duration + fadeOutDuration);

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.delay);
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 0.995, now + note.delay + note.duration);

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start(now + note.delay);
      oscillator.stop(now + note.delay + note.duration + fadeOutDuration + 0.005);
    });
  }

  isBrowserNotificationSupported() {
    return window.isSecureContext && typeof Notification !== 'undefined';
  }

  isIosHomeScreenStandalone() {
    const ua = navigator.userAgent || '';
    const isIosByUA = /iPhone|iPad|iPod/i.test(ua);
    const isIpadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isIos = isIosByUA || isIpadDesktopMode;

    if (!isIos) {
      return false;
    }

    const isStandaloneByNavigator = typeof navigator.standalone === 'boolean' && navigator.standalone;
    const isStandaloneByDisplayMode = typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches;

    return isStandaloneByNavigator || isStandaloneByDisplayMode;
  }

  async ensureBrowserNotificationPermission() {
    if (!this.isBrowserNotificationSupported()) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.warn('Notification permission request failed:', error);
      return false;
    }
  }

  triggerNearestStationSound() {
    if (!this.isNearestStationNotificationEnabled()) {
      return;
    }

    const playSound = () => {
      void this.prepareNotificationAudio().then(() => {
        this.playNotificationSound();
      });
    };

    if (document.visibilityState === 'hidden' || document.hidden) {
      window.setTimeout(playSound, 120);
    } else {
      playSound();
    }
  }

  showNearestStationNotification(stationName) {
    if (!this.isNearestStationNotificationEnabled() || !this.nearestStationNotice || !this.nearestStationNoticeText || !stationName) {
      return;
    }

    this.nearestStationNoticeText.textContent = '';
    this.nearestStationNoticeText.appendChild(document.createTextNode('最寄り駅が'));
    const stationNameNode = document.createElement('span');
    stationNameNode.className = 'nearest-station-name';
    stationNameNode.textContent = stationName;
    this.nearestStationNoticeText.appendChild(stationNameNode);
    this.nearestStationNoticeText.appendChild(document.createTextNode('に変更されました'));
    this.nearestStationNotice.hidden = false;
    this.nearestStationNotice.classList.remove('notice-emphasis');
    void this.nearestStationNotice.offsetWidth;
    this.nearestStationNotice.classList.add('is-visible');
    this.nearestStationNotice.classList.add('notice-emphasis');

    if (this.nearestStationNoticeTimer) {
      clearTimeout(this.nearestStationNoticeTimer);
      this.nearestStationNoticeTimer = null;
    }

    const durationMs = Math.max(1000, Number(CONFIG?.nearestStationNotification?.displayDurationMs) || 5000);
    this.nearestStationNoticeTimer = setTimeout(() => {
      this.hideNearestStationNotification();
    }, durationMs);

    this.triggerNearestStationSound();
  }

  showNearestStationBrowserNotification(stationName) {
    if (!stationName || !this.isNearestStationNotificationEnabled()) {
      return;
    }

    if (!this.isBrowserNotificationSupported()) {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    const preferOsNotificationOnly = this.isIosHomeScreenStandalone();

    const showLocalNotification = () => {
      if ('vibrate' in navigator) {
        navigator.vibrate([180, 80, 180]);
      }

      try {
        const notification = new Notification('最寄り駅が変更されました', {
          body: stationName,
          icon: 'favicon.png',
          tag: 'nearest-station-changed',
          renotify: true,
          silent: false,
        });

        setTimeout(() => {
          if (notification && typeof notification.close === 'function') {
            notification.close();
          }
        }, 4500);
      } catch (error) {
        console.warn('Failed to show browser notification:', error);
      }
    };

    const showServiceWorkerNotification = (options = {}) => {
      const allowLocalFallback = options.allowLocalFallback !== false;

      if (!this.notificationReady || !('serviceWorker' in navigator)) {
        return;
      }

      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification('最寄り駅が変更されました', {
          body: stationName,
          icon: 'favicon.png',
          tag: 'nearest-station-changed',
          renotify: true,
          requireInteraction: false,
        });
      }).catch(() => {
        if (allowLocalFallback) {
          showLocalNotification();
        }
      });
    };

    if (preferOsNotificationOnly) {
      showServiceWorkerNotification({ allowLocalFallback: false });
      return;
    }

    if (document.visibilityState === 'hidden' || document.hidden) {
      showServiceWorkerNotification();
    } else {
      showLocalNotification();
      showServiceWorkerNotification();
    }
  }

  hideNearestStationNotification() {
    if (!this.nearestStationNotice) {
      return;
    }

    if (this.nearestStationNoticeTimer) {
      clearTimeout(this.nearestStationNoticeTimer);
      this.nearestStationNoticeTimer = null;
    }

    this.nearestStationNotice.classList.remove('is-visible');
    this.nearestStationNotice.classList.remove('notice-emphasis');
    this.nearestStationNotice.hidden = true;
  }

  initializeMobileDrawer() {
    if (!this.controlsContainer || !this.controlsDrawerToggle || !this.controlsDrawerCloseButton || !this.appContainer) {
      return;
    }

    const syncByViewport = () => {
      if (this.mobileDrawerMediaQuery.matches) {
        this.closeMobileDrawer({ force: true, focusToggle: false });
      } else {
        this.isMobileDrawerOpen = true;
        this.appContainer.classList.remove('controls-open');
        this.controlsContainer.classList.remove('is-collapsed-mobile');
        this.controlsDrawerToggle.setAttribute('aria-expanded', 'false');
        this.controlsDrawerToggle.textContent = '条件を表示';
        this.controlsDrawerToggle.setAttribute('aria-label', '条件を開く');
        this.controlsDrawerCloseButton.setAttribute('aria-expanded', 'true');
        this.controlsDrawerCloseButton.textContent = '×';
        this.controlsDrawerCloseButton.setAttribute('aria-label', '条件を閉じる');
      }
    };

    this.controlsDrawerToggle.addEventListener('click', () => {
      if (!this.mobileDrawerMediaQuery.matches) return;

      this.openMobileDrawer();
    });

    this.controlsDrawerCloseButton.addEventListener('click', () => {
      this.closeMobileDrawer();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closeMobileDrawer();
      }
    });

    if (typeof this.mobileDrawerMediaQuery.addEventListener === 'function') {
      this.mobileDrawerMediaQuery.addEventListener('change', syncByViewport);
    } else {
      this.mobileDrawerMediaQuery.addListener(syncByViewport);
    }

    syncByViewport();
  }

  openMobileDrawer() {
    if (!this.mobileDrawerMediaQuery.matches) {
      return;
    }

    this.isMobileDrawerOpen = true;
    this.appContainer.classList.add('controls-open');
    this.controlsContainer.classList.remove('is-collapsed-mobile');
    this.controlsDrawerToggle.setAttribute('aria-expanded', 'true');
    this.controlsDrawerToggle.textContent = '条件を表示';
    this.controlsDrawerToggle.setAttribute('aria-label', '条件を開く');
    this.controlsDrawerCloseButton.setAttribute('aria-expanded', 'true');
    this.controlsDrawerCloseButton.textContent = '×';
    this.controlsDrawerCloseButton.setAttribute('aria-label', '条件を閉じる');
  }

  closeMobileDrawer(options = {}) {
    if (!this.mobileDrawerMediaQuery.matches && !options.force) {
      return;
    }

    this.isMobileDrawerOpen = false;
    this.appContainer.classList.remove('controls-open');
    this.controlsContainer.classList.add('is-collapsed-mobile');
    this.controlsDrawerToggle.setAttribute('aria-expanded', 'false');
    this.controlsDrawerToggle.textContent = '条件を表示';
    this.controlsDrawerToggle.setAttribute('aria-label', '条件を開く');
    this.controlsDrawerCloseButton.setAttribute('aria-expanded', 'false');
    this.controlsDrawerCloseButton.textContent = '×';
    this.controlsDrawerCloseButton.setAttribute('aria-label', '条件を閉じる');

    if (options.focusToggle && typeof this.controlsDrawerToggle.focus === 'function') {
      this.controlsDrawerToggle.focus();
    }
  }
}
