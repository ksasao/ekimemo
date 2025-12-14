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
    this.activeStations = null; // カリング済みの駅リストを保持
  }

  // オーバーレイレイヤーを設定
  setOverlayLayer(layer) {
    this.overlayLayer = layer;
  }

  // グリッド描画を開始
  drawOverlay(station, detectionCount) {
    this.cancelProgressiveDraw();
    this.currentDrawingCancelled = false;
    const fallbackCount = CONFIG?.detection?.default ?? 0;
    const parsedCount = Number(detectionCount);
    const normalizedCount = Number.isFinite(parsedCount)
      ? Math.max(0, parsedCount)
      : Math.max(0, fallbackCount);

    if (normalizedCount <= 0) {
      if (this.overlayLayer) {
        this.overlayLayer.clearLayers();
      }
      return;
    }
    
    // 最初の描画（最も荒いグリッド）の前に、画面範囲に基づいて有効な駅を計算する
    // これにより、画面外にあっても画面内の判定に影響を与える駅を漏らさず、かつ不要な駅を除外できる
    this.calculateActiveStations(station, normalizedCount);
    
    this.drawOverlayWithGridSize(station, normalizedCount, CONFIG.drawing.gridSizes[0]);
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
    // activeStations はクリアしない（同じ駅・同じ条件での再描画の可能性もあるが、
    // drawOverlayが呼ばれるたびに再計算されるので、ここでクリアしても問題ない。
    // メモリ解放のためにクリアしておくのが無難）
    this.activeStations = null;
  }

  // 画面範囲に基づいて有効な駅を計算（4隅判定によるカリング）
  calculateActiveStations(targetStation, detectionCount) {
    const positions = this.stationManager.stationPositions || [];
    if (!positions.length || !targetStation) {
      this.activeStations = positions;
      return;
    }

    const mapSize = this.map.getSize();
    if (!mapSize.x || !mapSize.y) {
      this.activeStations = positions;
      return;
    }

    // 最も荒いグリッドサイズ分だけバッファを持たせる
    // これにより、画面端のグリッドセル中心が画面外にある場合もカバーする
    const buffer = CONFIG.drawing.gridSizes[0] || 32;
    
    // 画面の4隅（+バッファ）の座標を取得
    const corners = [
      this.map.containerPointToLatLng([-buffer, -buffer]),
      this.map.containerPointToLatLng([mapSize.x + buffer, -buffer]),
      this.map.containerPointToLatLng([-buffer, mapSize.y + buffer]),
      this.map.containerPointToLatLng([mapSize.x + buffer, mapSize.y + buffer])
    ];

    const active = [];
    const targetLat = targetStation.lat;
    const targetLng = targetStation.lng;

    // 各コーナーからターゲット駅までの距離の二乗を計算しておく
    const distToTarget = corners.map(c => {
      const dy = c.lat - targetLat;
      const dx = c.lng - targetLng;
      return dx * dx + dy * dy;
    });

    for (let i = 0; i < positions.length; i++) {
      const s = positions[i];
      
      // ターゲット駅自身は常に含める
      if (s.index === targetStation.index) {
        active.push(s);
        continue;
      }

      // 4隅すべてにおいて、ターゲット駅よりも遠いかどうかをチェック
      // もし4隅すべてで dist(Corner, S) > dist(Corner, Target) ならば、
      // 画面内のどの点においても S は Target より遠い（ボロノイ領域の凸性より）。
      // その場合、S は「Targetより近い駅」のカウントに寄与しないため除外可能。
      
      let potentiallyCloser = false;
      for (let j = 0; j < 4; j++) {
        const dy = corners[j].lat - s.lat;
        const dx = corners[j].lng - s.lng;
        const d2 = dx * dx + dy * dy;
        
        if (d2 < distToTarget[j]) {
          potentiallyCloser = true;
          break;
        }
      }

      if (potentiallyCloser) {
        active.push(s);
      }
    }

    this.activeStations = active;
    
    if (CONFIG.debug && CONFIG.debug.logCullResult) {
      console.log(
        `[Drawing] Active stations calculated: ${active.length} / ${positions.length}`
      );
    }
  }

  // 指定されたグリッドサイズで描画
  drawOverlayWithGridSize(station, detectionCount, gridPx) {
    if (!station) return;

    const n = Math.max(0, detectionCount);
    this.currentDrawingGridSize = gridPx;
    this.currentDrawingCancelled = false;

    // 新しいレイヤーを作成
    this.newOverlayLayer = L.layerGroup();

    const targetLat = station.lat;
    const targetLng = station.lng;
    const mapSize = this.map.getSize();
    const width = mapSize.x;
    const height = mapSize.y;

    // 事前に計算した activeStations を使用する
    // もし何らかの理由で activeStations がなければ全駅を使用（安全策）
    const classificationStations = this.activeStations || this.stationManager.stationPositions;

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

          const cellType = this.classifyCell(
            latlng,
            station,
            n,
            targetLat,
            targetLng,
            classificationStations
          );

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

  classifyCell(latlng, station, detectionCount, targetLat, targetLng, candidateStations) {
    if (!latlng) return null;
    if (latlng.lng < -180 || latlng.lng > 180) return null;

    const dyT = latlng.lat - targetLat;
    const dxT = latlng.lng - targetLng;
    const dTarget2 = dxT * dxT + dyT * dyT;

    if (dTarget2 === 0) {
      return 'exact';
    }

    return this.classifyCellNaive(
      latlng,
      station,
      detectionCount,
      dTarget2,
      candidateStations
    );
  }

  classifyCellNaive(latlng, station, detectionCount, dTarget2, positions) {
    const sources = (positions && positions.length)
      ? positions
      : this.stationManager.stationPositions || [];

    let closerCount = 0;
    for (let i = 0; i < sources.length; i++) {
      const sp = sources[i];
      if (!sp) continue;
      if (sp.index === station.index) continue;
      const dy = latlng.lat - sp.lat;
      const dx = latlng.lng - sp.lng;
      const d2 = dx * dx + dy * dy;
      if (d2 < dTarget2) {
        closerCount++;
        if (closerCount >= detectionCount) break;
      }
    }

    if (closerCount < detectionCount) {
      return closerCount + 1 === detectionCount ? 'exact' : 'inner';
    }

    return null;
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
