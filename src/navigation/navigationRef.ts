import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './routes/rootStackParamList';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
