import { get_mosaic_vrt, warp_cog } from '@/modules/cog';
import { execute_process } from '@/modules/server_util';
import { tileToGeoJSON } from '@mapbox/tilebelt';
import { bbox } from '@turf/turf';
import Color from 'color';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';

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

    // Generate color data
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
      const year = Number(searchParams.get('year'));

      // Mask non forest based on year
      // Generate forest loss layer
      const forest_loss_vrt = await get_mosaic_vrt(polygon, 'lossyear', tmpFolder);
      const forest_loss_tif = await warp_cog(forest_loss_vrt, bounds, 'lossyear', tmpFolder);

      let formula = `A*logical_or(B==0,B>(${year}-2000))`;
      if (layer == 'forest_cover') {
        const min_forest_cover = Number(searchParams.get('min_forest_cover'));
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
