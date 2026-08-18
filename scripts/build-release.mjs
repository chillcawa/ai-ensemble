import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const buildHome = realpathSync(homedir());
const cargoTargetDir = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(projectRoot, "src-tauri", "target");
const cargoHome = existsSync(process.env.CARGO_HOME ?? "")
  ? realpathSync(process.env.CARGO_HOME)
  : join(buildHome, ".cargo");

const forwardedArgs = process.argv.slice(2);
const hasBundleSelection = forwardedArgs.some((arg) => arg === "--bundles" || arg.startsWith("--bundles="));
const defaultBundles = process.platform === "win32"
  ? "nsis"
  : process.platform === "darwin"
    ? "app,dmg"
    : null;
const buildArgs = [
  "build",
  ...(hasBundleSelection || !defaultBundles ? [] : ["--bundles", defaultBundles]),
  ...forwardedArgs,
];

const existingEncodedFlags = (process.env.CARGO_ENCODED_RUSTFLAGS ?? "")
  .split("\x1f")
  .filter(Boolean);
const remapFlags = [
  `--remap-path-prefix=${projectRoot}=${process.platform === "win32" ? "C:\\source\\ai-ensemble" : "/source/ai-ensemble"}`,
  `--remap-path-prefix=${cargoHome}=${process.platform === "win32" ? "C:\\cargo" : "/build/cargo"}`,
  `--remap-path-prefix=${buildHome}=${process.platform === "win32" ? "C:\\build-home" : "/build/home"}`,
];
const buildEnvironment = {
  ...process.env,
  CARGO_ENCODED_RUSTFLAGS: [...existingEncodedFlags, ...remapFlags].join("\x1f"),
};

const tauriCli = join(projectRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
if (!existsSync(tauriCli)) {
  console.error("Tauri CLIがありません。先に npm install を実行してください。");
  process.exit(1);
}

console.log("AI Ensemble release build: source paths are being anonymized.");
const result = spawnSync(process.execPath, [tauriCli, ...buildArgs], {
  cwd: projectRoot,
  env: buildEnvironment,
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

if (process.platform !== "win32") {
  console.log("Binary privacy verification is skipped outside Windows.");
  process.exit(0);
}

const executablePath = join(cargoTargetDir, "release", "ai-ensemble.exe");
if (!existsSync(executablePath)) {
  console.error(`検査対象のexeが見つかりません: ${executablePath}`);
  process.exit(1);
}

const executable = readFileSync(executablePath);
const ascii = executable.toString("latin1");
const forbiddenValues = [
  buildHome,
  buildHome.replaceAll("\\", "/"),
  process.env.USERNAME && process.env.USERNAME.length >= 4 ? process.env.USERNAME : null,
].filter(Boolean);
const leakedValue = forbiddenValues.find((value) =>
  ascii.toLowerCase().includes(value.toLowerCase())
  || executable.includes(Buffer.from(value, "utf16le")),
);
if (leakedValue) {
  console.error("配布用exeにビルド環境のユーザー情報が残っています。配布を中止してください。");
  process.exit(1);
}

const secretPatterns = [
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /xai-[A-Za-z0-9_-]{20,}/,
];
if (secretPatterns.some((pattern) => pattern.test(ascii))) {
  console.error("配布用exeにAPIキーらしき文字列があります。配布を中止してください。");
  process.exit(1);
}

const peOffset = executable.readUInt32LE(0x3c);
const peSignature = executable.toString("ascii", peOffset, peOffset + 4);
const optionalHeaderOffset = peOffset + 24;
const subsystem = executable.readUInt16LE(optionalHeaderOffset + 68);
if (peSignature !== "PE\0\0" || subsystem !== 2) {
  console.error(`Windows GUI subsystemの検査に失敗しました (subsystem=${subsystem})。`);
  process.exit(1);
}

console.log("Release verification passed: user path absent, API-key pattern absent, PE subsystem GUI.");
