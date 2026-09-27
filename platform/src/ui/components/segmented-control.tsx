/**
 * A segmented control built from a plain form.
 *
 * Each segment is a submit button carrying its own value, so the control works
 * with JavaScript disabled, on a slow connection, and during hydration. On the
 * devices Yavaya is built for that is not a fallback — it is often the actual
 * experience.
 *
 * Segments are labelled with words, never colour alone, and the current
 * selection is announced through `aria-pressed`.
 */
export function SegmentedControl({
  action,
  name,
  legend,
  current,
  options,
  disabled = false,
}: {
  action: (formData: FormData) => Promise<void>;
  /** Form field name; each button submits this with its own value. */
  name: string;
  /** Accessible group label. */
  legend: string;
  current: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  disabled?: boolean;
}) {
  return (
    <form action={action}>
      <fieldset disabled={disabled} className="min-w-0">
        <legend className="sr-only">{legend}</legend>
        <div
          className="flex w-full gap-1 rounded-xl border p-1"
          style={{ backgroundColor: 'var(--surface-sunken)' }}
        >
          {options.map((option) => {
            const selected = option.value === current;
            return (
              <button
                key={option.value}
                type="submit"
                name={name}
                value={option.value}
                aria-pressed={selected}
                title={option.hint}
                className="min-h-touch flex-1 rounded-lg px-2 text-sm font-medium transition-colors disabled:opacity-50"
                style={
                  selected
                    ? {
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast-text)',
                      }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}
