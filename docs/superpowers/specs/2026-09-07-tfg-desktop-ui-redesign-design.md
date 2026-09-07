# Thiết kế lại giao diện desktop TFG

**Ngày:** 2026-09-07  
**Trạng thái:** Đã được duyệt trong trao đổi  
**Phạm vi:** Toàn bộ giao diện web desktop, trang chơi game, ảnh bìa game và khung tích hợp Google AdSense

## 1. Mục tiêu

Thiết kế lại IndieForge thành thương hiệu **TFG** với giao diện mềm mại nhưng vững chắc, mang cảm giác công nghệ mà không quá giống một template gaming. Giao diện phải đồng bộ trên toàn bộ sản phẩm, dùng tiếng Việt và hỗ trợ cả theme sáng/tối.

Trang chơi game là trọng tâm của thay đổi. Trên desktop, game phải hiển thị trọn trong chiều cao khung nhìn ngay khi trang mở, không có thanh cuộn bên trong iframe, giữ đúng tỷ lệ và có chế độ fullscreen thật. Cột trái dành cho quảng cáo chưa bật; cột phải hiển thị các game khác.

## 2. Quyết định sản phẩm

- Chỉ thiết kế và kiểm thử có chủ đích cho desktop. Layout vẫn không được vỡ khi cửa sổ hẹp, nhưng không xây một trải nghiệm mobile riêng trong phạm vi này.
- Toàn bộ copy giao diện người dùng chuyển sang tiếng Việt.
- Thương hiệu hiển thị là **TFG**, không kèm tên mở rộng.
- Trang chủ ưu tiên người sáng tạo, sau đó mới giới thiệu game nổi bật.
- Màu nhận diện là cyan và tím điện, dùng tiết chế trên các lớp nền trung tính.
- Google AdSense được chuẩn bị sẵn nhưng tắt mặc định. Khi tắt, giao diện hiển thị placeholder có nhãn rõ ràng.
- Game có thể có ảnh bìa riêng do chủ sở hữu tải lên. Game cũ không có ảnh sử dụng bìa mặc định sinh từ tên và slug.
- Player giữ nguyên tỷ lệ nội dung. Không kéo giãn hoặc cắt nội dung game để lấp đầy khung.

## 3. Ngôn ngữ thiết kế

### 3.1 Logo và typography

Logo là monogram chữ **TFG** dạng vector/CSS-native, không phụ thuộc tệp bitmap. Hình chữ có khối rõ, góc bo mềm và một chi tiết gradient cyan–tím. Logo phải đọc được ở kích thước header và có phiên bản nhỏ dùng làm favicon.

Font sans hiện đại được dùng thống nhất. Tiêu đề đậm, gọn và có tracking chặt vừa phải; nội dung có line-height thoáng. Không dùng font trang trí cho văn bản nghiệp vụ.

### 3.2 Token và component nền tảng

CSS custom properties là nguồn sự thật duy nhất cho:

- nền trang, nền nâng, panel và overlay;
- chữ chính, chữ phụ, viền và trạng thái;
- primary cyan, secondary violet, success, warning và danger;
- radius, shadow, spacing, chiều rộng content và thời gian transition.

Card có phân lớp nhẹ, viền tinh tế và bóng mềm. Button/input có chiều cao chắc tay, focus ring tương phản và đủ các trạng thái hover, active, disabled, loading, error. Chuyển động giao diện nằm trong khoảng 150–250 ms và bị tắt khi `prefers-reduced-motion: reduce`.

### 3.3 Theme

Hệ thống có ba giá trị `system`, `light`, `dark`. Mặc định là `system`; nút header cho phép chuyển thủ công và lưu lựa chọn. Script theme nhỏ chạy trước khi paint để tránh nháy sai theme. Nếu storage bị chặn, theme vẫn hoạt động trong phiên hiện tại và không làm hỏng trang.

## 4. App shell và các trang

### 4.1 Header và footer

Header desktop gọn, sticky, có logo TFG, các mục **Khám phá**, **Studio**, **Hồ sơ**, **Kiểm duyệt** theo quyền, theme toggle và đăng nhập/đăng xuất. Trạng thái active được phân biệt bằng cả màu lẫn hình dạng, không chỉ bằng màu.

Footer tối giản, mang thương hiệu TFG và không chiếm chiều cao không cần thiết.

### 4.2 Trang chủ

Trang chủ dẫn bằng giá trị cho người sáng tạo: tạo, thử và phát hành game ngay trên trình duyệt. CTA chính mở Studio; CTA phụ mở Khám phá. Các section theo sau gồm:

1. bốn cách tạo game: ZIP HTML5, code, truyện/quiz và platformer;
2. quy trình ba bước: tạo, xem trước, gửi duyệt;
3. một nhóm game nổi bật/public để chứng minh đầu ra của nền tảng.

Không thêm CMS, analytics dashboard hoặc nội dung marketing ngoài các phần trên.

### 4.3 Khám phá

Trang có heading, mô tả ngắn, search bar lớn và lưới thẻ game. Thẻ dùng ảnh bìa 16:9, tên game, tên nhà phát triển và mô tả rút gọn. Toàn bộ thẻ là mục tiêu tương tác hợp lệ. Empty/error state giữ nguyên không gian, có hành động tiếp theo rõ ràng.

### 4.4 Studio và workspace

Studio là dashboard có lời chào, CTA **Tạo game**, thống kê ngắn theo trạng thái và danh sách dự án dạng card. Badge phân biệt bản nháp, chờ duyệt, đã duyệt và bị từ chối.

Workspace giữ nguyên luồng nghiệp vụ nhưng gom metadata, editor/builder, build/upload, preview và review action thành các panel rõ. Các hành động **Lưu**, **Build**, **Xem trước**, **Gửi duyệt** luôn có thứ bậc thị giác phù hợp; không thay đổi validation hoặc state machine hiện có.

### 4.5 Tài khoản, hồ sơ và kiểm duyệt

Trang đăng nhập/đăng ký dùng card tập trung, label hiện rõ và lỗi nằm gần field/hành động liên quan. Hồ sơ có avatar chữ cái và phần thông tin nhà phát triển.

Kiểm duyệt dùng card rộng, preview đủ lớn và tách rõ duyệt/từ chối. Mọi kiểm tra role, revision và conflict hiện có được giữ nguyên.

## 5. Trang chơi game

### 5.1 Above-the-fold desktop

Sau header, trang dùng lưới ba cột:

1. **Trái:** cột quảng cáo rộng khoảng 180–220 px, có hai slot responsive.
2. **Giữa:** player lấy toàn bộ không gian còn lại và là trọng tâm.
3. **Phải:** cột game khác rộng khoảng 260–300 px, hiển thị 4–6 game public và loại trừ game hiện tại.

Player tính chiều cao từ viewport sau khi trừ header, toolbar và spacing. Iframe lấp đầy player, không có scrollbar nội bộ và không buộc trang cuộn để thấy trọn game. Nội dung game được fit theo tỷ lệ; phần dư là nền đệm đồng bộ. Với game upload không responsive, player không được phép làm méo nội dung; phần nằm ngoài viewport iframe bị clip thay vì sinh thanh cuộn.

Toolbar hiển thị tên game và nút fullscreen. Thông tin dài như mô tả, tác giả và chi tiết được chuyển xuống dưới fold để không làm nhỏ player.

### 5.2 Fullscreen

Nút fullscreen gọi Fullscreen API từ thao tác người dùng. Toàn bộ player trở thành fullscreen, nền tối, iframe căn giữa và phóng lớn tối đa trong khi giữ tỷ lệ. Nút có cả trạng thái vào/thoát fullscreen. `Escape` do trình duyệt xử lý. Nếu API không có hoặc request bị từ chối, player tiếp tục chạy và thông báo ngắn được hiển thị.

### 5.3 Game khác

Cột phải tái sử dụng public discover data. Phiên bản đầu lấy các game public mới nhất, loại trừ slug hiện tại và giới hạn số lượng; không thêm recommendation engine. Mỗi mục có bìa nhỏ, tên và tác giả.

## 6. Ảnh bìa game

### 6.1 Dữ liệu và lưu trữ

Game có `coverVersion` nullable/khởi tạo bằng 0 và metadata content type cần thiết để phục vụ file. Byte ảnh nằm trong volume game storage bền vững, trong namespace riêng và không trộn với artifact version có thể chạy.

Chủ sở hữu tải lên một file JPEG, PNG hoặc WebP tại workspace. API giới hạn 5 MiB, kiểm tra MIME khai báo và magic bytes, từ chối file rỗng/sai định dạng, và ghi file theo quy trình atomic. Mỗi lần thay ảnh tăng version để URL/cache thay đổi. Thao tác không được sửa owner, artifact hoặc review state của game.

Ảnh bìa public chỉ được phục vụ khi game đáp ứng cùng điều kiện visibility/moderation/review như trang public. Chủ sở hữu được xem bìa game của mình trong workspace. Response có content type cố định, `nosniff` và cache policy theo URL có version.

### 6.2 Fallback

Khi `coverVersion` không có, web render bìa CSS/SVG-native từ title/slug với gradient xác định, logo TFG và chữ cái. Fallback không tạo tệp, không gọi dịch vụ ngoài và giữ layout 16:9 không bị shift.

## 7. Quảng cáo

`AdSlot` nhận slot ID và kích thước/layout mong muốn. Hai biến build-time/public configuration quyết định AdSense có được bật và publisher ID nào được dùng. Script AdSense chỉ được chèn một lần khi:

1. cờ enabled bằng true;
2. publisher ID không rỗng và đúng dạng;
3. slot ID cụ thể hợp lệ.

Trong môi trường hiện tại, cờ bằng false. `AdSlot` render placeholder có nhãn **Quảng cáo**, không gửi network request tới Google và không hiển thị quảng cáo giả. CSP chỉ mở cho domain AdSense khi tích hợp được bật trong một thay đổi triển khai có chủ đích.

## 8. Ranh giới kiến trúc

Các unit chính và trách nhiệm:

- **Design tokens/global styles:** theme, typography, spacing và primitive state.
- **Brand/AppShell/ThemeToggle:** nhận diện, navigation theo session và theme; không chứa logic game.
- **GameCover/GameCard:** quyết định URL/fallback và trình bày summary; không truy vấn data.
- **GamePlayer:** iframe, toolbar, fit, fullscreen và thông báo lỗi fullscreen; không quyết định quyền play.
- **AdSlot:** placeholder hoặc AdSense adapter theo config; không tạo config runtime.
- **Cover service/storage:** validate, ghi/đọc và phân quyền ảnh; không can thiệp artifact executable.
- **Page server components:** tải data qua API hiện có, ghép layout và cung cấp props cho component.

Không thêm thư viện UI nặng. Không viết lại frontend hoặc thay đổi auth, role, moderation state machine, sandbox, CSP game content, signed capability URL hay contract phát game public.

## 9. Error handling và accessibility

- Mọi loading, empty, validation, network và conflict state có copy tiếng Việt ngắn gọn.
- Lỗi upload ảnh phân biệt sai định dạng, quá dung lượng, không có quyền và lỗi lưu trữ; file hiện tại vẫn nguyên khi ghi bản mới thất bại.
- Fullscreen thất bại không dừng hoặc reload iframe.
- Component tương tác có accessible name, focus-visible và thứ tự tab hợp lý.
- Theme sáng/tối đáp ứng contrast cho nội dung và control quan trọng.
- Không dùng màu làm tín hiệu duy nhất cho trạng thái.
- Layout không thay đổi khi ảnh bìa hoặc ad slot chưa tải xong.

## 10. Kiểm thử và tiêu chí chấp nhận

### 10.1 Automated checks

- Unit/component test cho theme initialization/toggle, TFG navigation, GameCover fallback/URL, GameCard, AdSlot disabled/enabled guard, GamePlayer fullscreen success/failure và related-game filtering.
- Contract/database/API test cho cover metadata, migration, upload JPEG/PNG/WebP, magic-byte mismatch, file rỗng, file trên 5 MiB, owner isolation, public/private access, atomic replacement và cache headers.
- Browser E2E cho theme sáng/tối và các luồng đăng ký, đăng nhập, hồ sơ, Studio, bốn source type, preview, submit, reject/resubmit/approve, Discover và public play.
- Existing security, backup/restore, container contract, typecheck, lint và production build checks tiếp tục phải qua.

### 10.2 Visual/player acceptance

Kiểm tra ở 1280×720, 1440×900 và 1920×1080 cho cả theme sáng/tối:

- player, toolbar và hai sidebar nằm trong viewport ban đầu;
- iframe không có scrollbar;
- game giữ tỷ lệ và không bị méo;
- fullscreen và thoát fullscreen không reload game;
- cột trái chỉ có placeholder khi ads disabled và không có request tới Google;
- cột phải có tối đa sáu game, không chứa game hiện tại;
- game **Rắn Săn Mồi Neon** tải và nhận input sau redesign.

### 10.3 Rollout

Trước rollout, tạo và xác minh backup PostgreSQL cùng game-storage volume. Migration phải tương thích game hiện có và không yêu cầu bìa. Production image được build và kiểm tra trước khi thay container; giữ nguyên volume. Sau rollout, chạy smoke test public, upload/bản bìa, moderation, fullscreen, AdSense-disabled network check và restart API để xác minh artifact/ảnh còn bền vững.

## 11. Ngoài phạm vi

- Giao diện mobile chuyên biệt.
- Recommendation engine cá nhân hóa.
- CMS, analytics, billing hoặc dashboard doanh thu quảng cáo.
- Bật AdSense production khi chưa có publisher/slot ID và thay đổi CSP được duyệt.
- Tự chụp screenshot game làm bìa.
- Thay đổi gameplay/artifact của game hiện có.
- Viết lại backend, auth, moderation hoặc artifact delivery.
