// 位置情報取得管理

class LocationManager {
  constructor(map, stationManager, uiManager) {
    this.map = map;
    this.stationManager = stationManager;
    this.uiManager = uiManager;
    this.currentLocationMarker = null;
    this.currentLocationAccuracyCircle = null;
    this.locationUpdateTimer = null;
    this.isTrackingLocation = false;
    this.button = null;
    this.lastLatLng = null;
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
    this.locationUpdateTimer = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.updateLocation(position, false);
        },
        (error) => {
          console.error('位置情報の取得に失敗しました:', error);
        },
        {
          enableHighAccuracy: CONFIG.location.enableHighAccuracy,
          timeout: CONFIG.location.timeout,
          maximumAge: CONFIG.location.maximumAge
        }
      );
    }, CONFIG.location.updateInterval);
  }

  // 位置情報追跡を停止
  stopTracking() {
    this.isTrackingLocation = false;
    if (this.button) {
      this.button.classList.remove('active');
    }

    if (this.locationUpdateTimer) {
      clearInterval(this.locationUpdateTimer);
      this.locationUpdateTimer = null;
    }

    if (this.currentLocationMarker) {
      this.map.removeLayer(this.currentLocationMarker);
      this.currentLocationMarker = null;
    }
    if (this.currentLocationAccuracyCircle) {
      this.map.removeLayer(this.currentLocationAccuracyCircle);
      this.currentLocationAccuracyCircle = null;
    }

    this.lastLatLng = null;
    if (this.uiManager) {
      this.uiManager.setLocationRank(null);
    }
  }

  // 現在地を更新
  updateLocation(position, panToLocation) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    const latlng = [lat, lng];
    this.lastLatLng = latlng;

    if (panToLocation) {
      this.map.panTo(latlng);
    }

    // 精度円を更新
    if (this.currentLocationAccuracyCircle) {
      this.currentLocationAccuracyCircle.setLatLng(latlng);
      this.currentLocationAccuracyCircle.setRadius(accuracy);
    } else {
      this.currentLocationAccuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: '#2196F3',
        fillColor: '#2196F3',
        fillOpacity: 0.15,
        weight: 2,
        opacity: 0.5,
        pane: 'stationPane'
      }).addTo(this.map);
    }

    // 現在地マーカーを更新
    if (this.currentLocationMarker) {
      this.currentLocationMarker.setLatLng(latlng);
    } else {
      const pulsingIcon = L.divIcon({
        className: 'current-location-marker',
        html: '<div style="width: 16px; height: 16px; background: #2196F3; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      this.currentLocationMarker = L.marker(latlng, {
        icon: pulsingIcon,
        pane: 'stationPane',
        zIndexOffset: 1000
      }).addTo(this.map);

      this.currentLocationMarker.bindPopup(`
        <div style="font-family: system-ui, sans-serif;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">現在地</div>
          <div style="font-size: 12px; color: #666;">精度: 約${Math.round(accuracy)}m</div>
        </div>
      `);
    }
    this.recalculateLocationRank();
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
    if (!selectedStation || !this.stationManager || !this.stationManager.stationPositions.length) {
      return null;
    }

    const targetDx = latlng[1] - selectedStation.lng;
    const targetDy = latlng[0] - selectedStation.lat;
    const targetDist2 = targetDx * targetDx + targetDy * targetDy;

    if (targetDist2 === 0) {
      return 1;
    }

    let closerCount = 0;
    const positions = this.stationManager.stationPositions;
    for (let i = 0; i < positions.length; i++) {
      const station = positions[i];
      if (station.index === selectedStation.index) {
        continue;
      }
      const dx = latlng[1] - station.lng;
      const dy = latlng[0] - station.lat;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < targetDist2) {
        closerCount++;
      }
    }

    return closerCount + 1;
  }
}
