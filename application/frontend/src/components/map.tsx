import { Store } from '@/modules/store';
import { bbox } from '@turf/turf';
import { GeoJSONSource, Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useContext, useEffect, useState } from 'react';

export default function MapCanvas() {
  // All the stored states
  const { map, setMap, geojson, setStatus } = useContext(Store);

  const [mapLoaded, setMapLoaded] = useState(false);

  const divId = 'map';
  const cogId = 'cog';
  const geojsonSourceId = 'geojson';

  // Load maplibre at the first time
  useEffect(() => {
    try {
      const map = new Map({
        container: divId,
        center: [117, 0],
        maxZoom: 20,
        minZoom: 1,
        zoom: 8,
        style: {
          version: 8,
          sources: {
            basemap: {
              type: 'raster',
              url: '/basemap',
            },
          },
          layers: [{ source: 'basemap', id: 'basemap', type: 'raster' }],
        },
      });
      setMap(map);

      map.on('load', () => {
        setMapLoaded(true);
        setStatus({ message: 'Map loaded', type: 'success' });

        // When the map is fully loaded, load the hansen forest cover data
        map.addSource(cogId, {
          type: 'raster',
          tileSize: 256,
          tiles: ['/cog/{z}/{x}/{y}?layer=treecover2000&palette=navy,teal,yellow&min=0&max=100'],
        });

        map.addLayer({
          source: cogId,
          id: cogId,
          type: 'raster',
        });
      });
    } catch ({ message }) {
      setStatus({ message, type: 'failed' });
    }
  }, []);

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
