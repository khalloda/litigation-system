/* DELIBERATELY WRONG: an unresolved computed inline-style key must fail closed. */
declare const styleKey: string;

export function UnresolvedComputedStyle() {
  return <div style={{ [styleKey]: 8 }} />;
}
