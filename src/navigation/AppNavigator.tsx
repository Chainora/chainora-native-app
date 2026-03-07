import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackHeaderProps,
} from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import HomeScreen from '../screens/HomeScreen.tsx';
import NfcScanScreen from '../screens/NfcScanScreen.tsx';
import WelcomeScreen from '../screens/WelcomeScreen.tsx';
import LoginPinScreen from '../screens/LoginPinScreen.tsx';
import ActivatePinScreen from '../screens/ActivatePinScreen.tsx';
import ActivateSuccessScreen from '../screens/ActivateSuccessScreen.tsx';
import Header from '../components/layout/header';
import type { RootStackParamList } from './routes/rootStackParamList';
import { ROUTES } from './routes/routes';

enableScreens(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

const HEADER_META: Partial<Record<keyof RootStackParamList, { title: string; subtitle?: string }>> = {
  [ROUTES.LoginPin]: { title: 'Enter PIN', subtitle: 'Unlock your wallet' },
  [ROUTES.ActivatePin]: { title: 'Create Your PIN', subtitle: 'Secure your wallet' },
  [ROUTES.NfcScan]: { title: 'Scan Card', subtitle: 'Hold your card near your phone' },
  [ROUTES.ActivateSuccess]: { title: 'Activation Complete' },
};

const renderStackHeader = (props: NativeStackHeaderProps) => {
  const routeName = props.route.name as keyof RootStackParamList;
  const headerText = HEADER_META[routeName];

  return (
    <Header
      title={headerText?.title}
      subtitle={headerText?.subtitle}
      showBackButton={props.navigation.canGoBack()}
    />
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={ROUTES.Welcome}
        screenOptions={{ header: renderStackHeader }}
      >
        <Stack.Screen
          name={ROUTES.Welcome}
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name={ROUTES.LoginPin} component={LoginPinScreen} />
        <Stack.Screen name={ROUTES.ActivatePin} component={ActivatePinScreen} />
        <Stack.Screen name={ROUTES.NfcScan} component={NfcScanScreen} />
        <Stack.Screen
          name={ROUTES.Home}
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name={ROUTES.ActivateSuccess} component={ActivateSuccessScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
