/**
 * Spawn ngrok even when npm runs cmd.exe without winget's updated PATH (Windows).
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

function findNgrokExe() {
  const envPath = process.env.NGROK_PATH || process.env.NGROK_EXE;
  if (envPath && existsSync(envPath)) return envPath;

  if (process.platform !== "win32") return "ngrok";

  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const shim = path.join(localApp, "Microsoft", "WinGet", "Links", "ngrok.exe");
  if (existsSync(shim)) return shim;

  const packages = path.join(localApp, "Microsoft", "WinGet", "Packages");
  try {
    const dirs = readdirSync(packages).filter((d) => d.startsWith("Ngrok.Ngrok_"));
    for (const d of dirs) {
      const exe = path.join(packages, d, "ngrok.exe");
      if (existsSync(exe)) return exe;
    }
  } catch {
    /* ignore */
  }

  return "ngrok";
}

const exe = findNgrokExe();
const port = process.env.PORT || "5050";
const child = spawn(exe, ["http", port], {
  stdio: "inherit",
  shell: false,
});

child.on("error", (err) => {
  console.error(err.message);
  console.error(
    "Install ngrok: winget install Ngrok.Ngrok — then: ngrok config add-authtoken <token from dashboard.ngrok.com>"
  );
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
