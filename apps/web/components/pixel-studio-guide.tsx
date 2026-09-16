export const PIXEL_STUDIO_SCRIPT_EXAMPLE = `// Nội dung của hàm JavaScript; không dùng import hay export.
api.showDialogue("Xin chào! Gom đủ 5 đom đóm rồi đến hải đăng.");`;

export const PIXEL_STUDIO_GUIDE = [
  { id: 'bat-dau', title: '1. Tạo trò chơi đầu tiên', paragraphs: [
    'Mở Studio, tạo dự án ENGINE, đặt tên và chọn mẫu Đảo Đom Đóm. Mẫu đã có nhân vật, bản đồ, 5 tinh thể, 3 bụi gai và hải đăng. Chọn dự án trống nếu bạn muốn tự dựng mọi thứ.',
    'Mở Chơi thử & xuất bản, chờ lưu hoàn tất rồi bấm Tạo bản chơi thử. Dùng WASD hoặc phím mũi tên; trên điện thoại dùng các nút hướng. Gom đủ 5 tinh thể và chạm hải đăng ở góc trên bên phải để thắng. Mỗi lần đi vào bụi gai mất một tim; hết 3 tim là thua. Rời bụi gai trước khi đi vào lại. Chơi lại để bắt đầu từ đầu.',
  ] },
  { id: 'thiet-ke', title: '2. Hiểu cảnh, đối tượng và hành vi', paragraphs: [
    'Cảnh là một màn chơi. Lớp giúp sắp xếp nền và nhân vật. Đối tượng là một vật trong cảnh; Transform giữ vị trí và kích thước, SpriteRenderer giữ hình ảnh. Chọn đối tượng trong danh sách hoặc trên bản đồ để chỉnh thuộc tính.',
    'Trong Thiết kế, chọn Linh — người giữ đèn. Đổi tốc độ Movement từ 128 thành 180, lưu và dựng lại để cảm nhận khác biệt. Kéo một cây chắn lối sang chỗ khác; Collider làm cây chặn đường thật. Giữ lối đi rộng hơn nhân vật 24 × 24 để tránh kẹt.',
    'Tinh thể có InventoryItem và vùng va chạm. Sự kiện ON_COLLECT_ITEM cộng 1 điểm; hải đăng dùng ON_ENTER_AREA với điều kiện điểm ít nhất 5 rồi COMPLETE_GAME. Bụi gai dùng ON_COLLISION và CHANGE_HEALTH -1. Khi thêm tinh thể hoặc đổi luật thắng, cập nhật cả sự kiện và điều kiện đích đến. Xem thành phần trong thuộc tính nâng cao. Để sửa luật sự kiện, xuất JSON, chỉnh mảng events với các ID đang có rồi nhập lại bản đã kiểm tra; giữ một bản sao trước khi sửa.',
    'Dùng Hoàn tác/Làm lại để sửa thao tác. Các hình pixel có sẵn là tài nguyên dựng sẵn; bạn có thể thay từng hình bằng ảnh của mình. Đây là engine 2D nhìn từ trên xuống; không phải mọi thành phần nâng cao đều có trình chạy tương ứng.',
  ] },
  { id: 'tai-nguyen', title: '3. Nhập ảnh PNG và âm thanh WAV', paragraphs: [
    'Mở Tài nguyên, chọn Nhập ảnh / âm thanh hoặc Tải lên. Ảnh hỗ trợ PNG, JPEG, WebP; âm thanh hỗ trợ WAV; tối đa 10 MiB mỗi tệp. PNG nền trong suốt phù hợp nhân vật pixel. Giữ đúng đuôi và định dạng thực của tệp, không chỉ đổi tên.',
    'Chờ tải xong, chọn ảnh rồi đặt vào cảnh đang mở. Di chuyển, đổi kích thước và đặt tên dễ nhớ. Nếu muốn ảnh là vật cản hoặc nhân vật, thêm Collider hoặc Movement phù hợp; một ảnh trang trí tự nó không tạo luật chơi. Lưu rồi dựng lại để kiểm tra hình trong bản chơi.',
    'WAV nằm trong thư viện tài nguyên. Dùng PLAY_AUDIO trong sự kiện hoặc api.playAudio với ID tài nguyên đã khai báo; âm thanh có thể cần một lần chạm/phím trước khi trình duyệt cho phát. Tải lên âm thanh không tự làm nhạc nền phát.',
  ] },
  { id: 'code', title: '4. Nhập và sửa JavaScript', paragraphs: [
    'Mở Code, chọn Lời chào trên đảo hoặc tạo script. Nhập tệp .js để đưa mã vào ô soạn thảo, đặt tên, chọn cảnh gắn script rồi lưu script. Việc chọn tệp chưa thay thế bước lưu. Đổi lời chào trong ví dụ dưới đây, chờ dự án lưu xong, dựng lại và bắt đầu lại màn chơi.',
    'Mã là phần thân hàm JavaScript bất đồng bộ: không dùng import/export, document hay thao tác DOM. Script gắn cảnh chạy khi vào cảnh; script gắn đối tượng chạy khi vào cảnh chứa nó. Script gắn sự kiện chạy khi sự kiện được kích hoạt. Mã được lưu cùng dự án, chạy trong môi trường chơi cô lập và không chạy trong cửa sổ soạn thảo.',
    'API: api.showDialogue(text), api.getVariable(id), api.setVariable(id, value), api.changeScene(sceneId), api.spawnObject(prefabId, x, y), api.playAudio(assetId). ID phải là ID thật trong dự án, không phải tên hiển thị. Bật quyền tương ứng SHOW_DIALOGUE, GET_VARIABLE, SET_VARIABLE, CHANGE_SCENE, SPAWN_OBJECT hoặc PLAY_AUDIO trong script trước khi gọi.',
    'Ví dụ biến: api.setVariable(id, Number(api.getVariable(id)) + 1), với id là biến NUMBER đã tồn tại. Một lượt script có giới hạn thời gian 500 ms và tối đa 100 lệnh; tránh vòng lặp vô hạn. Khi có lỗi cú pháp, thiếu quyền hoặc hết thời gian, xem chẩn đoán trong bản chơi, sửa, lưu, dựng lại và khởi động lại.',
  ] },
  { id: 'luu', title: '5. Lưu, bản sao JSON và xung đột', paragraphs: [
    'Theo dõi trạng thái lưu trên thanh công cụ. Chỉ đóng trang hoặc dựng bản chơi sau khi máy chủ xác nhận đã lưu. Khi mất mạng hay lưu lỗi, giữ trang mở, kết nối lại và thử lưu lại; không coi bản xem trước cũ là bản đã chứa thay đổi mới.',
    'Xuất JSON để lưu bản sao cấu trúc dự án. Nhập JSON ở mục dự án, không dùng nút tải ảnh/âm thanh. Dữ liệu phải đúng schema V2 và được kiểm tra trước khi thay thế. JSON không chứa các byte PNG/WAV; giữ tệp gốc riêng. Tài nguyên của một dự án khác không tự được chuyển quyền bằng JSON.',
    'Nhập dự án thay thế cấu trúc đang sửa nhưng giữ danh tính dự án hiện tại. Xuất bản sao trước khi nhập. Nếu hai tab cùng sửa và xuất hiện xung đột, xuất bản cục bộ để giữ công việc, tải bản mới từ máy chủ theo lựa chọn phục hồi của Studio rồi áp dụng lại thay đổi cần giữ. Tránh bấm lưu lặp lại với hi vọng ghi đè bản mới.',
  ] },
  { id: 'xuat-ban', title: '6. Chơi thử, dựng và gửi duyệt', paragraphs: [
    'Trong Chơi thử & xuất bản, chờ lưu hoàn tất rồi bấm Tạo bản chơi thử để dựng từ phiên bản hiện tại. Chơi thử đường thắng, đường thua và Chơi lại; kiểm tra ảnh vừa nhập, lời chào đã sửa, điều khiển phím và cảm ứng.',
    'Dựng bản chơi khác với lưu bản thiết kế. Mỗi lần sửa và lưu làm bản dựng cũ hết hiệu lực cho lần xuất bản tiếp theo. Nếu dự án đổi trong lúc dựng, đợi lưu xong rồi dựng lại. Chỉ gửi duyệt bản dựng khớp nội dung hiện tại.',
    'Điền tên, mô tả, hướng dẫn và thông tin công khai trong biểu mẫu, rồi gửi duyệt. Gửi duyệt chưa có nghĩa là trò chơi đã công khai; quản trị viên phải phê duyệt. Nếu bị trả lại, đọc lý do, sửa và lưu, dựng lại rồi gửi lại. Giữ quyền sử dụng đối với hình ảnh và âm thanh bạn nhập.',
  ] },
  { id: 'dien-thoai', title: '7. Làm việc trên điện thoại', paragraphs: [
    'Dùng thanh tác vụ để chuyển Bắt đầu, Thiết kế, Tài nguyên, Code, Chơi thử & xuất bản và Hướng dẫn. Bạn có thể nhập tệp, sửa mã và mở bản chơi trên màn hình nhỏ. Xoay ngang nếu cần xem bản đồ rộng hơn; máy tính thuận tiện hơn khi đặt nhiều vật nhỏ chính xác.',
    'Trong bản chơi, giữ nút hướng để di chuyển rồi thả để dừng. Nếu phím không phản hồi trên máy tính, bấm vào vùng chơi trước. Chơi lại khôi phục vị trí, tinh thể, điểm và tim ban đầu; nó không xóa bản thiết kế đã lưu.',
  ] },
  { id: 'khac-phuc', title: '8. Khắc phục nhanh', paragraphs: [
    'Ảnh không hiện: kiểm tra tải lên thành công, đối tượng và lớp đang hiển thị, SpriteRenderer chọn đúng ảnh; lưu và dựng lại. Không đi được: kiểm tra Movement ở chế độ PLAYER, tốc độ lớn hơn 0 và nhân vật không nằm trong Collider đặc.',
    'Không thắng: kiểm tra đã nhặt đủ 5 tinh thể, sau đó rời vùng hải đăng và đi vào lại. Không thấy code đổi: lưu script, chờ xác nhận lưu dự án, dựng bản mới rồi bắt đầu lại. Mã không chạy: kiểm tra cảnh gắn, quyền API và chẩn đoán trong vùng chơi.',
    'Không gửi duyệt được: kiểm tra quyền sở hữu, trạng thái lưu, bản dựng còn hiệu lực và thông tin công khai bắt buộc. JSON bị từ chối: dùng bản xuất từ Studio, kiểm tra ID và tài nguyên thuộc dự án; không bỏ qua thông báo kiểm tra dữ liệu.',
  ] },
] as const;

export function PixelStudioGuide({ compact = false }: { compact?: boolean }) {
  return <article className="pixel-studio-guide" style={{maxWidth:920,margin:'0 auto',padding:compact?16:24,lineHeight:1.7,overflowWrap:'anywhere'}}>
    <p className="eyebrow">TFG Pixel Studio · Hướng dẫn thực hành</p>
    {compact ? <h2>Từ ý tưởng đến trò chơi đầu tiên</h2> : <h1>Tạo game pixel cùng TFG Studio</h1>}
    <p>Bắt đầu với Đảo Đom Đóm, thay đổi một chi tiết và nhìn thấy kết quả trong bản chơi của chính bạn.</p>
    <nav aria-label="Mục lục hướng dẫn"><ol>{PIXEL_STUDIO_GUIDE.map(section=><li key={section.id}><a href={`#pixel-guide-${section.id}`}>{section.title.replace(/^\d+\. /,'')}</a></li>)}</ol></nav>
    {PIXEL_STUDIO_GUIDE.map(section=><section id={`pixel-guide-${section.id}`} key={section.id} style={{scrollMarginTop:80,marginTop:32}}>
      <h2>{section.title}</h2>{section.paragraphs.map(text=><p key={text}>{text}</p>)}
      {section.id==='code' && <pre style={{overflowX:'auto',padding:16,border:'1px solid currentColor',borderRadius:12,whiteSpace:'pre-wrap'}}><code>{PIXEL_STUDIO_SCRIPT_EXAMPLE}</code></pre>}
    </section>)}
  </article>;
}
