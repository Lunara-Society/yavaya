import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { T } from '../design/Text';
import { Button } from '../design/controls';
import { space } from '../design/tokens';

/**
 * One scene failing never takes the app down: the scene shows a calm error
 * and a way back; the environment, the dock and every other scene keep working.
 */
export class SceneBoundary extends Component<{ children: ReactNode; onBack: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.log(`[yavaya] scene error: ${error.message}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space[5], gap: space[3] }}>
        <T variant="headline">Esta pantalla tuvo un problema.</T>
        <T variant="caption" tone="secondary">El resto de Yavaya sigue funcionando.</T>
        <Button label="Volver" kind="secondary" onPress={this.props.onBack} />
      </View>
    );
  }
}
