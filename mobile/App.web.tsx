import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useEffect, useState, type ComponentType } from 'react';

/**
 * Web build (development checks only). Skia must finish loading CanvasKit
 * before any module that uses it is evaluated, so the app is required only
 * after the load resolves. The phone builds use App.tsx.
 */
export default function App() {
  const [Root, setRoot] = useState<ComponentType | null>(null);
  useEffect(() => {
    LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./src/AppRoot') as { default: ComponentType };
      setRoot(() => mod.default);
    });
  }, []);
  return Root ? <Root /> : null;
}
