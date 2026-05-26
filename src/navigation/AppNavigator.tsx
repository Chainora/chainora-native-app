import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackHeaderProps,
} from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import HomeScreen from '../screens/HomeScreen.tsx';
import WelcomeScreen from '../screens/WelcomeScreen.tsx';
import LoginPinScreen from '../screens/LoginPinScreen.tsx';
import ActivatePinScreen from '../screens/ActivatePinScreen.tsx';
import ActivateSuccessScreen from '../screens/ActivateSuccessScreen.tsx';
import ScanCardScreen from '../screens/ScanCardScreen';
import EcdhBackupScreen from '../screens/EcdhBackupScreen.tsx';
import SettingsScreen from '../screens/SettingsScreen';
import GeneralScreen from '../screens/GeneralScreen';
import LanguageSettingsScreen from '../screens/LanguageSettingsScreen';
import CurrencySettingsScreen from '../screens/CurrencySettingsScreen';
import ChangePinScreen from '../screens/ChangePinScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import SendTransactionScreen from '../screens/SendTransactionScreen';
import WalletDetailsScreen from '../screens/WalletDetailsScreen';
import WalletRelayRequestScreen from '../screens/WalletRelayRequestScreen';
import {
  AddTokenScreen,
  ReceiveScreen,
  SendScreen,
  SendPickScreen,
  TokenManageScreen,
  TouchSignScreen,
} from '../screens/WalletFlowScreens';
import Header from '../components/layout/header';
import { useSettings } from '../features/settings';
import { walletRelaySessionManager } from '../services/walletRelaySessionManager';
import type { RootStackParamList } from './routes/rootStackParamList';
import { navigationRef } from './navigationRef';
import { ROUTES } from './routes/routes';

enableScreens(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { t, resolvedTheme, themeTokens } = useSettings();
  const appSurfaceBackground = themeTokens.background;

  React.useEffect(() => {
    return walletRelaySessionManager.subscribe(snapshot => {
      if (!navigationRef.isReady()) {
        return;
      }

      const currentRoute = navigationRef.getCurrentRoute()?.name;
      const shouldOpen = snapshot.pendingRequests.length > 0 && !snapshot.requestModalSuppressed;
      if (shouldOpen && currentRoute !== ROUTES.WalletRelayRequest) {
        navigationRef.navigate(ROUTES.WalletRelayRequest);
      }
    });
  }, []);

  const headerMeta: Partial<Record<keyof RootStackParamList, { title: string; subtitle?: string }>> = {
    [ROUTES.LoginPin]: { title: t('headerEnterPinTitle'), subtitle: t('headerEnterPinSubtitle') },
    [ROUTES.ActivatePin]: { title: t('headerCreatePinTitle'), subtitle: t('headerCreatePinSubtitle') },
    [ROUTES.EcdhBackup]: { title: t('headerEcdhTitle'), subtitle: t('headerEcdhSubtitle') },
    [ROUTES.Settings]: { title: t('headerSettingsTitle'), subtitle: t('headerSettingsSubtitle') },
    [ROUTES.ChangePin]: { title: t('headerChangePinTitle'), subtitle: t('headerChangePinSubtitle') },
    [ROUTES.ActivateSuccess]: { title: t('headerActivateSuccessTitle') },
  };

  const navigationTheme = {
    ...(resolvedTheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(resolvedTheme === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      primary: themeTokens.primary,
      background: appSurfaceBackground,
      card: appSurfaceBackground,
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
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <View style={[styles.navigatorRoot, { backgroundColor: appSurfaceBackground }]}>
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
          <Stack.Screen
            name={ROUTES.ScanCard}
            component={ScanCardScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <Stack.Screen
            name={ROUTES.EcdhBackup}
            component={EcdhBackupScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.Settings}
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.General}
            component={GeneralScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.LanguageSettings}
            component={LanguageSettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.CurrencySettings}
            component={CurrencySettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.ChangePin}
            component={ChangePinScreen}
            options={{ headerShown: false }}
          />
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
            name={ROUTES.SendTransaction}
            component={SendTransactionScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <Stack.Screen
            name={ROUTES.WalletDetails}
            component={WalletDetailsScreen}
            options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade' }}
          />
          <Stack.Screen
            name={ROUTES.WalletRelayRequest}
            component={WalletRelayRequestScreen}
            options={{ headerShown: false, animation: 'none' }}
          />
          <Stack.Screen
            name={ROUTES.SendPick}
            component={SendPickScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.Send}
            component={SendScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.Receive}
            component={ReceiveScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.TouchSign}
            component={TouchSignScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.TokenManage}
            component={TokenManageScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.AddToken}
            component={AddTokenScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name={ROUTES.ActivateSuccess}
            component={ActivateSuccessScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  navigatorRoot: {
    flex: 1,
  },
});
