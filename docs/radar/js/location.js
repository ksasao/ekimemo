// 位置情報取得管理

class LocationManager {
  constructor(map, stationManager, uiManager, mapManager) {
    this.map = map;
    this.stationManager = stationManager;
    this.uiManager = uiManager;
    this.mapManager = mapManager || null;
    this.currentLocationMarker = null;
    this.currentLocationAccuracyCircle = null;
    this.locationUpdateTimer = null;
    this.isTrackingLocation = false;
    this.button = null;
    this.lastLatLng = null;
    this.lastAccuracy = null;
    this.locationDotsRefreshed = false;
    this.lastNearestStationIndex = null;
    this.visibilityChangeHandler = null;
    this.isRequestInFlight = false;
  }

  // ボタンを設定
  setButton(buttonElement) {
    this.button = buttonElement;
    this.button.addEventListener('click', () => {
      if (this.isTrackingLocation) {
        this.stopTracking();
      } else {
        this.startTracking();
      }
    });
  }

  // 位置情報追跡を開始
  startTracking() {
    if (!navigator.geolocation) {
      alert('お使いのブラウザは位置情報取得に対応していません。');
      return;
    }

    this.isTrackingLocation = true;
    this.button.classList.add('active');
    this.locationDotsRefreshed = false;
    this.bindVisibilityEvents();

    // 初回の位置取得（パンあり）
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.updateLocation(position, true);
        this.startPeriodicUpdate();
      },
      (error) => {
        this.handleError(error);
        this.stopTracking();
      },
      {
        enableHighAccuracy: CONFIG.location.enableHighAccuracy,
        timeout: CONFIG.location.timeout,
        maximumAge: CONFIG.location.maximumAge
      }
    );
  }

  // 定期的な位置情報更新を開始
  startPeriodicUpdate() {
    this.stopPeriodicUpdate();
    this.scheduleNextLocationUpdate();
  }

  stopPeriodicUpdate() {
    if (this.locationUpdateTimer) {
      clearTimeout(this.locationUpdateTimer);
      this.locationUpdateTimer = null;
    }
  }

  scheduleNextLocationUpdate() {
    if (!this.isTrackingLocation) {
      return;
    }

    const interval = Math.max(500, Number(CONFIG.location.updateInterval) || 1000);
    this.locationUpdateTimer = setTimeout(() => {
      this.locationUpdateTimer = null;

      if (!this.isTrackingLocation) {
        return;
      }

      const canRun = !document.hidden || !CONFIG.location.pauseWhenHidden;
      if (!canRun) {
        this.scheduleNextLocationUpdate();
        return;
      }

      if (this.isRequestInFlight) {
        this.scheduleNextLocationUpdate();
        return;
      }

      this.isRequestInFlight = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.isRequestInFlight = false;
          this.updateLocation(position, false);
          this.scheduleNextLocationUpdate();
        },
        (error) => {
          this.isRequestInFlight = false;
          console.error('位置情報の取得に失敗しました:', error);
          this.scheduleNextLocationUpdate();
        },
        {
          enableHighAccuracy: CONFIG.location.enableHighAccuracy,
          timeout: CONFIG.location.timeout,
          maximumAge: CONFIG.location.maximumAge
        }
      );
    }, interval);
  }

  // 位置情報追跡を停止
  stopTracking() {
    this.isTrackingLocation = false;
    if (this.button) {
      this.button.classList.remove('active');
    }

    this.stopPeriodicUpdate();
    this.unbindVisibilityEvents();
    this.isRequestInFlight = false;

    if (this.currentLocationMarker) {
      this.map.removeLayer(this.currentLocationMarker);
      this.currentLocationMarker = null;
    }
    if (this.currentLocationAccuracyCircle) {
      this.map.removeLayer(this.currentLocationAccuracyCircle);
      this.currentLocationAccuracyCircle = null;
    }

    this.lastLatLng = null;
    this.lastAccuracy = null;
    this.lastNearestStationIndex = null;
    if (this.uiManager) {
      this.uiManager.setLocationRank(null);
      if (typeof this.uiManager.hideNearestStationNotification === 'function') {
        this.uiManager.hideNearestStationNotification();
      }
    }
    this.refreshStationDots();
    if (this.mapManager && typeof this.mapManager.refreshStationDotStyles === 'function') {
      this.mapManager.refreshStationDotStyles();
    }
    this.locationDotsRefreshed = false;
  }

  // 現在地を更新
  updateLocation(position, panToLocation) {
    if (!position || !position.coords) {
      return;
    }

    const latlng = [position.coords.latitude, position.coords.longitude];
    const accuracy = position.coords.accuracy;

    if (!panToLocation && this.lastLatLng) {
      const minDistance = Number(CONFIG.location.minDistanceForVisualUpdateMeters) || 0;
      const minAccuracyDelta = Number(CONFIG.location.minAccuracyDeltaForVisualUpdateMeters) || 0;
      const movedMeters = this.calculateDistanceMeters(this.lastLatLng, latlng);
      const prevAccuracy = Number.isFinite(this.lastAccuracy) ? this.lastAccuracy : null;
      const accuracyDelta = prevAccuracy == null ? Infinity : Math.abs(prevAccuracy - accuracy);

      if (movedMeters < minDistance && accuracyDelta < minAccuracyDelta) {
        return;
      }
    }

    this.applyLatLng(latlng, accuracy, panToLocation, false);
  }

  // デバッグ用に手動で位置を設定
  setManualLocation(latlng, options = {}) {
    if (!latlng) {
      return;
    }

    const accuracy = options.accuracy != null ? options.accuracy : 50;
    const panToLocation = Boolean(options.pan);
    this.applyLatLng(latlng, accuracy, panToLocation, true);
  }

  applyLatLng(latlng, accuracy, panToLocation, forceRefreshDots) {
    const normalized = Array.isArray(latlng)
      ? [latlng[0], latlng[1]]
      : [latlng.lat, latlng.lng];

    if (!Number.isFinite(normalized[0]) || !Number.isFinite(normalized[1])) {
      return;
    }

    const resolvedAccuracy = Number.isFinite(accuracy) ? accuracy : 50;
    this.lastLatLng = normalized;
    this.lastAccuracy = resolvedAccuracy;
    this.notifyIfNearestStationChanged(normalized);

    if (panToLocation) {
      this.map.panTo(normalized);
    }

    if (this.currentLocationAccuracyCircle) {
      this.currentLocationAccuracyCircle.setLatLng(normalized);
      this.currentLocationAccuracyCircle.setRadius(resolvedAccuracy);
    } else {
      this.currentLocationAccuracyCircle = L.circle(normalized, {
        radius: resolvedAccuracy,
        color: '#2196F3',
        fillColor: '#2196F3',
        fillOpacity: 0.15,
        weight: 2,
        opacity: 0.5,
        pane: 'stationPane'
      }).addTo(this.map);
    }

    if (this.currentLocationMarker) {
      this.currentLocationMarker.setLatLng(normalized);
    } else {
      const pulsingIcon = L.divIcon({
        className: 'current-location-marker',
        html: '<div style="width: 16px; height: 16px; background: #2196F3; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      this.currentLocationMarker = L.marker(normalized, {
        icon: pulsingIcon,
        pane: 'stationPane',
        zIndexOffset: 1000
      }).addTo(this.map);

      this.currentLocationMarker.bindPopup(`
        <div style="font-family: system-ui, sans-serif;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">現在地</div>
          <div style="font-size: 12px; color: #666;">精度: 約${Math.round(resolvedAccuracy)}m</div>
        </div>
      `);
    }

    this.recalculateLocationRank();

    if (forceRefreshDots) {
      this.refreshStationDots();
    } else if (!this.locationDotsRefreshed) {
      this.refreshStationDots();
      this.locationDotsRefreshed = true;
    }

    if (this.mapManager && typeof this.mapManager.refreshStationDotStyles === 'function') {
      this.mapManager.refreshStationDotStyles();
    }
  }

  // エラーハンドリング
  handleError(error) {
    let message = '位置情報の取得に失敗しました。';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = '位置情報の使用が許可されていません。ブラウザの設定を確認してください。';
        break;
      case error.POSITION_UNAVAILABLE:
        message = '位置情報を取得できませんでした。';
        break;
      case error.TIMEOUT:
        message = '位置情報の取得がタイムアウトしました。';
        break;
    }
    alert(message);
  }

  refreshLocationRank() {
    if (!this.isTrackingLocation) {
      if (this.uiManager) {
        this.uiManager.setLocationRank(null);
      }
      return;
    }
    this.recalculateLocationRank();
  }

  recalculateLocationRank() {
    if (!this.isTrackingLocation || !this.lastLatLng || !this.stationManager || !this.uiManager) {
      if (this.uiManager) {
        this.uiManager.setLocationRank(null);
      }
      return;
    }

    const selectedStation = this.uiManager.getSelectedStation();
    if (!selectedStation) {
      this.uiManager.setLocationRank(null);
      return;
    }

    const rank = this.computeSelectedStationRank(this.lastLatLng, selectedStation);
    if (!rank) {
      this.uiManager.setLocationRank(null);
      return;
    }

    this.uiManager.setLocationRank(rank);
  }

  computeSelectedStationRank(latlng, selectedStation) {
    if (!selectedStation || !this.stationManager) {
      return null;
    }

    return this.stationManager.getStationRankFromLatLng(latlng, selectedStation);
  }

  getLastLatLng() {
    return this.lastLatLng;
  }

  isTracking() {
    return this.isTrackingLocation;
  }

  refreshStationDots() {
    if (!this.mapManager || !this.uiManager || !this.mapManager.updateStationDots) {
      return;
    }
    const currentIndex = typeof this.uiManager.getCurrentStationIndex === 'function'
      ? this.uiManager.getCurrentStationIndex()
      : null;
    this.mapManager.updateStationDots(currentIndex);
  }

  notifyIfNearestStationChanged(latlng) {
    if (!this.stationManager || !latlng || !this.isTrackingLocation) {
      return;
    }

    const nearest = this.stationManager.getNearestStationByLatLng(latlng);
    if (!nearest || typeof nearest.index !== 'number') {
      return;
    }

    if (this.lastNearestStationIndex == null) {
      this.lastNearestStationIndex = nearest.index;
      return;
    }

    if (this.lastNearestStationIndex === nearest.index) {
      return;
    }

    this.lastNearestStationIndex = nearest.index;

    if (this.uiManager && typeof this.uiManager.showNearestStationNotification === 'function') {
      this.uiManager.showNearestStationNotification(nearest.name);
    }

    if (this.shouldVibrateNearestStationChange()) {
      this.triggerNearestStationVibration();
    }
  }

  shouldVibrateNearestStationChange() {
    if (!this.uiManager || typeof this.uiManager.isNearestStationVibrationEnabled !== 'function') {
      return false;
    }
    if (!this.uiManager.isNearestStationVibrationEnabled()) {
      return false;
    }
    if (typeof navigator.vibrate !== 'function') {
      return false;
    }
    return this.isAndroidDevice();
  }

  isAndroidDevice() {
    if (navigator.userAgentData && typeof navigator.userAgentData.platform === 'string') {
      if (/android/i.test(navigator.userAgentData.platform)) {
        return true;
      }
    }
    const ua = navigator.userAgent || '';
    return /android/i.test(ua);
  }

  triggerNearestStationVibration() {
    if (typeof navigator.vibrate !== 'function') {
      return;
    }

    try {
      const patterns = [
        [120, 80, 120],
        180,
        [70, 50, 70, 50, 70]
      ];

      let accepted = false;
      for (let i = 0; i < patterns.length; i++) {
        if (navigator.vibrate(patterns[i])) {
          accepted = true;
          break;
        }
      }

      if (!accepted) {
        console.warn('Vibration request was not accepted by the browser/device settings.');
      }
    } catch (e) {
      console.warn('vibration failed:', e);
    }
  }

  bindVisibilityEvents() {
    if (this.visibilityChangeHandler) {
      return;
    }

    this.visibilityChangeHandler = () => {
      if (!this.isTrackingLocation || !CONFIG.location.pauseWhenHidden) {
        return;
      }

      if (document.hidden) {
        this.stopPeriodicUpdate();
      } else if (!this.locationUpdateTimer) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            this.updateLocation(position, false);
            this.startPeriodicUpdate();
          },
          (error) => {
            console.error('位置情報の取得に失敗しました:', error);
            this.startPeriodicUpdate();
          },
          {
            enableHighAccuracy: CONFIG.location.enableHighAccuracy,
            timeout: CONFIG.location.timeout,
            maximumAge: CONFIG.location.maximumAge
          }
        );
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  unbindVisibilityEvents() {
    if (!this.visibilityChangeHandler) {
      return;
    }
    document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    this.visibilityChangeHandler = null;
  }

  calculateDistanceMeters(fromLatLng, toLatLng) {
    if (!Array.isArray(fromLatLng) || !Array.isArray(toLatLng)) {
      return Infinity;
    }

    const [lat1, lng1] = fromLatLng;
    const [lat2, lng2] = toLatLng;
    if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
      return Infinity;
    }

    const toRad = (deg) => deg * Math.PI / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }
}
