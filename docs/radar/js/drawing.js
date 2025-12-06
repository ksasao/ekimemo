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

    const stationSubset = this.buildStationSubset(station, n);
    const requiredSize = Math.min(this.stationManager.stationPositions.length, n + 1);
    const classificationStations =
      stationSubset.length >= requiredSize && stationSubset.length > 0
        ? stationSubset
        : this.stationManager.stationPositions;

    if (CONFIG.debug && CONFIG.debug.logCullResult) {
      console.log(
        `[Drawing] culled to ${classificationStations.length} stations (n=${n}, total=${this.stationManager.stationPositions.length})`
      );
    }

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

  buildStationSubset(station, detectionCount) {
    const positions = this.stationManager.stationPositions || [];
    if (!positions.length) {
      return [];
    }

    const mapSize = this.map.getSize();
    if (!mapSize) {
      return positions;
    }

    const corners = this.getMapReferencePoints(mapSize);
    const keepPerCorner = this.getCullCount(detectionCount, positions.length);

    if (keepPerCorner >= positions.length) {
      return positions;
    }

    const keepIndices = new Set();
    for (let i = 0; i < corners.length; i++) {
      const nearest = this.findNearestIndices(corners[i], positions, keepPerCorner);
      for (let j = 0; j < nearest.length; j++) {
        keepIndices.add(nearest[j]);
      }
    }

    keepIndices.add(station.index);

    return Array.from(keepIndices).map((idx) => positions[idx]);
  }

  getCullCount(detectionCount, totalStations) {
    const multiplier = (CONFIG.drawing && CONFIG.drawing.cullMultiplier) || 4;
    const padding = (CONFIG.drawing && CONFIG.drawing.cullPadding) || 48;
    const minStations = (CONFIG.drawing && CONFIG.drawing.cullMinStations) || 200;

    const keep = Math.max(
      detectionCount * multiplier,
      detectionCount + padding,
      minStations
    );

    return Math.min(totalStations, keep);
  }

  getMapReferencePoints(mapSize) {
    const halfX = mapSize.x / 2;
    const halfY = mapSize.y / 2;
    const pixelPoints = [
      [0, 0],
      [mapSize.x, 0],
      [0, mapSize.y],
      [mapSize.x, mapSize.y],
      [halfX, halfY],
      [halfX, 0],
      [halfX, mapSize.y],
      [0, halfY],
      [mapSize.x, halfY],
    ];

    return pixelPoints.map((pt) => this.map.containerPointToLatLng(pt));
  }

  findNearestIndices(cornerLatLng, positions, keepCount) {
    if (keepCount <= 0 || keepCount >= positions.length) {
      return positions.map((_, idx) => idx);
    }

    const best = [];
    let worstIdx = -1;

    for (let i = 0; i < positions.length; i++) {
      const sp = positions[i];
      const dist2 = this.distanceSquared(cornerLatLng, sp);

      if (best.length < keepCount) {
        best.push({ idx: i, dist2 });
        if (best.length === keepCount) {
          worstIdx = this.findWorstCandidateIndex(best);
        }
        continue;
      }

      if (dist2 >= best[worstIdx].dist2) {
        continue;
      }

      best[worstIdx] = { idx: i, dist2 };
      worstIdx = this.findWorstCandidateIndex(best);
    }

    return best.map((item) => item.idx);
  }

  findWorstCandidateIndex(candidates) {
    if (!candidates.length) {
      return -1;
    }

    let worstIdx = 0;
    let worstValue = candidates[0].dist2;

    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].dist2 > worstValue) {
        worstValue = candidates[i].dist2;
        worstIdx = i;
      }
    }

    return worstIdx;
  }

  distanceSquared(a, b) {
    const dx = a.lng - b.lng;
    const dy = a.lat - b.lat;
    return dx * dx + dy * dy;
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
