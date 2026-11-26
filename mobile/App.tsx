import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { YavayaWeb } from './src/YavayaWeb';

// The Guardian stays on screen until Yavaya's first page has painted (or a short limit passes).
SplashScreen.preventAutoHideAsync();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <YavayaWeb />
    </SafeAreaProvider>
  );
}
