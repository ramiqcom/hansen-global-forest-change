import { tileToGeoJSON } from '@mapbox/tilebelt';
import { bbox, bboxPolygon, booleanIntersects } from '@turf/turf';
import Color from 'color';
import { readFile, writeFile } from 'fs/promises';
import { execute_process } from './server_util';

// Hansen data years
const years: number[] = [];
for (let year = 2000; year <= 2023; year++) {
  years.push(year);
}

export async function load_hansen_tiles(
  polygon: GeoJSON.Polygon | GeoJSON.Geometry,
): Promise<string[]> {
  // Load tiles collection to filter
  console.log('Filtering Hansen data');
  const tiles = (await (
    await fetch(process.env.HANSEN_TILES_COLLECTION as string)
  ).json()) as GeoJSON.FeatureCollection<any, { string: any }>;

  // Tile ids
  const tileIds = tiles.features
    .filter((feat) => booleanIntersects(feat, polygon))
    .map((feat) => feat['properties']['tile_id']);

  if (tileIds.length < 1) {
    throw new Error('No tiles!');
  }

  return tileIds;
}

// Function to generate image
export async function generate_image({
  z,
  x,
  y,
  layer,
  palette,
  min,
  max,
  year,
  min_forest_cover,
  tmpFolder,
  signal,
}: {
  z: number;
  x: number;
  y: number;
  layer: string;
  palette: string;
  min: number;
  max: number;
  tmpFolder: string;
  year?: number;
  min_forest_cover?: number;
  signal?: AbortSignal;
}): Promise<Buffer<ArrayBufferLike>> {
  // Polygon based on tile
  const polygon = tileToGeoJSON([x, y, z]);

  // Load tiles collection to filter
  const tiles = await load_hansen_tiles(polygon);

  // Generate color data
  console.log('Creating color map');
  const paletteSplit = palette.split(',');
  const interval = Math.abs(Number(min) - Number(max)) / (paletteSplit.length - 1);
  const colorMap = paletteSplit
    .map(
      (color, index) => `${Number(min) + interval * index} ${Color(color).rgb().array().join(' ')}`,
    )
    .join('\n');

  // Text file of the color data path
  const colorFile = `${tmpFolder}/color.txt`;

  // Create an image
  let tif: string;

  // Mask the raster if it is treecover2000 or forest cover
  if (layer == 'treecover2000' || layer == 'forest_cover') {
    // Mask non forest based on year
    // Generate forest loss layer
    console.log('Generating treecover and loss year data');
    const [treecover2000_tif, forest_loss_tif] = await Promise.all([
      warp_image(polygon, 'treecover2000', tiles, tmpFolder, undefined, undefined, signal),
      warp_image(polygon, 'lossyear', tiles, tmpFolder, undefined, undefined, signal),
      writeFile(colorFile, colorMap),
    ]);

    let formula = `A*logical_or(B==0,B>(${year}-2000))`;
    if (layer == 'forest_cover') {
      formula = `(A>=${min_forest_cover})*logical_or(B==0,B>(${year}-2000))`;
    }

    // Mask image
    const masked_tif = `${tmpFolder}/masked.tif`;
    console.log('Masking image');
    await execute_process('gdal_calc', [
      '-A',
      treecover2000_tif,
      '-B',
      forest_loss_tif,
      `--calc="${formula}"`,
      `--outfile=${masked_tif}`,
      '--overwrite',
      '--hideNoData',
    ]);
    tif = masked_tif;
  } else {
    console.log('Generating forest loss data');
    const [forest_loss_tif] = await Promise.all([
      warp_image(polygon, layer, tiles, tmpFolder, undefined, undefined, signal),
      writeFile(colorFile, colorMap),
    ]);
    tif = forest_loss_tif;
  }

  // Alpha band path
  const alpha = `${tmpFolder}/alpha.tif`;

  // Colored data path
  const colored = `${tmpFolder}/colored.tif`;

  // Run alpha and colored data
  console.log('Creating colored and alpha layer');
  await Promise.all([
    execute_process(
      'gdal_calc',
      ['-A', tif, `--outfile=${alpha}`, `--calc="(A!=0)*255"`, '--type=Byte', '--hideNoData'],
      signal,
    ),
    execute_process(
      'gdaldem',
      ['color-relief', tif, colorFile, colored, '-of', 'WEBP', '-b', 1],
      signal,
    ),
  ]);

  // Combine with alpha band
  console.log('Combining colored and alpha layer');
  const withAlpha = `${tmpFolder}/withAlpha.vrt`;
  await execute_process(
    'gdalbuildvrt',
    ['-separate', '-overwrite', withAlpha, colored, alpha],
    signal,
  );

  // Rescale the image
  console.log('Creating tile image');
  const rescale = `${tmpFolder}/rescale.webp`;
  await execute_process(
    'gdal_translate',
    ['-of', 'WEBP', '-outsize', 256, 256, withAlpha, rescale],
    signal,
  );

  // Open the image
  console.log('Read the image');
  const bufferImage = await readFile(rescale);

  return bufferImage;
}

// Function to generate hansen data analysis
export async function hansen_layer({
  geojson,
  tmpFolder,
}: {
  geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }>;
  tmpFolder: string;
}) {
  // Save it as geojson file
  const geojsonFile = `${tmpFolder}/roi.geojson`;
  await writeFile(geojsonFile, JSON.stringify(geojson));

  // Define minimum treecover for forest cover
  const min_forest_cover = 80;

  // Generate bbox
  const bounds = bbox(geojson);
  const polygonBounds = bboxPolygon(bounds).geometry;

  // Load tiles
  const tiles = await load_hansen_tiles(polygonBounds);

  // Calculate optimal shape
  const width = Math.round((Math.abs(bounds[0] - bounds[2]) * 110_000) / 30);
  const height = Math.round((Math.abs(bounds[1] - bounds[3]) * 110_000) / 30);
  const shape = [height, width];

  // Generate forest cover
  console.log('Generate forest cover and forest loss');
  const [treecover_tif, forest_loss_tif] = await Promise.all([
    warp_image(polygonBounds, 'treecover2000', tiles, tmpFolder, shape, geojsonFile),
    warp_image(polygonBounds, 'lossyear', tiles, tmpFolder, shape, geojsonFile),
  ]);

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
      ]);

      return forestCoverYear;
    }),
  );

  // Combine all image into vrt
  const forestYearsVrt = `${tmpFolder}/forest_years.vrt`;
  await execute_process('gdalbuildvrt', ['-separate', forestYearsVrt, forestAreaPerYear.join(' ')]);

  // Make the vrt into tif
  console.log('Make it into tif');
  const forestYearsTif = `${tmpFolder}/forest_years.tif`;
  await execute_process('gdal_translate', [
    '-of',
    'COG',
    '-co',
    'COMPRESS=ZSTD',
    forestYearsVrt,
    forestYearsTif,
  ]);

  return forestYearsTif;
}

export async function hansen_data({
  geojson,
  tmpFolder,
}: {
  geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }>;
  tmpFolder: string;
}) {
  // Generate the forest years tif
  const forestYearsTif = await hansen_layer({ geojson, tmpFolder });

  // Calculate the statistics
  console.log('Calculate forest statistics');
  const statistics = `${tmpFolder}/statistics.json`;
  await execute_process('gdalinfo', ['-json', '-stats', '-hist', forestYearsTif, '>', statistics]);

  // Calculate the area of forest data
  const areaHa = JSON.parse(await readFile(statistics, 'utf8'))['bands'].map(
    (band) => (band['histogram']['buckets'][1] * 900) / 10_000,
  );

  // Result
  const table = years.map((year, index) => new Object({ year, areaHa: areaHa[index] }));

  return table;
}

// Function to warp and clip image
async function warp_image(
  polygon: GeoJSON.Polygon | GeoJSON.Geometry,
  layer: string,
  tiles: string[],
  tmpFolder: string,
  shapes: number[] = [512, 512],
  cutline?: string,
  signal?: AbortSignal,
) {
  // Bounds
  const bounds = bbox(polygon);

  // Hansen layer prefix
  const hansen_prefix = process.env.HANSEN_LAYER_PREFIX;

  // Conditional if tile_id is more than one
  let layerPath: string;

  if (tiles.length > 1) {
    // Get the layer url
    const image_urls = tiles.map((tile_id) => `/vsicurl/${hansen_prefix}${layer}_${tile_id}.tif`);

    // Save urls as text
    const images_list = `${tmpFolder}/${layer}_image_list.txt`;
    await writeFile(images_list, image_urls.join('\n'));

    // Create VRT
    const vrt = `${tmpFolder}/${layer}_collection.vrt`;
    await execute_process('gdalbuildvrt', ['-overwrite', '-input_file_list', images_list, vrt]);

    layerPath = vrt;
  } else {
    layerPath = `/vsicurl/${hansen_prefix}${layer}_${tiles[0]}.tif`;
  }

  // Create an image
  const tif = `${tmpFolder}/${layer}_image.tif`;

  if (cutline) {
    await execute_process(
      'gdalwarp',
      [
        '-te',
        bounds[0],
        bounds[1],
        bounds[2],
        bounds[3],
        '-ts',
        shapes[1],
        shapes[0],
        '-cutline',
        cutline,
        '-crop_to_cutline',
        '-overwrite',
        layerPath,
        tif,
      ],
      signal,
    );
  } else {
    await execute_process(
      'gdal_translate',
      [
        '-projwin',
        bounds[0],
        bounds[3],
        bounds[2],
        bounds[1],
        '-outsize',
        shapes[1],
        shapes[0],
        layerPath,
        tif,
      ],
      signal,
    );
  }

  return tif;
}
