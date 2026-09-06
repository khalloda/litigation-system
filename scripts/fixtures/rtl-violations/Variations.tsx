/*
 * DELIBERATELY WRONG. Do not copy anything from this file, and do not import
 * it.
 *
 * The variations the re-review found untested. The structural checker must
 * reject every one, including the two former multiline gaps.
 */

const label = 'x';

export function Variations() {
  return (
    <div>
      {/* Caught: a string in a visible prop written as an expression. */}
      <img src="/x.png" alt={'Company logo'} />
      <input placeholder={'Search clients'} />

      {/* Caught: a bare string literal rendered as text. */}
      <span>{'Save changes'}</span>

      {/* Caught: the same thing as a template literal. */}
      <span>{`Delete matter`}</span>

      {/* Caught: four-side inline shorthand, right 4px and left 16px. */}
      <p style={{ margin: '0 4px 0 16px' }}>{label}</p>
      <p style={{ padding: '2px 8px 2px 24px' }}>{label}</p>
      <p style={{ inset: '0 4px 0 16px' }}>{label}</p>
      <p style={{ borderWidth: '1px 2px 1px 8px' }}>{label}</p>
      <p style={{ borderRadius: '8px 0 0 8px' }}>{label}</p>

      {/*
        Former gap — multi-line JSX text. This must now be rejected.
      */}
      <p>
        This sentence is interface text and belongs in src/strings.ts, but it is
        spread over more than one line so the line-by-line checker cannot see it.
      </p>

      {/*
        Former gap — a visible prop split across lines. This must now be rejected.
      */}
      <button
        title={
          'Export to Excel'
        }
      >
        {label}
      </button>
    </div>
  );
}

/* Caught: a template-literal label in a data table. */
export const columns = [{ label: `Case number`, width: 120 }];
