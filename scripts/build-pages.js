#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { writeEnvConfig } = require("./generate-env-config");

const frontendDir = path.resolve(__dirname, "..");
const distDir = path.join(frontendDir, "dist");
const staticEntries = [
  "index.html",
  "login.html",
  "admin.html",
  "game.js",
  "login.js",
  "admin.js",
  "app-config.js",
  "style.css",
  "users.json",
  "assets",
  "src",
  "_headers",
];

function copyEntry(entryName) {
  const sourcePath = path.join(frontendDir, entryName);
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  const destinationPath = path.join(distDir, entryName);
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true });
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

staticEntries.forEach(copyEntry);

const envConfigResult = writeEnvConfig(path.join(distDir, "env-config.js"));

console.log(`Built Cloudflare Pages output in ${path.relative(frontendDir, distDir)}`);
console.log(`SERVER_API_URL=${envConfigResult.normalizedApiUrl}`);
