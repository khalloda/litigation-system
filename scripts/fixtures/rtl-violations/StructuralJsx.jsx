/* DELIBERATELY WRONG: structural .jsx coverage. */
const runtimeValue = 'machine-value';

export function StructuralJsx() {
  return (
    <section
      title={'Open ' + 'report'}
      alt="Printable report"
      placeholder={`Search ${runtimeValue}`}
      aria-label={'Report options'}
      aria-description={`Choose a ${runtimeValue}`}
      label={'Visible field label'}
    >
      Visible JSX text in a JavaScript
      component.
      <span>{'String-expression label'}</span>
      <span>{`Template label for ${runtimeValue}`}</span>
    </section>
  );
}
