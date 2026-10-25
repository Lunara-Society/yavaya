'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoxiPresenceLabels } from './labels';
import { forgetEverything, readPrefs, ROXI_LENGTHS, ROXI_MODES, ROXI_SPEEDS, writePrefs, type RoxiPrefs } from './prefs';

/**
 * Roxi's settings, all in this browser: how present she is (Quiet,
 * Available, Proactive — the simulated call exists only in Proactive, which
 * the member picks here), how long she answers, how fast she speaks, quiet
 * hours, and whether this tab keeps the conversation. It says plainly what
 * is kept and offers to forget all of it.
 */
export function RoxiSettingsSheet({ labels, onClose }: { labels: RoxiPresenceLabels; onClose: () => void }) {
  const [prefs, setPrefs] = useState<RoxiPrefs>(() => readPrefs());
  const [notice, setNotice] = useState('');
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof RoxiPrefs>(key: K, value: RoxiPrefs[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }));
    setNotice('');
  };
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <div className="roxi-sheet-wrap">
      <div className="roxi-scrim is-sheet" onClick={onClose} aria-hidden="true" />
      <div className="roxi-sheet" role="dialog" aria-modal="true" aria-labelledby="roxi-settings-title" ref={sheet}>
        <h2 id="roxi-settings-title">{labels['settings.title']}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            writePrefs(prefs);
            setNotice(labels['settings.saved']);
          }}
        >
          <fieldset>
            <legend>{labels['settings.mode']}</legend>
            {ROXI_MODES.map((mode) => (
              <label key={mode} className="roxi-choice">
                <input type="radio" name="mode" value={mode} checked={prefs.mode === mode} onChange={() => set('mode', mode)} />
                <span>
                  <strong>{labels[`settings.mode.${mode}`]}</strong>
                  <small>{labels[`settings.mode.${mode}_hint`]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="roxi-inline">
            <legend>{labels['settings.length']}</legend>
            {ROXI_LENGTHS.map((length) => (
              <label key={length} className="roxi-pill">
                <input type="radio" name="length" value={length} checked={prefs.length === length} onChange={() => set('length', length)} />
                <span>{labels[`settings.length.${length}`]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="roxi-inline">
            <legend>{labels['settings.speed']}</legend>
            {ROXI_SPEEDS.map((speed) => (
              <label key={speed} className="roxi-pill">
                <input type="radio" name="speed" value={speed} checked={prefs.speed === speed} onChange={() => set('speed', speed)} />
                <span>{labels[`settings.speed.${speed}`]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="roxi-inline">
            <legend>{labels['settings.quiet_hours']}</legend>
            <label className="roxi-select">
              <span>{labels['settings.quiet_from']}</span>
              <select value={prefs.quietFrom} onChange={(event) => set('quietFrom', Number(event.currentTarget.value))}>
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
            <label className="roxi-select">
              <span>{labels['settings.quiet_to']}</span>
              <select value={prefs.quietTo} onChange={(event) => set('quietTo', Number(event.currentTarget.value))}>
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <label className="roxi-check">
            <input type="checkbox" checked={prefs.keep} onChange={(event) => set('keep', event.currentTarget.checked)} />
            <span>{labels['settings.keep']}</span>
          </label>
          <p className="roxi-sheet-note">{labels['settings.stored']}</p>
          {notice ? (
            <p className="roxi-sheet-done" role="status">
              {notice}
            </p>
          ) : null}
          <div className="roxi-sheet-actions">
            <button type="submit" className="btn btn-gold">
              {labels['settings.save']}
            </button>
            <button type="button" className="btn btn-line" onClick={onClose}>
              {labels['settings.close']}
            </button>
          </div>
          <button
            type="button"
            className="roxi-forget"
            onClick={() => {
              forgetEverything();
              setPrefs(readPrefs());
              setNotice(labels['settings.forgotten']);
            }}
          >
            {labels['settings.forget']}
          </button>
        </form>
      </div>
    </div>
  );
}
