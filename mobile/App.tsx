import * as SplashScreen from 'expo-splash-screen';
import AppRoot from './src/AppRoot';

// The Guardian (splash) stays until the first frame of the app is ready.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default AppRoot;
