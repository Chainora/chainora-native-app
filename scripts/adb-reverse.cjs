const { execFileSync } = require('child_process');

const ports = process.argv.slice(2);

if (ports.length === 0) {
  console.error('Usage: node ./scripts/adb-reverse.cjs <port> [port...]');
  process.exit(1);
}

const explicitSerial = (process.env.ANDROID_SERIAL || '').trim();

function runAdb(args) {
  return execFileSync('adb', args, { encoding: 'utf8' });
}

function listDevices() {
  const output = runAdb(['devices']);
  return output
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\s+/))
    .filter(parts => parts[1] === 'device')
    .map(parts => parts[0]);
}

const devices = listDevices();
if (devices.length === 0) {
  console.error('No adb device found.');
  process.exit(1);
}

const serial = explicitSerial || (devices.length === 1 ? devices[0] : '');
if (!serial) {
  console.error(
    `Multiple adb devices found (${devices.join(', ')}). Set ANDROID_SERIAL before running this script.`,
  );
  process.exit(1);
}

for (const port of ports) {
  runAdb(['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  console.log(`Reversed tcp:${port} on ${serial}`);
}
