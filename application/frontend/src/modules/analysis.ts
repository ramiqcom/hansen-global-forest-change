'use server';

import JSZip from 'jszip';

export async function analysis_hansen(
  geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }>,
) {
  try {
    const res = await fetch(`${process.env.COG_SERVER}/analysis`, {
      method: 'post',
      body: JSON.stringify({
        geojson,
      }),
      headers: { 'Content-type': 'application/json' },
    });

    if (res.ok) {
      const data = await res.arrayBuffer();
      const extract = await JSZip.loadAsync(data);
      const table = JSON.parse(await extract.file('table.json').async('string'));
      const layer = await extract.file('layer.tif').async('arraybuffer');
      return { table, layer };
    } else {
      const data = await res.json();
      throw new Error(data.message);
    }
  } catch ({ message }) {
    throw new Error(message);
  }
}
