import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import HomeScreen from '../screens/HomeScreen.tsx';
import NfcScanScreen from '../screens/NfcScanScreen.tsx';
import type { RootStackParamList } from './routes/rootStackParamList';
import { ROUTES } from './routes/routes';

enableScreens(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={ROUTES.NfcScan}>
        <Stack.Screen name={ROUTES.NfcScan} component={NfcScanScreen} />
        <Stack.Screen name={ROUTES.Home} component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
