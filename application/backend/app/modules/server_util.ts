import { exec } from 'child_process';
export async function execute_process(cmd: string, args: any[]): Promise<number> {
  return await new Promise((resolve, reject) => {
    exec(`${cmd} ${args.join(' ')}`, (error, stdout, stderr) => {
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
