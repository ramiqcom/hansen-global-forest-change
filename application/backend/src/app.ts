import { fastifyRequestContext } from '@fastify/request-context';
import { bboxPolygon } from '@turf/turf';
import cluster from 'cluster';
import { config } from 'dotenv';
import fastify from 'fastify';
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

declare module '@fastify/request-context' {
  interface RequestContextData {
    tmpFolder: string;
    signal: AbortSignal | undefined;
  }
}

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

  app.register(fastifyRequestContext);

  // Hook when the request is started
  app.addHook('onRequest', async (req, res) => {
    console.log('Creating temporary folder');
    const tmpFolder = await mkdtemp('temp');
    req.requestContext.set('tmpFolder', tmpFolder);

    const controller = new AbortController();
    req.requestContext.set('signal', controller.signal);

    req.raw.on('close', () => {
      console.log('Request is closing');

      if (req.raw.aborted) {
        console.log('Aborting process');
        controller.abort();
      }
    });
  });

  // Route for visualization using COG to webmap
  app.get<COGRoute>('/cog/:z/:x/:y', COGSchema, async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    try {
      const signal = req.requestContext.get('signal');

      // Parse the input
      const { z, x, y } = req.params;
      const { layer, palette, min, max, year, min_forest_cover } = req.query;

      console.log('Generating image');
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

      console.log('Sending response');
      res.status(200).type('webp').send(image);
    } finally {
      console.log('Deleting temporary folder');
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Analysis route
  app.post<AnalysisRoute>('/analysis', AnalysisSchema, async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;

    try {
      // Read geojson from body
      const { geojson } = req.body;

      console.log('Generating data');
      const data = await hansen_data({ geojson, tmpFolder });

      console.log('Sending response');
      res.status(200).type('application/json').send(data);
    } finally {
      console.log('Deleting temporary folder');
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Analysis route
  app.get<DownloadRoute>('/download', DownloadSchema, async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    try {
      const bounds = req.query.bounds.split(',').map((x) => Number(x));
      const geojson: GeoJSON.FeatureCollection<any, { [name: string]: any }> = {
        type: 'FeatureCollection',
        features: [bboxPolygon(bounds as [number, number, number, number])],
      };

      console.log('Generating layer');
      const image_path = await hansen_layer({ geojson, tmpFolder });
      const image_buffer = await readFile(image_path);

      console.log('Sending response');
      res.status(200).type('image/tif').send(image_buffer);
    } finally {
      console.log('Deleting temporary folder');
      await rm(tmpFolder, { recursive: true, force: true });
    }
  });

  // Error handling
  app.setErrorHandler(async ({ message, code }, req, res) => {
    console.error(message);
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    await rm(tmpFolder, { recursive: true, force: true });
    res.status(Number(code)).type('application/json').send({ message });
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
