// グリッド描画管理

class DrawingManager {
  constructor(map, stationManager) {
    this.map = map;
    this.stationManager = stationManager;
    this.overlayLayer = null;
    this.newOverlayLayer = null;
    this.progressiveDrawTimer = null;
    this.currentDrawingGridSize = null;
    this.currentDrawingCancelled = false;
  }

  // オーバーレイレイヤーを設定
  setOverlayLayer(layer) {
    this.overlayLayer = layer;
  }

  // グリッド描画を開始
  drawOverlay(station, detectionCount) {
    this.cancelProgressiveDraw();
    this.currentDrawingCancelled = false;
    this.drawOverlayWithGridSize(station, detectionCount, CONFIG.drawing.gridSizes[0]);
  }

  // 段階描画をキャンセル
  cancelProgressiveDraw() {
    if (this.progressiveDrawTimer) {
      clearTimeout(this.progressiveDrawTimer);
      this.progressiveDrawTimer = null;
    }
    this.currentDrawingGridSize = null;
    this.currentDrawingCancelled = true;
    this.newOverlayLayer = null;
  }

  // 指定されたグリッドサイズで描画
  drawOverlayWithGridSize(station, detectionCount, gridPx) {
    if (!station) return;

    const n = Math.max(1, detectionCount);
    this.currentDrawingGridSize = gridPx;
    this.currentDrawingCancelled = false;

    // 新しいレイヤーを作成
    this.newOverlayLayer = L.layerGroup();

    const targetLat = station.lat;
    const targetLng = station.lng;
    const mapSize = this.map.getSize();
    const width = mapSize.x;
    const height = mapSize.y;

    let currentY = 0;

    // 行ごとに非同期で描画
    const drawNextRows = () => {
      if (this.currentDrawingCancelled || !this.newOverlayLayer) {
        return;
      }

      const startTime = performance.now();
      const maxTime = CONFIG.drawing.frameTime;

      while (currentY < height && (performance.now() - startTime) < maxTime) {
        const y = currentY;
        let runType = null;
        let runStartX = 0;

        for (let x = 0; x < width; x += gridPx) {
          const cx = x + gridPx / 2;
          const cy = y + gridPx / 2;
          const latlng = this.map.containerPointToLatLng([cx, cy]);

          let cellType = null;

          if (latlng.lng < -180 || latlng.lng > 180) {
            cellType = null;
          } else {
            const dyT = latlng.lat - targetLat;
            const dxT = latlng.lng - targetLng;
            const dTarget2 = dxT * dxT + dyT * dyT;

            if (dTarget2 === 0) {
              cellType = 'exact';
            } else {
              let closerCount = 0;
              for (let i = 0; i < this.stationManager.stationPositions.length; i++) {
                if (i === station.index) continue;
                const sp = this.stationManager.stationPositions[i];
                const dy = latlng.lat - sp.lat;
                const dx = latlng.lng - sp.lng;
                const d2 = dx * dx + dy * dy;
                if (d2 < dTarget2) {
                  closerCount++;
                  if (closerCount >= n) break;
                }
              }
              if (closerCount < n) {
                cellType = (closerCount + 1 === n) ? 'exact' : 'inner';
              }
            }
          }

          if (cellType === runType) {
            continue;
          } else {
            if (runType !== null) {
              this.addGridRunRect(runStartX, y, x, gridPx, runType);
            }
            if (cellType !== null) {
              runType = cellType;
              runStartX = x;
            } else {
              runType = null;
            }
          }
        }

        if (runType !== null) {
          this.addGridRunRect(runStartX, y, width, gridPx, runType);
        }

        currentY += gridPx;
      }

      if (currentY < height) {
        requestAnimationFrame(drawNextRows);
      } else {
        // 描画完了後、古いレイヤーと入れ替え
        if (!this.currentDrawingCancelled && this.newOverlayLayer) {
          this.overlayLayer.clearLayers();
          this.overlayLayer.remove();
          this.overlayLayer = this.newOverlayLayer;
          this.overlayLayer.addTo(this.map);
          this.newOverlayLayer = null;
        }
        // 次のグリッドサイズをスケジュール
        this.scheduleNextGridSize(gridPx, station, detectionCount);
      }
    };

    requestAnimationFrame(drawNextRows);
  }

  // 横方向の区間を一気に塗る
  addGridRunRect(x0, y0, x1, gridPx, type) {
    if (!this.newOverlayLayer) return;
    
    const nw = this.map.containerPointToLatLng([x0, y0]);
    const se = this.map.containerPointToLatLng([x1, y0 + gridPx]);

    const style = type === 'exact'
      ? {
          pane: 'gridPane',
          color: '#ff0000',
          weight: 0,
          fillColor: '#ff6666',
          fillOpacity: 0.35,
          interactive: false,
        }
      : {
          pane: 'gridPane',
          color: '#0000ff',
          weight: 0,
          fillColor: '#6666ff',
          fillOpacity: 0.25,
          interactive: false,
        };

    const rect = L.rectangle([nw, se], style);
    this.newOverlayLayer.addLayer(rect);
  }

  // 次のグリッドサイズをスケジュール
  scheduleNextGridSize(currentSize, station, detectionCount) {
    const currentIndex = CONFIG.drawing.gridSizes.indexOf(currentSize);
    const nextSize = CONFIG.drawing.gridSizes[currentIndex + 1];
    
    if (!nextSize) {
      this.currentDrawingGridSize = null;
      return;
    }

    this.progressiveDrawTimer = setTimeout(() => {
      if (!this.map._isInteracting) {
        this.drawOverlayWithGridSize(station, detectionCount, nextSize);
      }
    }, CONFIG.drawing.progressiveDelay);
  }

  // 現在のオーバーレイレイヤーを取得
  getOverlayLayer() {
    return this.overlayLayer;
  }
}
