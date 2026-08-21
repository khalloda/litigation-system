/*
 * DELIBERATELY WRONG. Do not copy anything from this file, and do not import
 * it.
 *
 * The variations the re-review found untested. Some are caught by the
 * line-by-line checker; two are NOT, and are marked. Those two need the
 * checker to understand the structure of the file rather than read it a line
 * at a time — deferred to task 4.0, when there are real screens to justify
 * the work. The self-test lists them every run so they cannot be forgotten.
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
        KNOWN GAP — multi-line JSX text.
        The checker reads one line at a time, so text that wraps is invisible
        to it. Task 4.0.
      */}
      <p>
        This sentence is interface text and belongs in src/strings.ts, but it is
        spread over more than one line so the line-by-line checker cannot see it.
      </p>

      {/*
        KNOWN GAP — a label split across lines.
        Task 4.0.
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
