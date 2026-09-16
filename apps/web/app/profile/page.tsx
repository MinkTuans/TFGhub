import Link from "next/link";
import type { GameSummary } from "@indieforge/contracts";
import { ProfileForm, type Profile } from "../../components/profile-form";
import { GameCover } from "../../components/game-cover";
import { EmptyState } from "../../components/empty-state";
import { ApiError } from "../../lib/api-client";
import { privateGet } from "../../lib/session";

export default async function ProfilePage() {
  const [profile, games] = await Promise.all([
    privateGet<Profile>("/developers/me").catch((error) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    privateGet<GameSummary[]>("/games/mine"),
  ]);
  const initials = profile?.displayName.trim().split(/\s+/).slice(0, 2)
    .map((word) => word[0]).join("").toLocaleUpperCase("vi") || "TFG";

  return (
    <main className="profile-page" lang="vi">
      <header className="profile-header">
        <span className="profile-avatar" role="img" aria-label="Ảnh đại diện">{initials}</span>
        <div className="profile-header__identity">
          <p className="eyebrow">Hồ sơ của bạn</p>
          <h1>{profile?.displayName || "Thông tin cá nhân"}</h1>
          <p className="description">{profile?.bio || "Thêm vài dòng giới thiệu để người chơi biết về bạn."}</p>
        </div>
        <dl className="profile-header__stat"><dt>Game trong Studio</dt><dd>{games.length}</dd></dl>
      </header>
      <div className="profile-layout">
        <section className="profile-editor" aria-labelledby="profile-edit-title">
          <h2 id="profile-edit-title">Chỉnh sửa hồ sơ</h2>
          <p>Cập nhật tên hiển thị và giới thiệu về bạn.</p>
          <ProfileForm profile={profile} />
        </section>
        <section className="profile-games" aria-labelledby="profile-games-title">
          <div className="section-heading">
            <h2 id="profile-games-title">Game của bạn</h2>
            <Link href="/studio">Quản lý trong Studio</Link>
          </div>
          {games.length === 0 ? (
            <EmptyState title="Chưa có game nào" description="Bắt đầu một bản nháp để đưa ý tưởng đầu tiên của bạn vào Studio.">
              <Link href="/studio/games/new">Tạo game đầu tiên</Link>
            </EmptyState>
          ) : (
            <div className="profile-game-list">
              {games.map((game) => (
                <Link className="profile-game-row" href={`/studio/games/${encodeURIComponent(game.id)}`} key={game.id} aria-label={game.title}>
                  <article>
                    <GameCover game={game} ownerGameId={game.id} size="compact" />
                    <div className="game-card__body"><h3 className="game-card__title">{game.title}</h3><p className="description">{game.description}</p><p className="game-card__developer">Mở trong Studio →</p></div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
