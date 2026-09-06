/* DELIBERATELY WRONG: a statically computed physical style key must be rejected. */
export function ComputedPhysicalStyle() {
  return <div style={{ ['paddingRight']: 8 }} />;
}
