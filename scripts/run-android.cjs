const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');

function hasJavaBinary(javaHome) {
  if (!javaHome) {
    return false;
  }

  const binaryName = process.platform === 'win32' ? 'java.exe' : 'java';
  return fs.existsSync(path.join(javaHome, 'bin', binaryName));
}

function resolveJavaHome() {
  const candidates = [
    process.env.CHAINORA_ANDROID_JAVA_HOME,
    process.platform === 'win32'
      ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
      : '',
    process.platform === 'win32'
      ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jre')
      : '',
    process.env.JAVA_HOME,
  ];

  return candidates.find(hasJavaBinary) || '';
}

const env = { ...process.env };
const javaHome = resolveJavaHome();
if (javaHome) {
  env.JAVA_HOME = javaHome;
  env.Path = `${path.join(javaHome, 'bin')}${path.delimiter}${env.Path || ''}`;
  console.log(`Using JAVA_HOME=${javaHome}`);
}

const reactNativeCliEntrypoint = require.resolve('@react-native-community/cli/build/bin.js');

const result = spawnSync(process.execPath, [reactNativeCliEntrypoint, 'run-android', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
