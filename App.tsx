import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/features/auth';
import { SettingsProvider } from './src/features/settings';
import { ToastProvider } from './src/features/toast';
import { WalletConnectProvider } from './src/features/walletconnect';
import { AppNavigator } from './src/navigation';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <WalletConnectProvider>
            <ToastProvider>
              <AppNavigator />
            </ToastProvider>
          </WalletConnectProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

export default App;
