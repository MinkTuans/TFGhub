import Link from "next/link";
import { AuthLayout } from "../../components/auth-layout";
import { AuthForm } from "../../components/auth-form";

export default function RegisterPage() {
  return (
    <AuthLayout mode="register" title="Tạo tài khoản" intro="Bắt đầu hành trình sáng tạo trò chơi cùng TFG.">
      <AuthForm mode="register" />
      <p>
        Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
      </p>
    </AuthLayout>
  );
}
