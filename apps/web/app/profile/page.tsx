import { ProfileForm, type Profile } from "../../components/profile-form";
import { ApiError } from "../../lib/api-client";
import { privateGet } from "../../lib/session";

export default async function ProfilePage() {
  const profile = await privateGet<Profile>("/developers/me").catch((error) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  const initials = profile?.displayName.trim().split(/\s+/).slice(0, 2)
    .map((word) => word[0]).join("").toLocaleUpperCase("vi") || "TFG";

  return (
    <main className="narrow" lang="vi">
      <header className="page-heading">
        <span className="profile-avatar" role="img" aria-label="Ảnh đại diện">{initials}</span>
        <h1>Thông tin cá nhân</h1>
      </header>
      <p>Cập nhật tên hiển thị và giới thiệu về bạn.</p>
      <ProfileForm profile={profile} />
    </main>
  );
}
