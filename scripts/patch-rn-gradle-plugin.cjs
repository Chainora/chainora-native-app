const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'gradle-plugin',
  'settings.gradle.kts',
);

const oldSnippet =
  'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("0.5.0") }';
const newSnippet =
  'plugins { id("org.gradle.toolchains.foojay-resolver-convention").version("1.0.0") }';

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

const original = fs.readFileSync(targetFile, 'utf8');
if (original.includes(newSnippet)) {
  console.log('React Native Gradle plugin already patched for Gradle 9.');
  process.exit(0);
}

if (!original.includes(oldSnippet)) {
  console.warn('Expected Foojay resolver version not found; skipping patch.');
  process.exit(0);
}

fs.writeFileSync(targetFile, original.replace(oldSnippet, newSnippet));
console.log('Patched React Native Gradle plugin to use Foojay resolver 1.0.0.');
