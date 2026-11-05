/**
 * Which animal it is, as three buttons rather than a list. In a closed
 * dropdown an arrow key changes the choice without a word (a lost dog was
 * saved as a cat that way); a tap on a labelled button cannot be mistaken.
 */
export function SpeciesChoice({ label, options, current }: { label: string; options: Array<{ value: string; label: string }>; current?: string }) {
  return (
    <fieldset className="an-species">
      <legend>{label}</legend>
      <div className="an-species-options">
        {options.map((option) => (
          <label key={option.value} className="an-species-option">
            <input type="radio" name="species" value={option.value} required defaultChecked={current === option.value} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
