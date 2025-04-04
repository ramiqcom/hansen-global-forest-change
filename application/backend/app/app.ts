import { config } from 'dotenv';
import fastify from 'fastify';
import { mkdtemp, rm } from 'fs/promises';
import process from 'process';
import { generate_image } from './modules/cog';

// Run dotenv
config();

// You must listen on the port Cloud Run provides
const port = Number(process.env.PORT || 8000);

// You must listen on all IPV4 addresses in Cloud Run
const host = '0.0.0.0';

// App setting
const app = fastify({
  trustProxy: true,
});

// Error handler
app.setErrorHandler(async (error, req, res) => {
  const { message } = error;
  console.error(message);
  res.status(404).send({ message, status: 404 }).header('Content-Type', 'application/json');
});

// Get route
app.get('/cog/:z/:x/:y', async (req, res) => {
  // Temporary directory
  const tmpFolder = await mkdtemp('temp_');
  try {
    const image = await generate_image(req, tmpFolder);
    res.status(200).type('webp').send(image);
  } finally {
    // Delete temp folder
    await rm(tmpFolder, { recursive: true, force: true });
  }
});

// Run the appss
try {
  const address = await app.listen({ port, host });
  console.log(`Listening on ${address}`);
} catch (err) {
  console.log(err);
  process.exit(1);
}
