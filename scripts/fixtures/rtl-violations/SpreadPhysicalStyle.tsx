/* DELIBERATELY WRONG: a nested literal style spread must be inspected. */
export function SpreadPhysicalStyle() {
  return <div style={{ ...{ marginRight: 8, padding: '0 4px 0 8px' } }} />;
}
