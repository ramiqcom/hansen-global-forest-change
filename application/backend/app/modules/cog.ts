import { tileToBBOX } from '@mapbox/tilebelt';
import { bbox, bboxPolygon, booleanIntersects } from '@turf/turf';
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
  const bounds = tileToBBOX([x, y, z].map((x) => Number(x)));
  const polygon = bboxPolygon(bounds as [number, number, number, number]).geometry;

  // Generate color data
  const paletteSplit = palette.split(',');
  const interval = Math.abs(Number(min) - Number(max)) / (paletteSplit.length - 1);
  const colorMap = paletteSplit
    .map(
      (color, index) => `${Number(min) + interval * index} ${Color(color).rgb().array().join(' ')}`,
    )
    .join('\n');

  // Text file of the color data
  const colorFile = `${tmpFolder}/color.txt`;
  await writeFile(colorFile, colorMap);

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
      '--co="COMPRESS=ZSTD"',
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
    '--co="COMPRESS=ZSTD"',
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
    '-co',
    'QUALITY=90',
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

// Function to generate hansen data analysis
export async function hansen_data(req: FastifyRequest, tmpFolder: string) {
  // Read geojson from body
  const { geojson } = req.body as {
    geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }>;
  };

  // Save it as geojson file
  const geojsonFile = `${tmpFolder}/roi.geojson`;
  await writeFile(geojsonFile, JSON.stringify(geojson));

  // Define minimum treecover for forest cover
  const min_forest_cover = 80;

  // Generate bbox
  const bounds = bbox(geojson);
  const polygonBounds = bboxPolygon(bounds);

  // Calculate optimal shape
  const width = Math.round((Math.abs(bounds[0] - bounds[2]) * 110_000) / 30);
  const height = Math.round((Math.abs(bounds[1] - bounds[3]) * 110_000) / 30);
  const shape = [height, width];

  // Generate forest cover
  console.log('Generate forest cover');
  const treecover_vrt = await get_mosaic_vrt(polygonBounds.geometry, 'treecover2000', tmpFolder);
  const treecover_tif = await warp_cog(
    treecover_vrt,
    bounds,
    'treecover2000',
    tmpFolder,
    shape,
    geojsonFile,
  );

  // Generate forest loss
  console.log('Generate forest loss');
  const forest_loss_vrt = await get_mosaic_vrt(polygonBounds.geometry, 'lossyear', tmpFolder);
  const forest_loss_tif = await warp_cog(
    forest_loss_vrt,
    bounds,
    'lossyear',
    tmpFolder,
    shape,
    geojsonFile,
  );

  // Run analysis
  const years = [];
  for (let year = 2000; year <= 2023; year++) {
    years.push(year);
  }

  // Run promise for all
  console.log('Generate forest cover per year');
  const forestAreaPerYear = await Promise.all(
    years.map(async (year) => {
      console.log(`Generate forest cover ${year}`);
      const formula = `(A>=${min_forest_cover})*logical_or(B==0,B>(${year}-2000))`;

      // Mask image
      const forestCoverYear = `${tmpFolder}/forest_cover_${year}.tif`;
      await execute_process('gdal_calc', [
        '-A',
        treecover_tif,
        '-B',
        forest_loss_tif,
        `--calc="${formula}"`,
        `--outfile=${forestCoverYear}`,
        '--overwrite',
        '--NoDataValue=0',
        '--type=Byte',
        '--hideNoData',
        '--co="COMPRESS=ZSTD"',
      ]);

      return forestCoverYear;
    }),
  );

  // Combine all image into vrt
  const forestYearsVrt = `${tmpFolder}/forest_years.vrt`;
  await execute_process('gdalbuildvrt', ['-separate', forestYearsVrt, forestAreaPerYear.join(' ')]);

  // Calculate the statistics
  console.log('Calculate forest statistics');
  const statistics = `${tmpFolder}/statistics.json`;
  await execute_process('gdalinfo', ['-json', '-stats', '-hist', forestYearsVrt, '>', statistics]);

  // Read the statistics
  const areaHa = JSON.parse(await readFile(statistics, 'utf8'))['bands'].map(
    (band) => (band['histogram']['buckets'][1] * 900) / 10_000,
  );

  // Result
  const table = Object.fromEntries(years.map((year, index) => [year, areaHa[index]]));

  return table;
}

// Function to mosaic layer
async function get_mosaic_vrt(polygon: GeoJSON.Polygon, layer: string, tmpFolder: string) {
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
async function warp_cog(
  vrt: string,
  bounds: number[],
  layer: string,
  tmpFolder: string,
  shapes: number[] = [256, 256],
  cutline?: string,
) {
  // Create an image
  const tif = `${tmpFolder}/${layer}_image.tif`;
  const cutline_param = cutline ? `-cutline ${cutline} -crop_to_cutline` : '';
  await execute_process('gdalwarp', [
    '-te',
    bounds[0],
    bounds[1],
    bounds[2],
    bounds[3],
    '-ts',
    shapes[1],
    shapes[0],
    '-t_srs',
    'EPSG:4326',
    cutline_param,
    '-of',
    'COG',
    '-co',
    'COMPRESS=ZSTD',
    '-overwrite',
    vrt,
    tif,
  ]);
  return tif;
}
