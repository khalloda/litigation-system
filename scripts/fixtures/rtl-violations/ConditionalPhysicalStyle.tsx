/* DELIBERATELY WRONG: every conditional inline-style object branch must be inspected. */
const choose = true;

export function ConditionalPhysicalStyle() {
  return <div style={choose ? { borderLeftWidth: 1, textAlign: 'left' } : {}} />;
}
