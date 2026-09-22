"use client";

import { useMemo, useState } from "react";

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
    'Dựng bản chơi khác với lưu bản thiết kế. Mỗi lần sửa và lưu làm bản dựng cũ hết hiệu lực cho lần xuất bản tiếp theo. Nếu dự án đổi trong lúc dựng, đợi lưu xong rồi dựng lại. Chỉ gửi duyệt bản dựng khớp nội dung hiện tại. Nếu nút Gửi duyệt bị khóa, đọc lý do ngay bên dưới nút để biết cần lưu, dựng lại, lưu thông tin công khai hoặc chờ duyệt.',
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

const DOC_ARTICLES = [
  ["bat-dau", "Bắt đầu", "Nền tảng", "Tạo một dự án từ mẫu Đảo Đom Đóm để có game chơi được ngay, hoặc chọn dự án trống. Đi theo thanh bước từ Tài nguyên, Thiết kế, Gameplay, Code đến Chơi thử."],
  ["tong-quan", "Tổng quan Engine", "Nền tảng", "Dự án V2 là nguồn dữ liệu duy nhất cho cảnh, đối tượng, luật, biến và script. Studio tự lưu; bản chơi chỉ được dựng từ phiên bản máy chủ đã xác nhận."],
  ["tao-project", "Tạo Project", "Nền tảng", "Đặt tên, chọn mẫu rồi tạo bản nháp. Mẫu Pixel Adventure có sẵn điều khiển, va chạm, vật phẩm, máu, điểm và điều kiện thắng/thua."],
  ["tao-scene", "Tạo Scene", "Xây cảnh", "Cảnh là một màn chơi. Dùng danh sách cảnh để tạo, đổi tên, nhân bản, sắp xếp và chọn cảnh mở đầu; mỗi cảnh có kích thước, nền, lưới và các lớp riêng."],
  ["import-asset", "Import Asset", "Tài nguyên", "Trong Tài nguyên, tải PNG, JPEG, WebP hoặc WAV tối đa 10 MiB. Đợi trạng thái hoàn tất trước khi đặt ảnh vào cảnh hoặc tham chiếu âm thanh."],
  ["asset-manager", "Asset Manager", "Tài nguyên", "Tìm theo tên, lọc loại, xem thumbnail, đổi tên và xóa tệp không còn được tham chiếu. Tài nguyên thuộc riêng dự án và không được chuyển quyền bằng JSON."],
  ["sprite", "Sprite", "Tài nguyên", "Đặt ảnh vào cảnh để tạo đối tượng có SpriteRenderer. Bật pixel art để dùng nearest-neighbor; chỉnh vị trí và kích thước trong Inspector."],
  ["sprite-sheet", "Sprite Sheet", "Tài nguyên", "Engine lưu cấu hình khung trong Animator. Hiện Studio hỗ trợ dữ liệu Animator nhưng bản runtime chưa phát sprite sheet; dùng sprite tĩnh cho bản xuất hiện tại."],
  ["animation", "Animation", "Tài nguyên", "Animator và PLAY_ANIMATION được kiểm tra trong schema. Runtime hiện báo chẩn đoán khi gặp chúng, vì vậy animation chưa nên dùng làm điều kiện gameplay bắt buộc."],
  ["tilemap", "Tilemap", "Xây cảnh", "Canvas và bản dựng hiển thị các ô Tilemap theo grid. Thêm Tilemap, chọn tileset PNG, kích thước ô và dữ liệu tile; collision vẫn cần Collider riêng."],
  ["object", "Object", "Xây cảnh", "Đối tượng là vật trong cảnh: Player, Enemy, Item, NPC, UI hoặc trang trí. Chọn preset để có cấu hình hợp lệ, rồi chọn trên canvas hoặc hierarchy để sửa."],
  ["component", "Component", "Xây cảnh", "Component thêm khả năng cho object. Transform bắt buộc; SpriteRenderer vẽ ảnh, Collider chặn/trigger, Movement điều khiển, Health lưu máu và InventoryItem tạo vật phẩm."],
  ["collision", "Va chạm / Collision", "Gameplay", "Thêm Collider cho cả hai object. Collider đặc chặn chuyển động; isTrigger phát sự kiện mà không chặn. Runtime hỗ trợ hình chữ nhật và dùng khung bao cho hình tròn."],
  ["controller", "Character Controller", "Gameplay", "Preset Player tạo Movement ở chế độ PLAYER. Đặt tốc độ, dùng WASD/phím mũi tên hoặc nút cảm ứng; tránh đặt nhân vật khởi đầu bên trong vật cản."],
  ["camera", "Camera", "Xây cảnh", "Component Camera được lưu và kiểm tra duy nhất mỗi cảnh. Bản runtime theo followObjectId, hoặc Player nếu chưa chỉ định, để cuộn khung nhìn trong cảnh lớn."],
  ["input", "Input", "Gameplay", "Movement PLAYER nhận phím hướng/WASD. Visual Gameplay có ON_KEY_PRESS cho một phím cụ thể; repeat quyết định giữ phím có kích hoạt lặp hay không."],
  ["event-system", "Event System", "Gameplay", "Mỗi luật gồm trigger, condition tùy chọn và chuỗi action. Mở Gameplay để tạo, bật/tắt hoặc xóa luật; mọi thao tác có undo/redo và tự lưu."],
  ["visual-logic", "Visual Logic", "Gameplay", "Dùng Khi… Thì… cho luật không cần code. Hiện trình tạo nhanh hỗ trợ bắt đầu, hẹn giờ, nhấn phím, cộng điểm và hoàn thành; luật mẫu còn hỗ trợ va chạm, nhặt đồ và đổi máu."],
  ["variables", "Variables", "Gameplay", "Tạo biến NUMBER, BOOLEAN hoặc STRING trong Gameplay. Biến global dùng chung; schema cũng hỗ trợ player và scene. Script đọc/ghi qua ID với quyền GET_VARIABLE/SET_VARIABLE."],
  ["conditions", "Conditions", "Gameplay", "Runtime đánh giá so sánh biến, điểm, vật phẩm, vị trí, sự tồn tại và component. Các luật phức tạp có thể nhập qua JSON V2; luôn giữ bản sao trước khi chỉnh."],
  ["timer", "Timer", "Gameplay", "Chọn trigger Hết thời gian chờ, nhập số giây và action. Luật một lần chạy sau delay; schema hỗ trợ repeat và interval cho luật lặp."],
  ["audio", "Âm thanh", "Tài nguyên", "Tải WAV rồi dùng PLAY_AUDIO, api.playAudio(assetId), hoặc AudioSource autoplay. Runtime hỗ trợ volume và loop; trình duyệt có thể yêu cầu một thao tác người dùng trước khi phát."],
  ["ui", "UI trong game", "Xây cảnh", "UI object và SHOW_UI/HIDE_UI được runtime hỗ trợ. HUD điểm, máu và trạng thái thắng/thua của bản chơi được tạo tự động từ state runtime."],
  ["npc", "NPC", "Gameplay", "Preset NPC tạo object có sprite, Dialogue và Interactable. Thêm Collider nếu NPC cần chặn đường hoặc nhận va chạm. Dialogue có thể hiển thị node mở đầu; lựa chọn hội thoại nâng cao hiện được báo trong chẩn đoán."],
  ["enemy", "Enemy", "Gameplay", "Preset Enemy có Collider và Health. AI Movement hiện chưa tự di chuyển trong runtime; dùng timer/MOVE_OBJECT hoặc script cho hành vi có thể kiểm soát."],
  ["ai", "AI cơ bản", "Gameplay", "Dùng ON_TIMER kết hợp MOVE_OBJECT hoặc script để tạo tuần tra đơn giản. Runtime báo rõ Movement controls=AI vì điều hướng tự động chưa được triển khai."],
  ["health", "Health / Damage", "Gameplay", "Thêm Health với current/maximum, rồi dùng CHANGE_HEALTH khi va chạm. Player về 0 chuyển sang thua và nút Chơi lại khôi phục snapshot ban đầu."],
  ["inventory", "Inventory / Item", "Gameplay", "InventoryItem collectible kết hợp trigger Collider. Khi Player chạm, runtime thêm item, phát ON_COLLECT_ITEM và ẩn vật phẩm; ADD_ITEM/REMOVE_ITEM điều chỉnh số lượng."],
  ["score", "Score", "Gameplay", "ADD_SCORE đổi điểm runtime. Dùng SCORE_COMPARE cho cửa thắng hoặc tạo luật nhanh cộng điểm; HUD hiển thị điểm hiện tại."],
  ["scene-transition", "Scene Transition", "Gameplay", "CHANGE_SCENE chuyển sang scene ID hợp lệ, làm mới contact/timer và chạy ON_START/script của cảnh mới. Chọn entry scene để xác định điểm bắt đầu."],
  ["script", "Script / Code", "Nâng cao", "Tạo hoặc nhập .js, sửa mã, chọn quyền và gắn vào scene/object/event. Script chạy trong Worker cô lập, tối đa 500 ms và 100 lệnh, không có DOM hay import/export."],
  ["debug", "Debug / Console", "Kiểm thử", "Bản chơi hiển thị diagnostics cho component, action, script hoặc cấu hình runtime chưa hỗ trợ. Sửa nguồn, chờ Đã lưu, dựng lại rồi Restart để xác minh."],
  ["play-mode", "Play Mode", "Kiểm thử", "Dựng bản chơi từ head đã lưu, sau đó Play/Pause/Restart trong sandbox. Kiểm tra đường thắng, thua, input bàn phím và cảm ứng trước khi gửi duyệt."],
  ["export", "Export Game", "Xuất bản", "Xuất JSON để sao lưu cấu trúc. Tạo bản chơi thử để biên dịch artifact chạy trên web; điền metadata và gửi duyệt để xuất bản sau khi quản trị phê duyệt."],
  ["troubleshooting", "Troubleshooting", "Kiểm thử", "Nếu ảnh không hiện, kiểm tra asset/layer/visibility. Nếu luật không chạy, kiểm tra enabled, ID và diagnostics. Nếu bản chơi cũ, chờ lưu rồi dựng lại."],
  ["best-practices", "Best Practices", "Kiểm thử", "Đặt tên object/asset dễ hiểu, dùng preset trước, mỗi luật làm một việc, test sau từng thay đổi, giữ JSON backup và không dựa vào tính năng runtime đang có cảnh báo."],
  ["tutorial-30", "Tạo game Pixel 2D đầu tiên trong 30 phút", "Tutorial", "Chọn Đảo Đom Đóm → nhập một PNG → đặt vào cảnh → thêm Player/Collider/Movement → thêm Enemy/Health → thêm Item → tạo luật điểm và thắng → lưu → dựng → Play → xem chẩn đoán → sửa → dựng lại → xuất JSON hoặc gửi duyệt."],
] as const;

export function PixelStudioGuide({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("bat-dau");
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return needle ? DOC_ARTICLES.filter((article) => article.join(" ").toLocaleLowerCase("vi").includes(needle)) : DOC_ARTICLES;
  }, [query]);
  const activeIndex = Math.max(0, DOC_ARTICLES.findIndex((article) => article[0] === activeId));
  const active = DOC_ARTICLES[activeIndex];
  return <article className="pixel-studio-guide" style={{maxWidth:1100,margin:'0 auto',padding:compact?16:24,lineHeight:1.7,overflowWrap:'anywhere'}}>
    <p className="eyebrow">TFG Pixel Studio · Hướng dẫn thực hành</p>
    {compact ? <h2>Từ ý tưởng đến trò chơi đầu tiên</h2> : <h1>Tạo game pixel cùng TFG Studio</h1>}
    <p>Tra cứu đúng chức năng đang có trong engine, sau đó làm tutorial với chính workflow của Studio.</p>
    <label style={{display:'grid',gap:6,margin:'16px 0'}}>Tìm trong tài liệu<input aria-label="Tìm trong tài liệu" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Ví dụ: va chạm, script, xuất bản…" /></label>
    <div className="pixel-doc-layout" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:24}}>
      <nav aria-label="Chủ đề tài liệu" style={{maxHeight:620,overflow:'auto'}}>{filtered.length ? [...new Set(filtered.map((item)=>item[2]))].map(category=><section key={category}><h3>{category}</h3><ul style={{listStyle:'none',padding:0}}>{filtered.filter((item)=>item[2]===category).map(article=><li key={article[0]}><button type="button" aria-pressed={activeId===article[0]} onClick={()=>setActiveId(article[0])} style={{width:'100%',textAlign:'left',padding:8}}>{article[1]}</button></li>)}</ul></section>) : <p>Không tìm thấy bài phù hợp.</p>}</nav>
      <section id={`pixel-doc-${active[0]}`}><p className="eyebrow">{active[2]}</p><h2>{active[1]}</h2><p>{active[3]}</p>{active[0]==='script'&&<pre style={{overflowX:'auto',padding:16,border:'1px solid currentColor',borderRadius:12,whiteSpace:'pre-wrap'}}><code>{PIXEL_STUDIO_SCRIPT_EXAMPLE}</code></pre>}<div style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:32}}><button type="button" disabled={activeIndex===0} onClick={()=>setActiveId(DOC_ARTICLES[activeIndex-1][0])}>Bài trước</button><button type="button" disabled={activeIndex===DOC_ARTICLES.length-1} onClick={()=>setActiveId(DOC_ARTICLES[activeIndex+1][0])}>Bài tiếp theo</button></div></section>
    </div>
    <details style={{marginTop:32}}><summary><strong>Tutorial chi tiết: Đảo Đom Đóm</strong></summary>{PIXEL_STUDIO_GUIDE.map(section=><section id={`pixel-guide-${section.id}`} key={section.id} style={{scrollMarginTop:80,marginTop:32}}><h2>{section.title}</h2>{section.paragraphs.map(text=><p key={text}>{text}</p>)}</section>)}</details>
  </article>;
}
