import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function findPackageFile(path: string, moduleUrl: string): Promise<string> {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const candidate = resolve(directory, path);
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Evergreen package file not found: ${path}`);
    directory = parent;
  }
}
