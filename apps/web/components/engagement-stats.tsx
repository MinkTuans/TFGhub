import { formatPlayDuration } from "../lib/play-duration";
import type { EngagementStats } from "@indieforge/contracts";

const number = new Intl.NumberFormat("vi-VN");
export function EngagementMetrics({ stats }: { stats: EngagementStats }) {
  return <dl className="engagement-metrics">
    <div><dt>Lượt chơi</dt><dd>{number.format(stats.totalPlays)}</dd></div>
    <div><dt>Người chơi ước tính</dt><dd>{number.format(stats.uniquePlayers)}</dd></div>
    <div><dt>Thời gian chơi trung bình</dt><dd>{formatPlayDuration(stats.averagePlaySeconds)}</dd></div>
    <div><dt>Đánh giá</dt><dd>{stats.ratingAverage === null ? "Chưa có đánh giá" : `${stats.ratingAverage.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 5`}</dd><small>{number.format(stats.ratingCount)} đánh giá</small></div>
    <div><dt>Bình luận</dt><dd>{number.format(stats.commentCount)}</dd></div>
    {stats.scoresEnabled && <div><dt>Điểm cao nhất</dt><dd>{stats.highScore === null ? "Chưa có điểm" : number.format(stats.highScore)}</dd><small>Điểm do trò chơi gửi, chưa xác minh chống gian lận.</small></div>}
  </dl>;
}
