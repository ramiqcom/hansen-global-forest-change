import { FeatureCollection } from 'geojson';
import { Map } from 'maplibre-gl';
import { Dispatch, SetStateAction } from 'react';

export type SetState<T> = Dispatch<SetStateAction<T>>;

export type Option = { label: string; value: any; [key: string]: any };
export type Options = Option[];
export type Status = { message: string; type: 'success' | 'failed' | 'process' | 'other' };

export type MainStore = {
  map: Map;
  setMap: SetState<Map>;
  geojson: FeatureCollection<any, { [name: string]: any }>;
  setGeojson: SetState<FeatureCollection<any, { [name: string]: any }>>;
  status: Status;
  setStatus: SetState<Status>;
  layers: Options;
  layer: Option;
  setLayer: SetState<Option>;
  year: number;
  setYear: SetState<number>;
  minForestCover: number;
  setMinForestCover: SetState<number>;
};
