import { View } from 'react-native';
import { T } from '../design/Text';

export default function Classic() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><T>Clásica: solo en el teléfono.</T></View>;
}
