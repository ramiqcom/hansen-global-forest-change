import { bboxPolygon } from '@turf/turf';
import cluster from 'cluster';
import { config } from 'dotenv';
import fastify from 'fastify';
import fastifyGracefulShutdown from 'fastify-graceful-shutdown';
import { mkdtemp, readFile, rm } from 'fs/promises';
import cpus from 'os';
import process from 'process';
import { generate_image, hansen_data, hansen_layer } from './modules/cog';
import {
  AnalysisRoute,
  AnalysisSchema,
  COGRoute,
  COGSchema,
  DownloadRoute,
  DownloadSchema,
} from './modules/type_and_schema';

// Run dotenv
config();

// You must listen on the port Cloud Run provides
const port = Number(process.env.PORT || 8000);

// You must listen on all IPV4 addresses in Cloud Run
const host = '0.0.0.0';

// CPU
const numCPUs = cpus.availableParallelism();

// Create cluster
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', async (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died\nRestarting...`);
    cluster.fork();
  });
} else {
  // App setting
  const app = fastify({
    trustProxy: true,
  });

  app.register(fastifyGracefulShutdown);

  app.after(() => {
    app.gracefulShutdown((signal, next) => {
      app.log.info('Received signal to shutdown: %s', signal);
      next();
    });
  });

  // Route for visualization using COG to webmap
  app.get<COGRoute>('/cog/:z/:x/:y', COGSchema, async (req, res) => {
    const tmpFolder = await mkdtemp('temp');
    const controller = new AbortController();
    const signal = controller.signal;
    try {
      // When the request is aborted, abort the signal
      req.raw.on('close', async () => {
        if (req.raw.aborted) {
          controller.abort();
          await rm(tmpFolder, { recursive: true, force: true });
        }
      });

      // Parse the input
      const { z, x, y } = req.params;
      const { layer, palette, min, max, year, min_forest_cover } = req.query;
      const image = await generate_image({
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
      });
      res.status(200).type('webp').send(image);
    } catch ({ message }) {
      throw new Error(message);
    } finally {
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Analysis route
  app.post<AnalysisRoute>('/analysis', AnalysisSchema, async (req, res) => {
    const tmpFolder = await mkdtemp('temp');
    try {
      // Read geojson from body
      const { geojson } = req.body;
      const data = await hansen_data({ geojson, tmpFolder });
      res.status(200).type('application/json').send(data);
    } catch ({ message }) {
      throw new Error(message);
    } finally {
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Analysis route
  app.get<DownloadRoute>('/download', DownloadSchema, async (req, res) => {
    const tmpFolder = await mkdtemp('temp');
    try {
      const bounds = req.query.bounds.split(',').map((x) => Number(x));
      const geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }> = {
        type: 'FeatureCollection',
        features: [bboxPolygon(bounds as [number, number, number, number])],
      };
      const image_path = await hansen_layer({ geojson, tmpFolder });
      const image_buffer = await readFile(image_path);
      res.status(200).type('image/tif').send(image_buffer);
    } catch ({ message }) {
      throw new Error(message);
    } finally {
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Run the appss
  try {
    const address = await app.listen({ port, host });
    console.log(`Listening on ${address}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`Worker ${process.pid} started`);
}
