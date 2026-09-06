/* DELIBERATELY WRONG: all findings in this parsed file must be reported. */
const runtimeLabel = 'machine-value';

export function MultipleViolations() {
  return (
    <main title={'First visible violation'} style={{ marginRight: 4 }}>
      <p>Second visible violation</p>
      <span style={{ backgroundColor: '#abcdef' }}>{runtimeLabel}</span>
    </main>
  );
}
