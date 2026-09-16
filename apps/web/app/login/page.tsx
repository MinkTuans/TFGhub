import Link from "next/link";
import { AuthLayout } from "../../components/auth-layout";
import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return (
    <AuthLayout title="Chào mừng trở lại" intro="Tiếp tục khám phá và sáng tạo cùng TFG.">
      <AuthForm mode="login" />
      <p>
        Bạn mới đến? <Link href="/register">Tạo tài khoản</Link>
      </p>
    </AuthLayout>
  );
}
