import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackHeaderProps,
} from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import { AmbientOrbsBackground } from '../components/ui/animations/AmbientOrbsBackground';
import HomeScreen from '../screens/HomeScreen.tsx';
import WelcomeScreen from '../screens/WelcomeScreen.tsx';
import LoginPinScreen from '../screens/LoginPinScreen.tsx';
import ActivatePinScreen from '../screens/ActivatePinScreen.tsx';
import ActivateSuccessScreen from '../screens/ActivateSuccessScreen.tsx';
import EcdhBackupScreen from '../screens/EcdhBackupScreen.tsx';
import SettingsScreen from '../screens/SettingsScreen';
import GeneralScreen from '../screens/GeneralScreen';
import ChangePinScreen from '../screens/ChangePinScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import Header from '../components/layout/header';
import { WalletRelayRequestModal } from '../components/ui/WalletRelayRequestModal';
import { useSettings } from '../features/settings';
import type { RootStackParamList } from './routes/rootStackParamList';
import { ROUTES } from './routes/routes';

enableScreens(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { t, resolvedTheme, themeTokens } = useSettings();

  const headerMeta: Partial<Record<keyof RootStackParamList, { title: string; subtitle?: string }>> = {
    [ROUTES.LoginPin]: { title: t('headerEnterPinTitle'), subtitle: t('headerEnterPinSubtitle') },
    [ROUTES.ActivatePin]: { title: t('headerCreatePinTitle'), subtitle: t('headerCreatePinSubtitle') },
    [ROUTES.EcdhBackup]: { title: t('headerEcdhTitle'), subtitle: t('headerEcdhSubtitle') },
    [ROUTES.Settings]: { title: t('headerSettingsTitle'), subtitle: t('headerSettingsSubtitle') },
    [ROUTES.General]: { title: t('headerGeneralTitle'), subtitle: t('headerGeneralSubtitle') },
    [ROUTES.ChangePin]: { title: t('headerChangePinTitle'), subtitle: t('headerChangePinSubtitle') },
    [ROUTES.ActivateSuccess]: { title: t('headerActivateSuccessTitle') },
  };

  const navigationTheme = {
    ...(resolvedTheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolvedTheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: themeTokens.primary,
      background: themeTokens.background,
      card: themeTokens.background,
      text: themeTokens.foreground,
      border: themeTokens.border,
      notification: themeTokens.primary,
    },
  };

  const renderStackHeader = (props: NativeStackHeaderProps) => {
    const routeName = props.route.name as keyof RootStackParamList;
    const headerText = headerMeta[routeName];

    return (
      <Header
        title={headerText?.title}
        subtitle={headerText?.subtitle}
        showBackButton={props.navigation.canGoBack()}
      />
    );
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <View style={styles.navigatorRoot}>
        <Stack.Navigator
          initialRouteName={ROUTES.Welcome}
          screenOptions={{ header: renderStackHeader }}
        >
          <Stack.Screen
            name={ROUTES.Welcome}
            component={WelcomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.LoginPin}
            component={LoginPinScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.ActivatePin}
            component={ActivatePinScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name={ROUTES.EcdhBackup} component={EcdhBackupScreen} />
          <Stack.Screen
            name={ROUTES.Settings}
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name={ROUTES.General} component={GeneralScreen} />
          <Stack.Screen name={ROUTES.ChangePin} component={ChangePinScreen} />
          <Stack.Screen
            name={ROUTES.QRScanner}
            component={QRScannerScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.Home}
            component={HomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.ActivateSuccess}
            component={ActivateSuccessScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>

        <AmbientOrbsBackground compact />
        <WalletRelayRequestModal />
      </View>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  navigatorRoot: {
    flex: 1,
  },
});
