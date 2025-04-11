import fastifyRequestContext from '@fastify/request-context';
import cluster from 'cluster';
import { config } from 'dotenv';
import fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import cpus from 'os';
import process from 'process';
import { generate_image, hansen_data } from './modules/cog';

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

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
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
      if (request.raw.aborted) {
        await rm(tmpFolder, { recursive: true, force: true });
        throw new Error('Request is aborted');
      }
    });
  });

  // Get route
  app.get('/cog/:z/:x/:y', async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    const image = await generate_image(req, tmpFolder);
    res.status(200).type('webp').send(image);
  });

  // Analysis route
  app.post('/analysis', async (req, res) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    const data = await hansen_data(req, tmpFolder);
    res.status(200).type('application/zip').send(data);
  });

  // On close
  app.addHook('onResponse', async (req, res) => {
    // Delete temp folder
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    await rm(tmpFolder, { recursive: true, force: true });
  });

  // On error
  app.addHook('onError', async (req) => {
    const tmpFolder = req.requestContext.get('tmpFolder') as string;
    await rm(tmpFolder, { recursive: true, force: true });
  });

  // Error handler
  app.setErrorHandler(async (error, req, res) => {
    const { message } = error;
    console.error(message);
    res.status(404).send({ message, status: 404 }).header('Content-Type', 'application/json');
  });

  // Run the appss
  try {
    const address = await app.listen({ port, host });
    console.log(`Listening on ${address}`);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }

  console.log(`Worker ${process.pid} started`);
}
