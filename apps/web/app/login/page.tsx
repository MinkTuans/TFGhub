import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return (
    <main className="narrow">
      <h1>Welcome back</h1>
      <AuthForm mode="login" />
      <p>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </main>
  );
}
