import { ApiError } from "./api-client";

// Only translate documented API messages. Unexpected server details stay private.
const messages = new Map<string, string>([
  ["Email already registered", "Email này đã được đăng ký."],
  ["Invalid email or password", "Email hoặc mật khẩu không đúng."],
  ["Invalid registration input", "Kiểm tra email và mật khẩu đăng ký."],
  ["Invalid login input", "Kiểm tra email và mật khẩu đăng nhập."],
  ["Unauthorized", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."],
  ["Forbidden", "Bạn không có quyền thực hiện thao tác này."],
  [
    "Untrusted request origin",
    "Không thể xác thực yêu cầu. Hãy tải lại trang.",
  ],
  [
    "Expected application/json",
    "Dữ liệu gửi lên không hợp lệ. Hãy tải lại trang.",
  ],
  ["Developer profile not found", "Chưa có hồ sơ nhà phát triển."],
  ["Invalid developer profile input", "Kiểm tra tên hiển thị và giới thiệu."],
  [
    "Game slug already exists",
    "Đường dẫn game đã tồn tại. Hãy chọn đường dẫn khác.",
  ],
  ["Invalid game input", "Kiểm tra thông tin và kích thước hiển thị của game."],
  ["You do not own this game", "Bạn không có quyền chỉnh sửa game này."],
  [
    "Game changed; reload the workspace",
    "Game đã thay đổi. Hãy tải lại không gian làm việc.",
  ],
  [
    "Build or upload a game artifact before review",
    "Tạo bản chơi thử hoặc tải game lên trước khi gửi duyệt.",
  ],
  [
    "Game cannot be submitted",
    "Chưa thể gửi game để duyệt. Hãy tải lại không gian làm việc.",
  ],
  [
    "Invalid game project",
    "Dữ liệu dự án không hợp lệ. Kiểm tra và lưu lại dự án.",
  ],
  [
    "Project source type does not match the game",
    "Loại dự án không khớp với cách tạo game.",
  ],
  [
    "This game does not accept ZIP uploads",
    "Game này không hỗ trợ tải tệp ZIP.",
  ],
  [
    "Artifact storage is unavailable",
    "Dịch vụ lưu bản chơi thử tạm thời không khả dụng. Vui lòng thử lại sau.",
  ],
  [
    "Artifact finalization is unavailable",
    "Chưa thể hoàn tất bản chơi thử. Vui lòng thử lại sau.",
  ],
  ["You cannot preview this game", "Bạn không có quyền chơi thử game này."],
  ["Game not found", "Không tìm thấy game."],
  ["Game file not found", "Không tìm thấy tệp game."],
  [
    "Game content capability is invalid or expired",
    "Liên kết chơi game đã hết hạn hoặc không hợp lệ. Hãy tải lại trang.",
  ],
  [
    "Provide one .zip file in the game field",
    "Chọn một tệp ZIP để tải game lên.",
  ],
  [
    "Invalid ZIP archive",
    "Tệp ZIP không hợp lệ. Hãy kiểm tra và nén lại game.",
  ],
  [
    "ZIP requires a root index.html",
    "Tệp ZIP cần có index.html ở thư mục gốc.",
  ],
  ["ZIP exceeds 25 MiB", "Tệp ZIP không được vượt quá 25 MiB."],
  ["ZIP exceeds 1,000 entries", "Tệp ZIP không được chứa quá 1.000 mục."],
  [
    "ZIP exceeds 100 MiB expanded",
    "Dung lượng giải nén không được vượt quá 100 MiB.",
  ],
  [
    "Unsafe or duplicate ZIP path",
    "Tệp ZIP có đường dẫn không hợp lệ hoặc trùng lặp.",
  ],
  [
    "ZIP file and directory paths conflict",
    "Đường dẫn tệp và thư mục trong ZIP bị trùng nhau.",
  ],
  [
    "Encrypted entries are not supported",
    "Tệp ZIP có mục được mã hóa. Hãy bỏ mật khẩu và nén lại.",
  ],
  [
    "ZIP contains a symbolic link or unsupported file type",
    "Tệp ZIP chứa liên kết hoặc loại tệp không được hỗ trợ.",
  ],
  [
    "Directory entries must be empty",
    "Cấu trúc thư mục trong tệp ZIP không hợp lệ.",
  ],
  [
    "Unsupported file extension",
    "Tệp ZIP chứa định dạng tệp không được hỗ trợ.",
  ],
  ["Moderator access is required", "Thao tác này yêu cầu quyền kiểm duyệt."],
  [
    "Invalid review revision",
    "Phiên bản gửi duyệt không hợp lệ. Hãy tải lại danh sách.",
  ],
  ["Invalid review input", "Kiểm tra phiên bản game và lý do từ chối."],
  [
    "Game is not pending review",
    "Game không còn chờ duyệt. Hãy tải lại danh sách.",
  ],
  ["Invalid discovery query", "Thông tin tìm kiếm không hợp lệ."],
  ["Invalid cursor", "Danh sách game đã thay đổi. Hãy tải lại trang."],
]);

export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError
    ? (messages.get(error.message) ?? fallback)
    : fallback;
}
