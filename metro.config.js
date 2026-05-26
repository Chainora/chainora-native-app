const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const aliases = {
  '@app-types': 'src/types',
  '@assets': 'src/assets',
  '@components': 'src/components',
  '@config': 'src/config',
  '@constants': 'src/constants',
  '@hooks': 'src/hooks',
  '@locales': 'src/locales',
  '@navigation': 'src/navigation',
  '@screens': 'src/screens',
  '@services': 'src/services',
  '@store': 'src/store',
  '@types': 'src/types',
  '@utils': 'src/utils',
};

const resolveAlias = moduleName => {
  for (const [alias, target] of Object.entries(aliases)) {
    if (moduleName === alias || moduleName.startsWith(`${alias}/`)) {
      const suffix = moduleName === alias ? '' : moduleName.slice(alias.length + 1);
      return path.join(__dirname, target, suffix);
    }
  }

  return null;
};

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      const aliasTarget = resolveAlias(moduleName);

      return context.resolveRequest(
        context,
        aliasTarget ?? moduleName,
        platform,
      );
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
