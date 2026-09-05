import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function RegisterPage() {
  return (
    <main className="narrow">
      <h1>Create your account</h1>
      <p>Make a home for your next game.</p>
      <AuthForm mode="register" />
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
