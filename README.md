# TFG

TFG là nền tảng tạo, chia sẻ và chơi game nhỏ trên trình duyệt. Giao diện tiếng Việt hỗ trợ tài khoản, hồ sơ nhà phát triển, Studio, duyệt game và khám phá game đã được phê duyệt.

## Chạy trên máy phát triển

Cần Node.js 22, pnpm 10 (có thể dùng Corepack), Docker và Docker Compose v2. PostgreSQL 16 chạy trong Docker, không cần cài trực tiếp trên máy.

```bash
corepack enable
cp .env.example .env
# Tạo JWT_SECRET trong .env bằng: openssl rand -hex 32
docker compose up -d postgres
pnpm install --frozen-lockfile
set -a && . ./.env && set +a
pnpm db:generate
pnpm --filter @indieforge/database prisma migrate deploy
pnpm dev
```

Lệnh cuối giữ máy chủ web và API hoạt động. Mở [ứng dụng web](http://localhost:3000), [API](http://localhost:3001) hoặc [kiểm tra trạng thái API](http://localhost:3001/health).

`set -a && . ./.env && set +a` nạp biến môi trường cho Turbo và API. Dùng Bash, Zsh hoặc trình quản lý tiến trình để xuất các biến tương ứng.

`pnpm db:generate` tạo Prisma Client; cài thư viện và chạy `migrate deploy` chưa đủ để tạo client. Các lệnh phát triển, build, kiểm tra kiểu và kiểm thử cần cơ sở dữ liệu cũng tự chuẩn bị client và dùng lại bộ nhớ đệm khi phù hợp.

Xem [hướng dẫn phát triển](docs/development.md) và [tài liệu API](docs/api/foundation.md) để biết quy trình và ví dụ gọi API.

### Kiểm thử tích hợp Asset Manager

Lane Task 19 dùng ứng dụng thật thay vì API giả lập: lệnh sau tự tạo một
PostgreSQL 16 dùng một lần và thư mục lưu asset tạm, chạy migration, khởi động
API/web, rồi chạy `studio-assets.spec.ts` bằng Playwright. Container, tiến trình
và dữ liệu tạm được dọn khi lệnh kết thúc.

```bash
pnpm test:e2e:studio-assets
```

Cần Docker đang chạy và Chromium của Playwright (`pnpm --filter web exec
playwright install chromium` nếu máy chưa có). Dùng `pnpm
test:e2e:studio-assets -- --help` để xem các biến đổi cổng khi cổng mặc định
đang bận.

## Triển khai

Xem [hướng dẫn vận hành](docs/deployment.md) cho Docker Compose trên một máy chủ, HTTPS hoặc bản xem thử HTTP qua IP, sao lưu, khôi phục, nâng cấp và quay lui. Ảnh bìa và nội dung game cùng nằm trong volume `game_storage`; cần sao lưu toàn bộ volume cùng cơ sở dữ liệu.

## Tính năng hiện có

Studio hỗ trợ tải game HTML5 dạng ZIP, viết HTML/CSS/JavaScript, dựng truyện tương tác và tạo game platformer. Chủ sở hữu có thể tải ảnh bìa JPEG, PNG hoặc WebP tối đa 5 MiB, chọn tỉ lệ khung hình, xem bản nháp và gửi game để duyệt. Game được phê duyệt xuất hiện trong Khám phá và chạy trong iframe có sandbox.

Giao diện có chế độ sáng, tối hoặc theo hệ thống; lựa chọn được lưu trên trình duyệt. Trình chơi trên máy tính giữ tỉ lệ game, hỗ trợ toàn màn hình và hiển thị game liên quan. Quảng cáo mặc định tắt (`NEXT_PUBLIC_ADSENSE_ENABLED=false`); các ô chỉ hiển thị chữ “Quảng cáo”.

Quét mã độc, phân tích sử dụng và quyên góp chưa được triển khai. Trải nghiệm cảm ứng chuyên biệt trên điện thoại nằm ngoài phạm vi bản phát hành này. Tên kỹ thuật `indieforge` trong package, cookie và volume được giữ để tương thích triển khai.
