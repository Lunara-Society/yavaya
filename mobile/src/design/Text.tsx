import { Text, type TextProps } from 'react-native';
import { type as typeScale, type TypeVariant } from './tokens';
import { MAX_FONT_SCALE } from '../a11y/a11y';
import { usePalette } from './palette';

type Tone = 'primary' | 'secondary' | 'tertiary' | 'metal' | 'signal';
type ToneRole = 'text' | 'textSecondary' | 'textTertiary' | 'metal' | 'link';
const TONE_ROLE: Record<Tone, ToneRole> = { primary: 'text', secondary: 'textSecondary', tertiary: 'textTertiary', metal: 'metal', signal: 'link' };
/** Display and control styles scale less than body text, so layouts hold. */
const FONT_SCALE: Partial<Record<TypeVariant, number>> = {
  display: MAX_FONT_SCALE.display,
  title: MAX_FONT_SCALE.display,
  label: MAX_FONT_SCALE.control,
  micro: MAX_FONT_SCALE.control,
};

/** Typography (Chapter 03). Text always scales with the person's font size, within what the layout holds. */
export function T({ variant = 'body', tone = 'primary', color: tint, style, ...rest }: TextProps & { variant?: TypeVariant; tone?: Tone; color?: string }) {
  const palette = usePalette();
  const scale = FONT_SCALE[variant] ?? MAX_FONT_SCALE.body;
  return <Text maxFontSizeMultiplier={scale} style={[typeScale[variant], { color: tint ?? palette[TONE_ROLE[tone]] }, variant === 'micro' && { textTransform: 'uppercase' }, style]} {...rest} />;
}
