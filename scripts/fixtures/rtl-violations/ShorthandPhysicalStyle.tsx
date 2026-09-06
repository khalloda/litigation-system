/* DELIBERATELY WRONG: a shorthand physical style property must be rejected. */
const marginLeft = 8;

export function ShorthandPhysicalStyle() {
  return <div style={{ marginLeft }} />;
}
