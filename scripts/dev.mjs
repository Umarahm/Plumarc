// Starts every Plumarc service with labelled output. Ctrl+C stops all of them.
// If one service exits, the others are stopped too, so you never run half the stack.
import { spawn, spawnSync } from "node:child_process";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const WINDOWS = process.platform === "win32";

const services = [
  { name: "auth", port: 8001, color: "\x1b[35m", cwd: "auth", command: "uv run uvicorn app.main:app --port 8001 --reload" },
  { name: "backend", port: 8000, color: "\x1b[36m", cwd: "backend", command: "uv run uvicorn app.main:app --port 8000 --reload" },
  { name: "frontend", port: 3000, color: "\x1b[32m", cwd: "frontend", command: "npm run dev" },
];
const RESET = "\x1b[0m";

// Windows lets a second server share a port, so a leftover one would silently
// answer requests with old settings. Refuse to start instead.
const isListening = (port) =>
  new Promise((resolve) => {
    const socket = connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

for (const { name, port } of services) {
  if (await isListening(port)) {
    console.error(`Port ${port} (${name}) is already in use. Stop that process first.`);
    process.exit(1);
  }
}

const children = services.map((service) => {
  const child = spawn(service.command, {
    cwd: `${root}${service.cwd}`,
    shell: true, // needed on Windows for npm.cmd and uv
    detached: !WINDOWS, // gives each service its own process group to signal
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const prefix = `${service.color}[${service.name}]${RESET} `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) if (line) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    console.log(`${prefix}stopped with code ${code ?? "signal"}`);
    stopAll(code ?? 1);
  });
  return child;
});

// child.kill() would only end the shell and leave the servers running.
function stopTree({ pid }) {
  if (WINDOWS) {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // The group has already exited.
  }
}

let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(stopTree);
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => stopAll(0));
}
