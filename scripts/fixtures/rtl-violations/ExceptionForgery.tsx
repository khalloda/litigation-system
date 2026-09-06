/* DELIBERATELY WRONG: exception markers must be real, reasoned, and narrow. */
const forged = 'rtl-ok: a string is not a source comment';

export function ExceptionForgery() {
  return (
    <div data-forged={forged}>
      <span style={{ marginLeft: 8 }}>{forged}</span>
      <span
        style={{
          /* rtl-ok: */
          paddingRight: 8,
        }}
      />
      <span
        style={{
          /* rtl-ok: this applies only to the safe paddingBlock node below. */
          paddingBlock: 8,
          marginRight: 8,
        }}
      />
    </div>
  );
}
