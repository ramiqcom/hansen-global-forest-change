export type COGRoute = {
  Params: {
    z: number;
    x: number;
    y: number;
  };
  Querystring: {
    layer: string;
    palette: string;
    min: number;
    max: number;
    year?: number;
    min_forest_cover?: number;
  };
};

export type AnalysisRoute = {
  Body: {
    geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }>;
  };
};

export type DownloadRoute = {
  Querystring: {
    bounds: string;
  };
};

export const COGSchema = {
  schema: {
    params: {
      type: 'object',
      properties: {
        z: { type: 'integer' },
        x: { type: 'integer' },
        y: { type: 'integer' },
      },
    },
    querystring: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        palette: { type: 'string' },
        min: { type: 'integer' },
        max: { type: 'integer' },
        year: { type: 'integer' },
        min_forest_cover: { type: 'integer' },
      },
      required: ['layer', 'palette', 'min', 'max'],
    },
  },
};

export const AnalysisSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['geojson'],
      properties: {
        geojson: {
          type: 'object',
        },
      },
    },
  },
};

export const DownloadSchema = {
  schema: {
    querystring: {
      type: 'object',
      required: ['bounds'],
      properties: {
        bounds: {
          type: 'string',
        },
      },
    },
  },
};
