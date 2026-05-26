module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../../../*', '../../../../*'],
            message: 'Use configured aliases instead of deep relative parent imports.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/screens/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react-native-nfc-manager',
                message: 'Screens must go through hooks instead of importing native SDKs directly.',
              },
              {
                name: 'viem',
                message: 'Screens must go through hooks/services instead of importing SDKs directly.',
              },
              {
                name: '@react-native-async-storage/async-storage',
                message: 'Screens must go through hooks/services instead of importing storage directly.',
              },
            ],
            patterns: [
              {
                group: ['@services/*'],
                message: 'Screens must go through hooks instead of importing services directly.',
              },
              {
                group: ['../../../*', '../../../../*'],
                message: 'Use configured aliases instead of deep relative parent imports.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/services/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'react',
                message: 'Services must stay framework-free.',
              },
            ],
            patterns: [
              {
                group: ['react/*', '@screens/*', '@components/*'],
                message: 'Services must stay framework-free and UI-free.',
              },
              {
                group: ['../../../*', '../../../../*'],
                message: 'Use configured aliases instead of deep relative parent imports.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/utils/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@services/*', '@hooks/*', '@screens/*', '@components/*'],
                message: 'Utils must stay pure and UI/service-free.',
              },
              {
                group: ['../../../*', '../../../../*'],
                message: 'Use configured aliases instead of deep relative parent imports.',
              },
            ],
          },
        ],
      },
    },
  ],
};
