import fastifyRequestContext from '@fastify/request-context';
import { bboxPolygon } from '@turf/turf';
import cluster from 'cluster';
import { config } from 'dotenv';
import fastify, { FastifyRequest } from 'fastify';
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

  // If the request is aborted then throw error
  app.addHook('onRequest', async (request, reply) => {
    // Temporary directory
    const tmpFolder = await mkdtemp('temp_');
    request.requestContext.set('tmpFolder', tmpFolder);

    request.raw.on('close', async () => {
      await deleteTempFolder(undefined, tmpFolder);
    });
  });

  // Route for visualization using COG to webmap
  app.get<COGRoute>('/cog/:z/:x/:y', COGSchema, async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;

    try {
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
      });
      res.status(200).type('webp').send(image);
    } finally {
      await deleteTempFolder(req);
    }
  });

  // Analysis route
  app.post<AnalysisRoute>('/analysis', AnalysisSchema, async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;

    try {
      // Read geojson from body
      const { geojson } = req.body;
      const data = await hansen_data({ geojson, tmpFolder });
      res.status(200).type('application/json').send(data);
    } finally {
      await deleteTempFolder(req);
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
      const image_path = await hansen_layer({ geojson, tmpFolder });
      const image_buffer = await readFile(image_path);
      res.status(200).type('image/tif').send(image_buffer);
    } finally {
      await deleteTempFolder(req);
    }
  });

  // Error handler
  app.setErrorHandler(async (error, req, res) => {
    await deleteTempFolder(req);
    const { message } = error;
    console.error(message);
    res.status(404).send({ message, status: 404 }).header('Content-Type', 'application/json');
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

async function deleteTempFolder(req?: FastifyRequest, folder?: string) {
  if (folder) {
    await rm(folder, { recursive: true, force: true });
  } else if (req) {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    await rm(tmpFolder, { recursive: true, force: true });
  }
}
