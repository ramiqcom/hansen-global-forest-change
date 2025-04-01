import { tileToGeoJSON } from '@mapbox/tilebelt';
import { bbox, booleanIntersects } from '@turf/turf';
import Color from 'color';
import { FastifyRequest } from 'fastify';
import { readFile, writeFile } from 'fs/promises';
import { execute_process } from './server_util';

// Function to generate image
export async function generate_image(
  req: FastifyRequest,
  tmpFolder: string,
): Promise<Buffer<ArrayBufferLike>> {
  const { z, x, y } = req.params as Record<string, number>;
  const { layer, palette, min, max, year, min_forest_cover } = req.query as {
    layer: string;
    year?: number;
    min_forest_cover?: number;
    palette: string;
    min: number;
    max: number;
  };

  // Generate color data
  const interval = Math.abs(min - max) / (palette.length - 1);
  const colorMap = palette
    .split(',')
    .map((color, index) => `${min + interval * index} ${Color(color).rgb().array().join(' ')}`)
    .join('\n');

  // Text file of the color data
  const colorFile = `${tmpFolder}/color.txt`;
  await writeFile(colorFile, colorMap);

  // Generate bbox or bounds to filter imagery
  const polygon = tileToGeoJSON([x, y, z]);
  const bounds = bbox(polygon);

  // Create VRT
  const vrt = await get_mosaic_vrt(
    polygon,
    layer == 'forest_cover' ? 'treecover2000' : layer,
    tmpFolder,
  );

  // Create an image
  let tif = await warp_cog(vrt, bounds, layer, tmpFolder);

  // Mask the raster if it is treecover2000 or forest cover
  if (layer == 'treecover2000' || layer == 'forest_cover') {
    // Mask non forest based on year
    // Generate forest loss layer
    const forest_loss_vrt = await get_mosaic_vrt(polygon, 'lossyear', tmpFolder);
    const forest_loss_tif = await warp_cog(forest_loss_vrt, bounds, 'lossyear', tmpFolder);

    let formula = `A*logical_or(B==0,B>(${year}-2000))`;
    if (layer == 'forest_cover') {
      formula = `(A>=${min_forest_cover})*logical_or(B==0,B>(${year}-2000))`;
    }

    // Mask image
    const masked_tif = `${tmpFolder}/masked.tif`;
    await execute_process('gdal_calc', [
      '-A',
      tif,
      '-B',
      forest_loss_tif,
      `--calc="${formula}"`,
      `--outfile=${masked_tif}`,
      '--overwrite',
      '--hideNoData',
    ]);
    tif = masked_tif;
  }

  // Get the alpha band
  const alpha = `${tmpFolder}/alpha.tif`;

  // Create masked data or alpha band
  await execute_process('gdal_calc', [
    '-A',
    tif,
    `--outfile=${alpha}`,
    `--calc="(A!=0)*255"`,
    '--type=Byte',
    '--hideNoData',
  ]);

  // Color it with gdaldem
  const colored = `${tmpFolder}/colored.tif`;
  await execute_process('gdaldem', [
    'color-relief',
    tif,
    colorFile,
    colored,
    '-of',
    'WEBP',
    '-b',
    1,
  ]);

  // Combine with alpha band
  const withAlpha = `${tmpFolder}/withAlpha.vrt`;
  await execute_process('gdalbuildvrt', ['-separate', '-overwrite', withAlpha, colored, alpha]);

  // Rescale the image
  const rescale = `${tmpFolder}/rescale.webp`;
  await execute_process('gdal_translate', [
    '-of',
    'WEBP',
    '-ot',
    'Byte',
    '-outsize',
    256,
    256,
    withAlpha,
    rescale,
  ]);

  // Open the image
  const bufferImage = await readFile(rescale);

  return bufferImage;
}

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
