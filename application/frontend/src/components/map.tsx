import { Store } from '@/modules/store';
import { bbox } from '@turf/turf';
import { GeoJSONSource, Map, MapDataEvent, RasterTileSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useContext, useEffect, useState } from 'react';

export default function MapCanvas() {
  // All the stored states
  const { map, setMap, geojson, setStatus, year, layer, minForestCover, layers } =
    useContext(Store);

  const [mapLoaded, setMapLoaded] = useState(false);

  const divId = 'map';
  const geojsonSourceId = 'geojson';

  function loadingLayer(e: MapDataEvent, layerId: string) {
    // @ts-ignore
    if (e.sourceId == layerId) {
      // @ts-ignore
      if (!e.isSourceLoaded) {
        setStatus({ message: `${layer.label} is loading...`, type: 'other' });
      } else {
        setStatus({ message: `${layer.label} is loaded`, type: 'other' });
      }
    }
  }
  // Load maplibre at the first time
  useEffect(() => {
    try {
      const map = new Map({
        container: divId,
        center: [116, 0],
        maxZoom: 20,
        minZoom: 1,
        zoom: 4,
        style: {
          projection: {
            type: 'globe',
          },
          version: 8,
          sources: {
            basemap: {
              type: 'raster',
              url: '/basemap',
              tileSize: 256,
            },
          },
          layers: [{ source: 'basemap', id: 'basemap', type: 'raster' }],
        },
      });
      setMap(map);

      map.on('load', () => {
        setMapLoaded(true);
        setStatus({ message: 'Map loaded', type: 'success' });
      });
    } catch ({ message }) {
      setStatus({ message, type: 'failed' });
    }
  }, []);

  // Change layer
  useEffect(() => {
    if (mapLoaded && map && layer.value) {
      layers.map((dict) => {
        if (map.getSource(dict.value)) {
          map.setLayoutProperty(
            dict.value,
            'visibility',
            layer.value == dict.value ? 'visible' : 'none',
          );
        }
      });

      const source = map.getSource(layer.value) as RasterTileSource;
      let mapQuery = `/cog/tilejson.json?layer=${layer.value}&palette=${layer.palette.join(',')}&min=${layer.min}&max=${layer.max}`;

      // Additional query
      if (layer.value == 'forest_cover' || layer.value == 'treecover2000') {
        mapQuery = `${mapQuery}&year=${year}`;
      }

      if (layer.value == 'forest_cover') {
        mapQuery = `${mapQuery}&min_forest_cover=${minForestCover}`;
      }

      if (!source) {
        // When the map is fully loaded, load the hansen forest cover data
        map.addSource(layer.value, {
          type: 'raster',
          tileSize: 256,
          url: mapQuery,
        });

        map.addLayer({
          source: layer.value,
          id: layer.value,
          type: 'raster',
        });

        map.on('data', (e) => loadingLayer(e, layer.value));
      } else {
        map.setLayoutProperty(layer.value, 'visibility', 'visible');
      }
    }
  }, [mapLoaded, layer, year, minForestCover]);

  // Load geojson to map if it is not null;
  useEffect(() => {
    if (mapLoaded && geojson) {
      try {
        setStatus({ message: 'Adding geojson to map...', type: 'process' });
        const geojsonSource = map.getSource(geojsonSourceId) as GeoJSONSource;
        if (geojsonSource) {
          geojsonSource.setData(geojson);
        } else {
          map.addSource(geojsonSourceId, {
            type: 'geojson',
            data: geojson,
          });
          map.addLayer({
            source: geojsonSourceId,
            id: geojsonSourceId,
            type: 'line',
            paint: {
              'line-color': 'red',
              'line-width': 2,
            },
          });
        }

        const bounds = bbox(geojson);
        map.fitBounds(bounds as [number, number, number, number]);

        setStatus({ message: 'GeoJSON added to map', type: 'success' });
      } catch ({ message }) {
        setStatus({ message, type: 'failed' });
      }
    }
  }, [map, mapLoaded, geojson]);

  return <div id={divId} />;
}
