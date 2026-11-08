#!/usr/bin/env node
/**
 * Cliente MCP mínimo por stdio para `next-intl-mcp-server`.
 *
 * Este repo no tiene un cliente MCP nativo en el harness, así que hablamos
 * JSON-RPC 2.0 por stdin/stdout, que es el transporte estándar de MCP.
 *
 * Uso:
 *   node 01-TOOLS/NEXT-INTL/mcp-client.mjs list
 *   node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_scaffold '{"locales":["es","en","pt"],"defaultLocale":"es","routing":"locale-prefix"}'
 *   node 01-TOOLS/NEXT-INTL/mcp-client.mjs call next_intl_internalize @payload.json salida.json
 *
 * En Windows el servidor se lanza con `cmd.exe /c npx -y next-intl-mcp-server`
 * porque npx es un .cmd.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";

const SERVER = process.env.NEXT_INTL_MCP_CMD || "npx -y next-intl-mcp-server";
const PROTOCOL_VERSION = "2024-11-05";
const TIMEOUT_MS = Number(process.env.NEXT_INTL_MCP_TIMEOUT_MS || 180_000);

function startServer() {
  const isWindows = process.platform === "win32";
  const child = isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", SERVER], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })
    : spawn("sh", ["-c", SERVER], { stdio: ["pipe", "pipe", "pipe"] });

  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let nextId = 1;
  let stderr = "";

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });

  child.on("exit", (code) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(`El servidor MCP terminó con código ${code}. stderr: ${stderr}`));
    }
    pending.clear();
  });

  function request(method, params) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout de ${TIMEOUT_MS} ms esperando ${method}. stderr: ${stderr}`));
      }, TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async function initialize() {
    const result = await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "gadu-i18n", version: "1.0.0" },
    });
    notify("notifications/initialized", {});
    return result;
  }

  return {
    initialize,
    request,
    close: () => child.kill(),
    getStderr: () => stderr,
  };
}

function readPayload(raw) {
  if (!raw) return {};
  if (raw.startsWith("@")) return JSON.parse(readFileSync(raw.slice(1), "utf8"));
  return JSON.parse(raw);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    console.error("Uso: mcp-client.mjs list | call <tool> <json|@archivo> [salida.json]");
    process.exit(2);
  }

  const server = startServer();
  try {
    const init = await server.initialize();

    if (command === "list") {
      const tools = await server.request("tools/list", {});
      console.log(JSON.stringify({ server: init.serverInfo, tools }, null, 2));
      return;
    }

    if (command === "internalize") {
      const [file, componentName, outputPath] = rest;
      if (!file) throw new Error("Falta el archivo a internalizar.");
      const source = readFileSync(file, "utf8");
      const result = await server.request("tools/call", {
        name: "next_intl_internalize",
        arguments: { source, componentName, targetLocales: ["en", "pt"] },
      });
      const text = JSON.stringify(result, null, 2);
      if (outputPath) {
        writeFileSync(outputPath, `${text}\n`, "utf8");
        console.log(`OK internalize ${file} -> ${outputPath}`);
      } else {
        console.log(text);
      }
      return;
    }

    if (command === "call") {
      const [tool, payloadRaw, outputPath] = rest;
      if (!tool) throw new Error("Falta el nombre de la herramienta.");
      const result = await server.request("tools/call", {
        name: tool,
        arguments: readPayload(payloadRaw),
      });
      const text = JSON.stringify(result, null, 2);
      if (outputPath) {
        writeFileSync(outputPath, `${text}\n`, "utf8");
        console.log(`OK ${tool} -> ${outputPath}`);
      } else {
        console.log(text);
      }
      return;
    }

    throw new Error(`Comando desconocido: ${command}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
