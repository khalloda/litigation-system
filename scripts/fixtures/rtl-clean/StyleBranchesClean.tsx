/* DELIBERATELY CORRECT: structural inline-style branch counterparts. */
const marginInlineStart = 8;
const choose = true;

// A raw colour such as #fff inside an actual source comment is not code.
export function StyleBranchesClean() {
  return (
    <>
      {/* Raw colour #abcdef inside an actual JSX comment is not visible text. */}
      <div style={{ marginInlineStart }} />
      <div style={{ ['paddingInlineEnd']: 8 }} />
      <div style={choose ? ({ borderInlineStartWidth: 1 }) : {}} />
      <div style={{ ...{ marginInlineEnd: 8 } }} />
      <div style={{ textAlign: 'start', float: 'inline-start', clear: 'inline-end' }} />
      <div style={{ padding: '0 8px 0 8px', borderRadius: '8px 8px 4px 4px' }} />
    </>
  );
}
