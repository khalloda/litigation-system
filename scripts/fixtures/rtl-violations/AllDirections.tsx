/* DELIBERATELY WRONG: complete inline-style direction inventory. */
const value = 'x';

export function AllDirections() {
  return (
    <div>
      <i style={{ marginLeft: 1, marginRight: 1, paddingLeft: 1, paddingRight: 1 }} />
      <i
        style={{
          borderLeft: '1px solid',
          borderLeftWidth: 1,
          borderLeftColor: 'red',
          borderLeftStyle: 'solid',
          borderRight: '1px solid',
          borderRightWidth: 1,
          borderRightColor: 'red',
          borderRightStyle: 'solid',
        }}
      />
      <i
        style={{
          borderTopLeftRadius: 1,
          borderTopRightRadius: 1,
          borderBottomLeftRadius: 1,
          borderBottomRightRadius: 1,
          left: 0,
          right: 0,
        }}
      />
      <i style={{ textAlign: 'left', float: 'left', clear: 'left' }} />
      <i style={{ textAlign: 'right', float: 'right', clear: 'right' }} />
      <i style={{ borderColor: 'red blue red green' }} />
      <i style={{ borderStyle: 'solid dotted solid dashed' }} />
      <i style={{ scrollMargin: '0 4px 0 16px' }} />
      <i style={{ scrollPadding: `0 4px 0 16px` }} data-value={value} />
    </div>
  );
}
