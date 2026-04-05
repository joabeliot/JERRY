import { log } from "./core/logger.js";
import { startDiscord, stopDiscord } from "./channels/discord.js";
import { startCronJobs } from "./cron/briefings.js";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";

const PID_FILE = join(import.meta.dirname, "../jerry/jerry.pid");

/**
 * Check if a process with the given PID is actually running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = just check existence
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire exclusive ownership. If another instance is alive, kill it first.
 */
function acquireLock(): void {
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
    if (!isNaN(oldPid) && oldPid !== process.pid && isProcessAlive(oldPid)) {
      log.warn({ oldPid }, "Another Jerry instance is running — killing it");
      try {
        process.kill(oldPid, "SIGTERM");
      } catch {
        // already gone
      }
      const deadline = Date.now() + 5000;
      while (isProcessAlive(oldPid) && Date.now() < deadline) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      }
      if (isProcessAlive(oldPid)) {
        log.warn({ oldPid }, "Old instance did not exit — sending SIGKILL");
        try { process.kill(oldPid, "SIGKILL"); } catch { /* gone */ }
      }
    }
  }
  writeFileSync(PID_FILE, String(process.pid), "utf8");
  log.info({ pid: process.pid }, "PID lock acquired");
}

function deletePid(): void {
  try {
    if (existsSync(PID_FILE)) {
      const contents = readFileSync(PID_FILE, "utf8").trim();
      if (contents === String(process.pid)) {
        unlinkSync(PID_FILE);
      }
    }
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  log.info("Starting Jerry...");

  acquireLock();

  // Start Discord channel
  await startDiscord();

  // Start proactive cron jobs
  startCronJobs();

  log.info("Jerry is live. Discord connected, cron jobs scheduled.");

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down Jerry...");
    await stopDiscord();
    deletePid();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  process.on("exit", deletePid);
}

main().catch((err) => {
  log.fatal({ err }, "Fatal startup error");
  deletePid();
  process.exit(1);
});
