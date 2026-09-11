#!/usr/bin/env node
/**
 * PUZZLECANDY требует Node 22+.
 * Vite 8 / TanStack Start / rolldown используют node:util.styleText —
 * этого экспорта нет в Node 18, поэтому `npm run dev` падает с SyntaxError.
 */
const raw = process.versions.node ?? "0.0.0";
const [major = 0, minor = 0] = raw.split(".").map((n) => Number.parseInt(n, 10) || 0);
const ok = major > 22 || (major === 22 && minor >= 12);

if (!ok) {
  console.error("");
  console.error("  PUZZLECANDY не запустится на Node " + process.version);
  console.error("  Нужен Node.js 22.12 или новее.");
  console.error("");
  console.error("  Ubuntu / Debian — поставьте Node 22 одной командой:");
  console.error("");
  console.error("    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -");
  console.error("    sudo apt-get install -y nodejs");
  console.error("    node -v");
  console.error("");
  console.error("  Или через nvm (без sudo):");
  console.error("");
  console.error("    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash");
  console.error("    source ~/.nvm/nvm.sh");
  console.error("    nvm install 22");
  console.error("    nvm use 22");
  console.error("");
  process.exit(1);
}
