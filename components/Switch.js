// A toggle switch (looks like a phone setting). Works inside a normal server-rendered form.
export default function Switch({ name, label, hint, defaultChecked }) {
  return (
    <label className="sw">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span className="trk" aria-hidden="true" />
      <span className="sw-t">{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}
