// Map style. Defaults to raster OpenStreetMap so streets show in dev.
// NOTE: OSM's public tiles are NOT for production traffic — set
// NEXT_PUBLIC_MAP_STYLE to a MapTiler/Protomaps style URL before launch.
const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MAP_STYLE: any =
  process.env.NEXT_PUBLIC_MAP_STYLE || OSM_RASTER_STYLE;

// Map centred on the hardest-hit region (La Guaira / Caracas).
export const REGION_CENTER = { longitude: -66.93, latitude: 10.55, zoom: 8.5 };
