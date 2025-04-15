import archiver from 'archiver';
import { exec } from 'child_process';
import { createWriteStream } from 'fs';
export async function execute_process(
  cmd: string,
  args: any[],
  signal?: AbortSignal,
): Promise<number> {
  return await new Promise((resolve, reject) => {
    exec(`${cmd} ${args.join(' ')}`, { signal }, (error, stdout, stderr) => {
      if (stderr) {
        console.error(stderr);
      }

      if (stdout) {
        console.log(stdout);
      }

      if (error) {
        reject(error);
      } else {
        resolve(0);
      }
    });
  });
}

export async function createZip(outputPath: string, files: { path: string; name: string }[]) {
  return await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve({ bytes: archive.pointer(), path: outputPath }));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    archive.finalize();
  });
}
