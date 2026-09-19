# Tải game web

Tạo bản nháp bằng **Tải game HTML5/ZIP**, rồi mở game trong Xưởng sáng tạo để tải ZIP và chọn Chơi thử. Tải lên thành công không đồng nghĩa game đã chạy hoặc đã được duyệt.

## Đóng gói

- ZIP phải có đúng một `index.html` ở thư mục gốc.
- Dùng đường dẫn tương đối cho JavaScript, CSS, ảnh, âm thanh và asset trong ZIP.
- ZIP tối đa 100 MiB; tổng dữ liệu giải nén tối đa 400 MiB; tối đa 2.000 mục, gồm cả thư mục.
- Không đưa executable, engine source project, symbolic link, archive có mật khẩu hoặc extension không được hỗ trợ vào ZIP.

## Export engine

Chọn cấu hình Web không nén và một luồng. Không đưa `.gz`, `.br` hay `.unityweb` vào ZIP; nén toàn bộ thư mục export bằng ZIP sau khi export hoàn tất.

Unity WebGL và Godot Web chưa được công bố tương thích. Platform hiện phục vụ MIME asset Web thông dụng, nhưng sandbox giữ `allow-scripts allow-pointer-lock`, không có same-origin và chặn fetch/XHR, WebSocket cùng browser storage. Hãy luôn mở Chơi thử để kiểm tra asset, input và render trước khi gửi duyệt.

## Xuất bản

Sau khi Chơi thử hoạt động, gửi game duyệt. Bản upload mới sẽ trở thành bản nháp và cần moderator phê duyệt trước khi chơi công khai. Nếu upload lỗi, bản chơi trước đó được giữ lại.
