const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const detectionCount = Math.max(1, Number(process.argv[2]) || 3);
const sampleSize = Math.max(100, Number(process.argv[3]) || 5000);

const stationsPath = path.resolve(__dirname, '..', 'station.json');
const stationData = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));

const stationPositions = stationData.map((s, index) => ({
  lat: Number(s.lat),
  lng: Number(s.lng),
  index,
}));

const samples = createSamples(sampleSize);
const subsetCache = prepareFilteredStations(samples, detectionCount);

function createSamples(size) {
  const samples = new Array(size);
  for (let i = 0; i < size; i++) {
    const station = stationPositions[Math.floor(Math.random() * stationPositions.length)];
    const latOffset = (Math.random() - 0.5) * 0.8;
    const lngOffset = (Math.random() - 0.5) * 0.8;
    const referencePoints = createReferencePointsForStation(station);
    samples[i] = {
      station,
      latlng: {
        lat: station.lat + latOffset,
        lng: station.lng + lngOffset,
      },
      referencePoints,
    };
  }
  return samples;
}

function classifyNaive(latlng, station, n, positions = stationPositions) {
  const dyT = latlng.lat - station.lat;
  const dxT = latlng.lng - station.lng;
  const dTarget2 = dxT * dxT + dyT * dyT;
  if (dTarget2 === 0) {
    return 'exact';
  }

  let closerCount = 0;
  for (let i = 0; i < positions.length; i++) {
    const sp = positions[i];
    if (!sp) continue;
    if (sp.index === station.index) continue;
    const dy = latlng.lat - sp.lat;
    const dx = latlng.lng - sp.lng;
    const d2 = dx * dx + dy * dy;
    if (d2 < dTarget2) {
      closerCount++;
      if (closerCount >= n) {
        return null;
      }
    }
  }

  return closerCount + 1 === n ? 'exact' : 'inner';
}

function benchmark(label, fn) {
  let lastResult = null;
  const start = performance.now();
  for (let i = 0; i < samples.length; i++) {
    lastResult = fn(samples[i], i);
  }
  const duration = performance.now() - start;
  console.log(`${label}: ${duration.toFixed(2)} ms (last result: ${lastResult})`);
  return duration;
}

verifySamples(subsetCache);

console.log(`Benchmarking ${sampleSize} cells with detectionCount=${detectionCount}`);
const naiveDuration = benchmark('naive', ({ latlng, station }) => classifyNaive(latlng, station, detectionCount));
const filteredDuration = benchmark('corner-filtered', (sample) => {
  const subset = subsetCache.get(getCacheKey(sample.station.index, detectionCount));
  return classifyNaive(sample.latlng, sample.station, detectionCount, subset || stationPositions);
});
const speedup = naiveDuration / filteredDuration;
console.log(`Speedup: ${speedup.toFixed(2)}x (values > 1 mean filtered is faster)`);

function verifySamples(subsetCache) {
  let mismatchCount = 0;
  const samplesToLog = [];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const naive = classifyNaive(sample.latlng, sample.station, detectionCount);
    const subset = subsetCache.get(getCacheKey(sample.station.index, detectionCount)) || stationPositions;
    const filtered = classifyNaive(sample.latlng, sample.station, detectionCount, subset);
    if (naive !== filtered) {
      mismatchCount++;
      if (samplesToLog.length < 5) {
        samplesToLog.push({
          idx: i,
          naive,
          filtered,
          station: sample.station.index,
          latlng: sample.latlng,
        });
      }
    }
  }

  if (mismatchCount > 0) {
    console.warn(`Found ${mismatchCount} mismatches between naive and corner-filtered implementations.`);
    console.warn(samplesToLog);
  } else {
    console.log('Verification passed: corner-filtered classification matches naive implementation for sampled cells.');
  }
}

function prepareFilteredStations(sampleList, n) {
  const cache = new Map();
  const start = performance.now();
  for (let i = 0; i < sampleList.length; i++) {
    const sample = sampleList[i];
    const key = getCacheKey(sample.station.index, n);
    if (cache.has(key)) continue;
    const subset = filterStationsByReferencePoints(sample.referencePoints, sample.station, n);
    cache.set(key, subset);
  }
  const elapsed = performance.now() - start;
  const sizes = Array.from(cache.values()).map((arr) => arr.length);
  const avgSize = sizes.length ? sizes.reduce((sum, len) => sum + len, 0) / sizes.length : 0;
  const maxSize = sizes.length ? Math.max(...sizes) : 0;
  console.log(
    `Prepared ${cache.size} station subsets in ${elapsed.toFixed(2)} ms (avg size ${avgSize.toFixed(1)}, max ${maxSize})`
  );
  return cache;
}

function filterStationsByReferencePoints(points, station, detectionCount) {
  const keepPerCorner = getCullCount(detectionCount, stationPositions.length);
  if (keepPerCorner >= stationPositions.length) {
    return stationPositions;
  }

  const keepIndices = new Set();
  for (let i = 0; i < points.length; i++) {
    const nearest = findNearestIndices(points[i], stationPositions, keepPerCorner);
    for (let j = 0; j < nearest.length; j++) {
      keepIndices.add(nearest[j]);
    }
  }

  keepIndices.add(station.index);

  return Array.from(keepIndices).map((idx) => stationPositions[idx]);
}

function findNearestIndices(corner, positions, keepCount) {
  if (keepCount <= 0 || keepCount >= positions.length) {
    return positions.map((_, idx) => idx);
  }

  const best = [];
  let worstIdx = -1;

  for (let i = 0; i < positions.length; i++) {
    const sp = positions[i];
    const dist2 = distanceSquared(corner, sp);

    if (best.length < keepCount) {
      best.push({ idx: i, dist2 });
      if (best.length === keepCount) {
        worstIdx = findWorstCandidateIndex(best);
      }
      continue;
    }

    if (dist2 >= best[worstIdx].dist2) {
      continue;
    }

    best[worstIdx] = { idx: i, dist2 };
    worstIdx = findWorstCandidateIndex(best);
  }

  return best.map((item) => item.idx);
}

function findWorstCandidateIndex(candidates) {
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

function getCullCount(detectionCount, totalStations) {
  const multiplier = 4;
  const padding = 48;
  const minStations = 200;
  const keep = Math.max(
    detectionCount * multiplier,
    detectionCount + padding,
    minStations
  );
  return Math.min(totalStations, keep);
}

function createReferencePointsForStation(station) {
  const latSpan = 0.35;
  const lngSpan = 0.45;
  return [
    { lat: station.lat + latSpan, lng: station.lng - lngSpan },
    { lat: station.lat + latSpan, lng: station.lng + lngSpan },
    { lat: station.lat - latSpan, lng: station.lng - lngSpan },
    { lat: station.lat - latSpan, lng: station.lng + lngSpan },
    { lat: station.lat, lng: station.lng },
    { lat: station.lat, lng: station.lng - lngSpan },
    { lat: station.lat, lng: station.lng + lngSpan },
    { lat: station.lat + latSpan, lng: station.lng },
    { lat: station.lat - latSpan, lng: station.lng },
  ];
}

function distanceSquared(a, b) {
  const dx = a.lng - b.lng;
  const dy = a.lat - b.lat;
  return dx * dx + dy * dy;
}

function getCacheKey(stationIndex, n) {
  return `${stationIndex}:${n}`;
}
