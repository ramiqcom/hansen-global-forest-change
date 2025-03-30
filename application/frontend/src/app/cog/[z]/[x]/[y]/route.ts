import { execute_process } from '@/modules/server_util';
import { tileToGeoJSON } from '@mapbox/tilebelt';
import { bbox, booleanIntersects } from '@turf/turf';
import Color from 'color';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

// Load tiles collection to filter
const tiles: GeoJSON.FeatureCollection<any> = await (
  await fetch(process.env.HANSEN_TILES_COLLECTION)
).json();

// Hansen layer prefix
const hansen_prefix = process.env.HANSEN_LAYER_PREFIX;

export async function GET(req: NextRequest) {
  // Temporary directory
  const tmpFolder = await mkdtemp('temp_');

  try {
    const { nextUrl } = req;
    const { pathname, searchParams } = nextUrl;
    const [z, x, y] = pathname
      .split('/')
      .slice(2)
      .map((x) => Number(x));

    const layer = searchParams.get('layer');
    const palette = searchParams
      .get('palette')
      .split(',')
      .map((color) => Color(color).rgb().array());
    const min = Number(searchParams.get('min'));
    const max = Number(searchParams.get('max'));
    const interval = Math.abs(min - max) / (palette.length - 1);
    const colorMap = palette
      .map((color, index) => `${min + interval * index} ${color.join(' ')}`)
      .join('\n');
    // Text file
    const colorFile = `${tmpFolder}/color.txt`;
    await writeFile(colorFile, colorMap);

    // Generate bbox or bounds to filter imagery
    const polygon = tileToGeoJSON([x, y, z]);
    const bounds = bbox(polygon);

    // Get the layer url
    const image_urls = tiles.features
      .filter((feat) => booleanIntersects(feat, polygon))
      .map((feat) => `/vsicurl/${hansen_prefix}${layer}_${feat.properties.tile_id}.tif`)
      .join('\n');

    // Text file
    const image_list = `${tmpFolder}/image_list.txt`;
    await writeFile(image_list, image_urls);

    // Create VRT
    const vrt = `${tmpFolder}/collection.vrt`;
    await execute_process('gdalbuildvrt', ['-overwrite', '-input_file_list', image_list, vrt]);

    // Create an image
    const tif = `${tmpFolder}/image.tif`;
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
      '-dstalpha',
      '-wm',
      '8G',
      '-multi',
      '-wo',
      'NUM_THREADS=ALL_CPUS',
      vrt,
      tif,
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

    // Get the alpha band
    const alpha = `${tmpFolder}/alpha.vrt`;
    await execute_process('gdalbuildvrt', ['-b', 2, '-overwrite', alpha, tif]);

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

    // Return the image
    return new NextResponse(bufferImage, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    });
  } catch ({ message }) {
    console.error(message);
    return new NextResponse(message, { status: 404 });
  } finally {
    // Delete temp folder
    await rm(tmpFolder, { recursive: true, force: true });
  }
}

// await execute_process(`gdalwarp \
//               -te ${bounds[0]} ${bounds[1]} ${bounds[2]} ${bounds[3]} \
//               -ts 256 256 \
//               -t_srs EPSG:4326 \
//               -overwrite \
//               -wm 8G \
//               -multi \
//               -wo NUM_THREADS=ALL_CPUS \
//               ${source_path} \
//               ${target_path}
//             `);
