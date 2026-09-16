const number = new Intl.NumberFormat("vi-VN");

export function formatPlayDuration(seconds: number | null): string {
  if (seconds === null) return "Chưa có lượt chơi";
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(rounded % 3600 / 60);
  const remainder = rounded % 60;
  if (hours > 0) return `${number.format(hours)} giờ${minutes ? ` ${minutes} phút` : ""}`;
  if (minutes > 0) return `${minutes} phút${remainder ? ` ${remainder} giây` : ""}`;
  return `${remainder} giây`;
}
