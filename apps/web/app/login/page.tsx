import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return (
    <main className="narrow">
      <header className="page-heading">
        <h1>Chào mừng trở lại</h1>
      </header>
      <AuthForm mode="login" />
      <p>
        Bạn mới đến? <Link href="/register">Tạo tài khoản</Link>
      </p>
    </main>
  );
}
