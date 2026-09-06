/* DELIBERATELY WRONG: raw hex in JSX text is a non-comment component lexeme. */
export function RawHexJsxText() {
  return <span>#fff</span>;
}
