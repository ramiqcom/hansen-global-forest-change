'use server';

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

    const data = await res.json();

    if (res.ok) {
      return data;
    } else {
      throw new Error(data.message);
    }
  } catch ({ message }) {
    throw new Error(message);
  }
}
