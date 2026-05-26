import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@store/auth';
import { SettingsProvider } from '@store/settings';
import { ToastProvider } from '@store/toast';
import { AppNavigator } from '@navigation';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <AppNavigator />
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

export default App;
