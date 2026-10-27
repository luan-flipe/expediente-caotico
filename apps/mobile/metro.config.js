// Metro do Expo já entende o monorepo pnpm; aqui só entram os formatos dos modelos 3D.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
for (const ext of ["glb", "m4a", "mp3", "ttf"]) {
  if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);
}

module.exports = config;
