import Link from "next/link";
import { AuthForm } from "../../components/auth-form";

export default function RegisterPage() {
  return (
    <main className="narrow">
      <header className="page-heading">
        <h1>Tạo tài khoản</h1>
      </header>
      <p>Bắt đầu hành trình sáng tạo game cùng TFG.</p>
      <AuthForm mode="register" />
      <p>
        Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
      </p>
    </main>
  );
}
