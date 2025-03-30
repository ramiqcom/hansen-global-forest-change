import { FeatureCollection } from 'geojson';
import { Map } from 'maplibre-gl';
import { Dispatch, SetStateAction } from 'react';

export type SetState<T> = Dispatch<SetStateAction<T>>;

export type Option = { label: string; value: any };
export type Options = Option[];
export type Status = { message: string; type: 'success' | 'failed' | 'process' };

export type MainStore = {
  map: Map;
  setMap: SetState<Map>;
  geojson: FeatureCollection<any, { [name: string]: any }>;
  setGeojson: SetState<FeatureCollection<any, { [name: string]: any }>>;
  status: Status;
  setStatus: SetState<Status>;
};
