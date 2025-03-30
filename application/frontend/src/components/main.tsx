'use client';

import { Store } from '@/modules/store';
import { Status } from '@/modules/type';
import { FeatureCollection } from 'geojson';
import { Map } from 'maplibre-gl';
import { useState } from 'react';
import MapCanvas from './map';
import Panel from './panel';

export default function Main() {
  const [map, setMap] = useState<Map>();
  const [geojson, setGeojson] = useState<FeatureCollection<any, { [name: string]: any }>>();
  const [status, setStatus] = useState<Status>({ message: 'Loading map...', type: 'process' });

  const states = {
    map,
    setMap,
    geojson,
    setGeojson,
    status,
    setStatus,
  };

  return (
    <>
      <Store.Provider value={states}>
        <MapCanvas />
        <Panel />
      </Store.Provider>
    </>
  );
}
