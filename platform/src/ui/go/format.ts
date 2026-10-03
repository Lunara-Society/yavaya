/** Minor units to a price in the currency's own precision. Used on both server and client. */
export function money(minor: number, currency: string): string {
  try {
    const format = new Intl.NumberFormat('es', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' });
    return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Minor units back to what a person types in a price field. */
export function moneyInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function waLink(e164: string, text?: string): string {
  return `https://wa.me/${e164.replace(/^\+/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
