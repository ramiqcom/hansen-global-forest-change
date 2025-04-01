import cluster from 'cluster';
import { config } from 'dotenv';
import fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import cpus from 'os';
import process from 'process';
import { generate_image } from './modules/cog';

// Run dotenv
config();

// You must listen on the port Cloud Run provides
const port = Number(process.env.PORT || 8000);

// You must listen on all IPV4 addresses in Cloud Run
const host = '0.0.0.0';

// CPU
const numCPUs = cpus.availableParallelism();

// Controller
const controller = new AbortController();

// Create cluster
if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    controller.abort();
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
  // App setting
  const app = fastify({
    trustProxy: true,
  });

  // Error handler
  app.setErrorHandler(async (error, req, res) => {
    controller.abort();
    const { message } = error;
    console.error(message);
    res.status(404).send({ message, status: 404 }).header('Content-Type', 'application/json');
  });

  // Get route
  app.get('/cog/:z/:x/:y', async (req, res) => {
    // Temporary directory
    const tmpFolder = await mkdtemp('temp_');
    const image = await generate_image(req, tmpFolder);
    res.status(200).type('webp').send(image);
    setImmediate(async () => {
      // Delete temp folder
      await rm(tmpFolder, { recursive: true, force: true });
    });
  });

  // Run the appss
  try {
    const address = await app.listen({ port, host });
    console.log(`Listening on ${address}`);
  } catch (err) {
    controller.abort();
    console.log(err);
    process.exit(1);
  }

  console.log(`Worker ${process.pid} started`);
}
