import { spawn, ChildProcess } from "node:child_process";
import { config } from "./config";
import { logger } from "./logger";

const activeProcesses = new Set<ChildProcess>();

export function registerShutdownKill(proc: ChildProcess): void {
  activeProcesses.add(proc);
  proc.on("close", () => activeProcesses.delete(proc));
}

export function killActiveProcesses(): void {
  for (const proc of activeProcesses) {
    try {
      proc.kill("SIGKILL");
    } catch {
      // already dead
    }
  }
  activeProcesses.clear();
}

function spawnProcess(
  binary: string,
  args: string[],
  label: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    logger.debug(`Spawning ${label}`, { args: args.join(" ") });

    const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    registerShutdownKill(proc);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      logger.debug(`[${label} stderr]`, { line: text.trim() });
    });

      proc.on("error", (err: Error) => {
        reject(new Error(`Failed to start ${label}: ${err.message}`));
      });

      proc.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${label} exited with code ${code}.\nstderr:\n${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

export async function spawnFfmpeg(args: string[]): Promise<{ stderr: string }> {
  const { stderr } = await spawnProcess(config.ffmpegPath, args, "ffmpeg");
  return { stderr };
}

export async function spawnFfprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return spawnProcess(config.ffprobePath, args, "ffprobe");
}
