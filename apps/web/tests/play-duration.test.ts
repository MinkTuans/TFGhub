import { expect, test } from "vitest";
import { formatPlayDuration } from "../lib/play-duration";

test.each([
  [null, "Chưa có lượt chơi"],
  [0, "0 giây"],
  [29.6, "30 giây"],
  [59.6, "1 phút"],
  [1440, "24 phút"],
  [1452, "24 phút 12 giây"],
  [3600, "1 giờ"],
  [9300, "2 giờ 35 phút"],
])("formats %s active seconds without losing the empty/zero distinction", (seconds, expected) => {
  expect(formatPlayDuration(seconds)).toBe(expected);
});
