import { Text, type TextProps } from 'react-native';
import { color, type as typeScale, type TypeVariant } from './tokens';
import { MAX_FONT_SCALE } from '../a11y/a11y';

const TONES = { primary: color.text, secondary: color.textSecondary, tertiary: color.textTertiary, metal: color.metal, signal: color.signal } as const;

/** Typography (Chapter 03). Text always scales with the person's font size, within what the layout holds. */
export function T({ variant = 'body', tone = 'primary', color: tint, style, ...rest }: TextProps & { variant?: TypeVariant; tone?: keyof typeof TONES; color?: string }) {
  const scale = variant === 'display' || variant === 'title' ? MAX_FONT_SCALE.display : variant === 'label' || variant === 'micro' ? MAX_FONT_SCALE.control : MAX_FONT_SCALE.body;
  return <Text maxFontSizeMultiplier={scale} style={[typeScale[variant], { color: tint ?? TONES[tone] }, variant === 'micro' && { textTransform: 'uppercase' }, style]} {...rest} />;
}
