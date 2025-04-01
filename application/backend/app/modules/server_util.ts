import { spawn } from 'child_process';
export async function execute_process(cmd: string, args: any[]): Promise<number> {
  return await new Promise((resolve, reject) => {
    const process = spawn(cmd, args);
    const output = [];
    const error = [];

    process.stdout.on('data', (data) => {
      output.push(data);
    });

    process.stderr.on('data', (data) => {
      error.push(data);
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(output.join('\n'));
        resolve(0);
      } else {
        const message = error.join('\n');
        console.error(message);
        reject(new Error(message));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}
