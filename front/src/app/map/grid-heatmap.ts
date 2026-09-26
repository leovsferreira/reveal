// Heatmap drawn as a fixed geographic grid (same approach as the stewards heatmap): image locations are counted per
// Web Mercator tile at a fixed zoom and the grid is rendered once, with bilinear smoothing, into an image anchored to
// the map. Unlike a MapLibre `heatmap` layer, whose kernel is sized in screen pixels, the colors don't change with zoom.

export const HEATMAP_CELL_ZOOM = 15; // cells of ~910 m at Chicago's latitude

const PIXELS_PER_CELL = 8;
const MAX_CANVAS_SIZE = 2048;
const MAX_GRID_SIZE = 1024; // the grid is only coarsened when the points span too large an area for one image
const MAX_MERCATOR_LAT = 85.051129;
const EARTH_CIRCUMFERENCE_M = 40075016.686;

// Same color scale as the previous MapLibre heatmap-color ramp (count / max count -> color)
const COLOR_STOPS: [number, [number, number, number, number]][] = [
  [0,    [254, 240, 217, 0]],
  [0.05, [254, 240, 217, 255]],
  [0.3,  [253, 204, 138, 255]],
  [0.5,  [252, 141, 89, 255]],
  [0.8,  [227, 74, 51, 255]],
  [1,    [179, 0, 0, 255]]
];

export const HEATMAP_LEGEND_GRADIENT = 'linear-gradient(to right, ' + COLOR_STOPS
  .map(([t, [r, g, b, a]]) => `rgba(${r}, ${g}, ${b}, ${a / 255}) ${t * 100}%`)
  .join(', ') + ')';

// 256-step lookup table, like the ramp texture MapLibre samples for heatmap-color
const COLOR_RAMP = (() => {
  const ramp = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let s = 0;
    while (s < COLOR_STOPS.length - 2 && t > COLOR_STOPS[s + 1][0]) s++;
    const [t0, c0] = COLOR_STOPS[s];
    const [t1, c1] = COLOR_STOPS[s + 1];
    const f = (t - t0) / (t1 - t0);
    for (let k = 0; k < 4; k++) ramp[i * 4 + k] = c0[k] + (c1[k] - c0[k]) * f;
  }
  return ramp;
})();

export interface GridHeatmap {
  url: string;
  // top-left, top-right, bottom-right, bottom-left, as MapLibre image sources expect
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  maxCount: number;
  cellMeters: number;
}

export function buildGridHeatmap(locations: { lon: number, lat: number }[]): GridHeatmap | null {
  const points = locations.filter(loc => loc && Number.isFinite(loc.lon) && Number.isFinite(loc.lat)
    && Math.abs(loc.lat) <= MAX_MERCATOR_LAT);
  if (!points.length) return null;

  // Web Mercator coordinates in [0, 1]; tile (x, y) at zoom z is floor(coordinate * 2^z)
  const mx = new Float64Array(points.length);
  const my = new Float64Array(points.length);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach((loc, i) => {
    const lat = loc.lat * Math.PI / 180;
    mx[i] = (loc.lon + 180) / 360;
    my[i] = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;
    minX = Math.min(minX, mx[i]);
    maxX = Math.max(maxX, mx[i]);
    minY = Math.min(minY, my[i]);
    maxY = Math.max(maxY, my[i]);
  });

  let zoom = HEATMAP_CELL_ZOOM;
  const tooLarge = (n: number) =>
    Math.floor(maxX * n) - Math.floor(minX * n) + 1 > MAX_GRID_SIZE || Math.floor(maxY * n) - Math.floor(minY * n) + 1 > MAX_GRID_SIZE;
  while (zoom > 0 && tooLarge(2 ** zoom)) zoom--;
  const n = 2 ** zoom;

  // one empty cell of padding on every side, so the smoothing fades out instead of being cut at the edges
  const x0 = Math.floor(minX * n) - 1;
  const y0 = Math.floor(minY * n) - 1;
  const cols = Math.floor(maxX * n) - x0 + 2;
  const rows = Math.floor(maxY * n) - y0 + 2;

  const counts = new Float32Array(cols * rows);
  let maxCount = 0;
  for (let i = 0; i < points.length; i++) {
    const cell = (Math.floor(my[i] * n) - y0) * cols + (Math.floor(mx[i] * n) - x0);
    maxCount = Math.max(maxCount, ++counts[cell]);
  }

  const width = Math.min(cols * PIXELS_PER_CELL, MAX_CANVAS_SIZE);
  const height = Math.min(rows * PIXELS_PER_CELL, MAX_CANVAS_SIZE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  const countAt = (ix: number, iy: number) => ix < 0 || iy < 0 || ix >= cols || iy >= rows ? 0 : counts[iy * cols + ix];

  // bilinear interpolation between cell centers, then count / max count -> color
  for (let row = 0; row < height; row++) {
    const gy = (row + 0.5) / height * rows - 0.5;
    const iy = Math.floor(gy);
    const fy = gy - iy;
    for (let col = 0; col < width; col++) {
      const gx = (col + 0.5) / width * cols - 0.5;
      const ix = Math.floor(gx);
      const fx = gx - ix;
      const value =
        (countAt(ix, iy) * (1 - fx) + countAt(ix + 1, iy) * fx) * (1 - fy) +
        (countAt(ix, iy + 1) * (1 - fx) + countAt(ix + 1, iy + 1) * fx) * fy;
      const color = Math.round(value / maxCount * 255) * 4;
      const pixel = (row * width + col) * 4;
      image.data[pixel] = COLOR_RAMP[color];
      image.data[pixel + 1] = COLOR_RAMP[color + 1];
      image.data[pixel + 2] = COLOR_RAMP[color + 2];
      image.data[pixel + 3] = COLOR_RAMP[color + 3];
    }
  }
  ctx.putImageData(image, 0, 0);

  const west = x0 / n * 360 - 180;
  const east = (x0 + cols) / n * 360 - 180;
  const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y0 / n))) * 180 / Math.PI;
  const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y0 + rows) / n))) * 180 / Math.PI;
  const centerLat = Math.atan(Math.sinh(Math.PI * (1 - (minY + maxY))));

  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
    maxCount,
    cellMeters: EARTH_CIRCUMFERENCE_M * Math.cos(centerLat) / n
  };
}
