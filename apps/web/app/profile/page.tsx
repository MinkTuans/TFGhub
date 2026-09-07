import { ProfileForm, type Profile } from "../../components/profile-form";
import { ApiError } from "../../lib/api-client";
import { privateGet } from "../../lib/session";

export default async function ProfilePage() {
  const profile = await privateGet<Profile>("/developers/me").catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });

  return (
    <main className="narrow" lang="vi">
      <h1>Thông tin cá nhân</h1>
      <p>Cập nhật tên hiển thị và giới thiệu về bạn.</p>
      <ProfileForm profile={profile} />
    </main>
  );
}
