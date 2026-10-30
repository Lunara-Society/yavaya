'use client';

import { useId, type ReactNode } from 'react';

/**
 * The Studio's controls, built on the browser's own: radio groups, ranges and
 * selects. Arrow keys, screen readers and switch access work as they do
 * everywhere, at no cost in weight.
 */

/** Fills `{name}` placeholders in a translated string. */
export function fmt(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
  columns,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
  columns?: number;
}) {
  const name = useId();
  return (
    <fieldset className="ids-choice" style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={option.value === value ? 'is-on' : undefined}>
          <input type="radio" name={name} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
          {option.hint ? <small>{option.hint}</small> : null}
        </label>
      ))}
    </fieldset>
  );
}

export function Swatches<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Array<{ value: T; color: string; label: string }>;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="ids-swatches">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={option.value === value ? 'is-on' : undefined} title={option.label}>
          <input type="radio" name={name} value={option.value} checked={option.value === value} onChange={() => onChange(option.value)} />
          <span className="ids-swatch" style={{ background: option.color }} aria-hidden="true" />
          <span className="sr-only">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '%',
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="ids-range">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} />
      <output htmlFor={id}>
        {value}
        {unit}
      </output>
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <span className="ids-select">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="ids-section">
      <h3>{title}</h3>
      {lead ? <p className="ids-lead">{lead}</p> : null}
      {children}
    </section>
  );
}
