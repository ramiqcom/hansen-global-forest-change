'use server';

import { booleanIntersects } from '@turf/turf';
import { writeFile } from 'fs/promises';
import { execute_process } from './server_util';

// Function to mosaic layer
export async function get_mosaic_vrt(polygon: GeoJSON.Polygon, layer: string, tmpFolder: string) {
  // Load tiles collection to filter
  const tiles: GeoJSON.FeatureCollection<any> = await (
    await fetch(process.env.HANSEN_TILES_COLLECTION)
  ).json();

  // Hansen layer prefix
  const hansen_prefix = process.env.HANSEN_LAYER_PREFIX;

  // Get the layer url
  const image_urls = tiles.features
    .filter((feat) => booleanIntersects(feat, polygon))
    .map((feat) => `/vsicurl/${hansen_prefix}${layer}_${feat.properties.tile_id}.tif`)
    .join('\n');

  // Text file
  const image_list = `${tmpFolder}/${layer}_image_list.txt`;
  await writeFile(image_list, image_urls);

  // Create VRT
  const vrt = `${tmpFolder}/${layer}_collection.vrt`;
  await execute_process('gdalbuildvrt', ['-overwrite', '-input_file_list', image_list, vrt]);

  return vrt;
}

// Function to warp and clip image
export async function warp_cog(vrt: string, bounds: number[], layer: string, tmpFolder: string) {
  // Create an image
  const tif = `${tmpFolder}/${layer}_image.tif`;
  await execute_process('gdalwarp', [
    '-te',
    bounds[0],
    bounds[1],
    bounds[2],
    bounds[3],
    '-ts',
    256,
    256,
    '-t_srs',
    'EPSG:4326',
    '-overwrite',
    '-wm',
    '8G',
    '-multi',
    '-wo',
    'NUM_THREADS=ALL_CPUS',
    vrt,
    tif,
  ]);
  return tif;
}
