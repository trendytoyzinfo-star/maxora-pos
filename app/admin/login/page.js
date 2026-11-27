import { login } from '../actions';
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  return (
    <form action={login} className="box adm-login">
      <h1>Admin login</h1>
      {sp.err && <div className="bad" role="alert">{sp.err}</div>}
      <label>Email<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn" type="submit">Log in</button>
    </form>
  );
}
