// Browser-only game programs are serialized here; the seed never executes them.
const baseCss = `*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px system-ui,sans-serif}main{max-width:800px;margin:auto;padding:20px}h1{font-size:clamp(24px,5vw,36px);margin:5px 0}p{line-height:1.5}button{font:inherit;cursor:pointer;touch-action:manipulation;min-height:44px;border:2px solid transparent;border-radius:12px;padding:10px 14px;background:var(--accent);color:var(--btn);font-weight:700}button:focus-visible{outline:3px solid var(--ink);outline-offset:3px}button:disabled{cursor:default;opacity:.55}.stats{display:flex;gap:12px;flex-wrap:wrap;padding:12px 0}.stats span{background:var(--panel);padding:9px 12px;border-radius:10px}.panel{background:var(--panel);border-radius:20px;padding:18px;margin:14px 0}#status{min-height:50px}#status:empty{display:none}.actions{display:flex;gap:10px;flex-wrap:wrap}.eyebrow{letter-spacing:.18em;font-size:12px;font-weight:800;text-transform:uppercase}small{line-height:1.5}#restart{background:transparent;border-color:var(--accent);color:var(--ink)}@media(max-width:480px){main{padding:12px}.panel{padding:12px}.stats{gap:6px}.stats span{padding:7px;font-size:14px}}`;

function bridge() {
  let score = 0;
  const scoreNode = document.querySelector('#score');
  const bestNode = document.querySelector('#best');
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.type !== 'tfg:score-state') return;
    const best = event.data.personalBest;
    if (Number.isInteger(best) && best >= 0 && best <= 2147483647) bestNode.textContent = String(best);
  });
  window.parent.postMessage({ type: 'tfg:score-ready' }, '*');
  return {
    reset() { score = 0; scoreNode.textContent = '0'; },
    add(points) { score += points; scoreNode.textContent = String(score); window.parent.postMessage({ type: 'tfg:score', score }, '*'); },
    status(message) { document.querySelector('#status').textContent = message; },
  };
}

function game(key, title, genre, instructions, markup, palette, css, play, scoreSamples, durationSeconds) {
  return { key, title, genre, instructions, scoreSamples, durationSeconds, project: {
    sourceType: 'CODE',
    html: `<main><div class="stats"><span>Điểm: <b id="score">0</b></span><span>Kỷ lục cá nhân: <b id="best">—</b></span></div>${markup}<p id="status" role="status" aria-live="polite"></p><button id="restart" type="button">Chơi lại</button></main>`,
    css: `:root{${palette}}${baseCss}${css}`,
    javascript: `(() => { const ui = (${bridge.toString()})(); (${play.toString()})(ui); })();`,
  } };
}

function strategy(ui) {
  const waves = [[2,0,1],[0,3,2],[3,2,1],[2,4,3],[4,3,4],[5,4,5]];
  let turn, sun, health, towers, ended;
  const field = document.querySelector('#lanes');
  function render() {
    document.querySelector('#turn').textContent = `${Math.min(turn + 1, 6)}/6`;
    document.querySelector('#sun').textContent = sun;
    document.querySelector('#health').textContent = health;
    field.replaceChildren();
    towers.forEach((power, lane) => {
      const card = document.createElement('section'); card.className = 'lane';
      const heading = document.createElement('h2'); heading.textContent = ['Luống cải','Luống cà','Luống bí'][lane];
      const info = document.createElement('p'); info.textContent = `🌱 Sức thủ: ${power} • 🐛 Sâu tới: ${ended ? 0 : waves[turn][lane]}`;
      const buy = document.createElement('button'); buy.textContent = 'Trồng lính (+1) · 2 ☀'; buy.dataset.lane = lane;
      buy.setAttribute('aria-label', `Trồng lính luống ${lane + 1}`); buy.disabled = ended || sun < 2 || power >= 5;
      buy.onclick = () => { if (ended || sun < 2 || towers[lane] >= 5) return; sun -= 2; towers[lane]++; render(); };
      card.append(heading, info, buy); field.append(card);
    });
    document.querySelector('#advance').disabled = ended;
    document.querySelector('#repair').disabled = ended || sun < 3 || health >= 10;
  }
  document.querySelector('#repair').onclick = () => { if (ended || sun < 3 || health >= 10) return; sun -= 3; health = Math.min(10, health + 3); render(); ui.status('Đã chăm vườn: phục hồi tối đa 3 lá chắn.'); };
  document.querySelector('#advance').onclick = () => {
    if (ended) return;
    const damage = waves[turn].reduce((total, bugs, i) => total + Math.max(0, bugs - towers[i]), 0);
    const stopped = waves[turn].reduce((total, bugs, i) => total + Math.min(bugs, towers[i]), 0);
    health = Math.max(0, health - damage); ui.add(stopped * 20); turn++;
    if (!health) { ended = true; ui.status('Hết lá chắn! Vườn bị sâu chiếm. Thử chia lính theo dự báo từng luống.'); }
    else if (turn === 6) { ended = true; ui.add(health * 50 + sun * 10 + 300); ui.status('Chiến thắng! Bạn bảo vệ được khu vườn qua cả 6 đợt sâu.'); }
    else { sun += 5; ui.status(`Qua đợt ${turn}: chặn ${stopped} sâu, mất ${damage} lá chắn. Thu hoạch thêm 5 nắng.`); }
    render();
  };
  function reset() { turn = 0; sun = 8; health = 10; towers = [0,0,0]; ended = false; ui.reset(); ui.status('Xem số sâu sắp tới rồi phân bổ nắng. Mỗi lính tồn tại suốt ván.'); render(); }
  document.querySelector('#restart').onclick = reset; reset();
}

function reflex(ui) {
  let active = false, lit = -1, hits = 0, lives = 3, deadline = 0, nextAt = 0;
  const cells = [...document.querySelectorAll('[data-pad]')];
  function draw() { document.querySelector('#hits').textContent = `${hits}/12`; document.querySelector('#lives').textContent = lives; cells.forEach((cell, i) => { cell.classList.toggle('lit', active && i === lit); cell.setAttribute('aria-label', `Ô ${i + 1}${active && i === lit ? ' đang sáng' : ''}`); cell.textContent = active && i === lit ? 'CHẠM' : String(i + 1); cell.disabled = !active; }); }
  function finish(win) { document.body.classList.remove('playing'); active = false; lit = -1; document.querySelector('#start').disabled = false; ui.status(win ? 'Hoàn thành 12 nhịp! Bạn đã bắt trọn dải sáng.' : 'Hết 3 cơ hội. Hãy chỉ chạm khi ô phát sáng!'); draw(); }
  function miss() { lives--; lit = -1; nextAt = performance.now() + 450; if (!lives) finish(false); else { ui.status('Lỡ nhịp! Chờ ô tiếp theo sáng rồi chạm.'); draw(); } }
  cells.forEach((cell, i) => { cell.onclick = () => {
    if (!active) return;
    if (lit !== i || performance.now() > deadline) { miss(); return; }
    const remaining = Math.max(0, deadline - performance.now()); hits++; ui.add(100 + Math.floor(remaining / 20)); lit = -1; nextAt = performance.now() + 450; ui.status('Đúng nhịp! Hít thở và đợi tia sáng tiếp theo.');
    if (hits === 12) { ui.add(lives * 100); finish(true); } else draw();
  }; });
  function reset() { document.body.classList.remove('playing'); active = false; lit = -1; hits = 0; lives = 3; ui.reset(); ui.status('Nhấn Bắt đầu. Một ô bất kỳ sẽ sáng sau khoảng chờ ngắn.'); document.querySelector('#start').disabled = false; document.querySelector('#time').textContent = '—'; draw(); }
  document.querySelector('#start').onclick = () => { reset(); active = true; document.body.classList.add('playing'); window.scrollTo(0,0); nextAt = performance.now() + 800; document.querySelector('#start').disabled = true; ui.status('Sẵn sàng… chỉ chạm ô có chữ CHẠM.'); draw(); };
  document.querySelector('#restart').onclick = reset;
  setInterval(() => { if (!active) return; const now = performance.now(); if (lit < 0 && now >= nextAt) { lit = Math.floor(Math.random() * 9); deadline = now + Math.max(650, 1500 - hits * 60); draw(); } else if (lit >= 0 && now > deadline) miss(); document.querySelector('#time').textContent = lit < 0 ? 'Chờ' : `${Math.max(0, Math.ceil((deadline - now) / 100)) / 10}s`; }, 40);
  reset();
}

function ecology(ui) {
  const items = [
    ['🍌','Vỏ chuối','organic','Vỏ trái cây dễ phân hủy, có thể ủ làm phân hữu cơ.'],
    ['🥫','Lon nhôm đã rửa','recycle','Lon nhôm sạch có thể thu gom để tái chế.'],
    ['🔋','Pin đã dùng','hazard','Pin chứa chất có hại; mang tới điểm thu gom chuyên dụng.'],
    ['🧻','Khăn giấy bẩn','other','Khăn giấy bẩn khó tái chế, bỏ vào rác còn lại.'],
    ['🥬','Lá rau héo','organic','Lá rau là chất hữu cơ, phù hợp để ủ phân.'],
    ['📦','Thùng giấy sạch','recycle','Giấy khô sạch có thể tái chế; gấp gọn trước khi bỏ.'],
    ['💡','Bóng đèn huỳnh quang','hazard','Đèn huỳnh quang cần điểm thu gom riêng vì có thủy ngân.'],
    ['🍽️','Mảnh sành vỡ','other','Sành không tái chế cùng thủy tinh; bọc kỹ để tránh gây thương tích.'],
    ['🍎','Lõi táo','organic','Lõi táo phân hủy được và có thể dùng để ủ phân.'],
    ['🧴','Chai nhựa sạch','recycle','Chai nhựa sạch, khô được thu gom theo hướng dẫn địa phương.'],
    ['🧪','Chai thuốc trừ sâu','hazard','Bao bì hóa chất phải được thu gom riêng, không tái sử dụng.'],
    ['🩹','Băng cá nhân đã dùng','other','Rác vệ sinh sinh hoạt cần gói kín trong rác còn lại.'],
  ];
  const names = {organic:'Hữu cơ',recycle:'Tái chế',hazard:'Nguy hại',other:'Còn lại'};
  let deck, index, lives, locked, ended;
  const bins = [...document.querySelectorAll('[data-bin]')];
  function render() {
    document.querySelector('#count').textContent = `${Math.min(index + 1, deck.length)}/${deck.length}`;
    document.querySelector('#lives').textContent = lives;
    document.querySelector('#item-emoji').textContent = ended ? '🌍' : deck[index][0];
    document.querySelector('#item-name').textContent = ended ? 'Ca phân loại đã kết thúc' : deck[index][1];
    bins.forEach(button => { button.disabled = locked || ended; });
    document.querySelector('#next').hidden = !locked || ended;
  }
  bins.forEach(button => { button.onclick = () => {
    if (locked || ended) return;
    locked = true; const item = deck[index], correct = button.dataset.bin === item[2];
    if (correct) ui.add(100); else lives--;
    ui.status(`${correct ? 'Chính xác!' : 'Chưa đúng: chọn thùng ' + names[item[2]] + '.'} ${item[3]}`);
    if (!lives) { ended = true; ui.status(`Hết 3 cơ hội. ${item[1]} cần thùng ${names[item[2]]}. ${item[3]} Chơi lại để luyện tiếp!`); }
    else if (index === deck.length - 1) { ended = true; ui.add(lives * 100); ui.status(`Hoàn thành ca phân loại! ${item[3]} Bạn còn ${lives} cơ hội.`); }
    render();
  }; });
  document.querySelector('#next').onclick = () => { if (!locked || ended) return; index++; locked = false; ui.status('Chọn thùng phù hợp cho vật tiếp theo.'); render(); };
  function reset() { deck = items.slice(); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } index = 0; lives = 3; locked = false; ended = false; ui.reset(); ui.status('Gợi ý thực hành phổ biến; khi thu gom thực tế, làm theo hướng dẫn địa phương.'); render(); }
  document.querySelector('#restart').onclick = reset; reset();
}

function pipes(ui) {
  // N/E/S/W bits. A fixed winding solution guarantees every shuffle is solvable.
  const solution = [10,10,12,6,6,10,9,5,3,10,12,5,10,10,3,10];
  const glyph = {3:'└',5:'│',6:'┌',9:'┘',10:'─',12:'┐'};
  const directions = [[-1,0,1,4],[0,1,2,8],[1,0,4,1],[0,-1,8,2]];
  let board, moves, ended, credited;
  const grid = document.querySelector('#pipes');
  function connected() {
    const seen = new Set(); if (!(board[0] & 8)) return seen;
    const queue = [0]; seen.add(0);
    while (queue.length) { const cell = queue.shift(); const row = Math.floor(cell / 4), col = cell % 4;
      for (const [dr,dc,bit,other] of directions) { const r = row + dr, c = col + dc, next = r * 4 + c; if (r >= 0 && r < 4 && c >= 0 && c < 4 && (board[cell] & bit) && (board[next] & other) && !seen.has(next)) { seen.add(next); queue.push(next); } }
    } return seen;
  }
  function draw() {
    const wet = connected(); document.querySelector('#moves').textContent = `${moves}/40`; document.querySelector('#flow').textContent = wet.size; grid.replaceChildren();
    board.forEach((mask, i) => { const button = document.createElement('button'); button.className = `pipe${wet.has(i) ? ' wet' : ''}`; button.textContent = glyph[mask]; button.dataset.cell = i; button.dataset.mask = mask; button.setAttribute('aria-label', `Ống hàng ${Math.floor(i / 4) + 1} cột ${i % 4 + 1}, nối ${directions.filter(d => mask & d[2]).map(d => ({1:'trên',2:'phải',4:'dưới',8:'trái'})[d[2]]).join(' và ')}`); button.disabled = ended;
      button.onclick = () => { if (ended) return; board[i] = ((board[i] << 1) & 15) | (board[i] >> 3); moves++; evaluate(); }; grid.append(button);
    });
  }
  function evaluate() {
    const wet = connected();
    if (wet.size > credited) { ui.add((wet.size - credited) * 20); credited = wet.size; }
    if (wet.has(15) && (board[15] & 2)) { ended = true; ui.add(500 + (40 - moves) * 10); ui.status('Nước đã tới đích! Xưởng đường ống vận hành thành công.'); }
    else if (moves >= 40) { ended = true; ui.status('Hết 40 lượt xoay. Bắt đầu lại và lần đường từ nguồn nước.'); }
    else ui.status(`Đã nối ${wet.size} ô với nguồn. Cần dẫn nước tới cạnh phải ô cuối.`);
    draw();
  }
  function reset() { board = solution.map((mask, i) => { const turns = (i % 3) + 1; for (let t = 0; t < turns; t++) mask = ((mask << 1) & 15) | (mask >> 3); return mask; }); moves = 0; ended = false; credited = 0; ui.reset(); ui.status('Nguồn ở cạnh trái ô đầu. Xoay từng ống để nước ra cạnh phải ô cuối.'); draw(); }
  document.querySelector('#restart').onclick = reset; reset();
}

function logic(ui) {
  const colors = ['Đỏ','Vàng','Xanh','Tím']; const symbols = ['●','◆','▲','★'];
  let secret, guess, turn, ended, bestExact;
  const slots = [...document.querySelectorAll('[data-slot]')];
  function draw() { slots.forEach((button,i) => { button.dataset.color = guess[i]; button.textContent = `${symbols[guess[i]]} ${colors[guess[i]]}`; button.setAttribute('aria-label', `Vị trí ${i + 1}: ${colors[guess[i]]}, nhấn đổi màu`); button.disabled = ended; }); document.querySelector('#attempt').textContent = `${Math.min(turn + 1, 8)}/8`; document.querySelector('#guess').disabled = ended; }
  slots.forEach((button,i) => { button.onclick = () => { if (ended) return; guess[i] = (guess[i] + 1) % 4; draw(); }; });
  document.querySelector('#guess').onclick = () => {
    if (ended) return;
    let exact = 0; const left = [0,0,0,0], right = [0,0,0,0];
    guess.forEach((color,i) => { if (color === secret[i]) exact++; else { left[color]++; right[secret[i]]++; } });
    const misplaced = left.reduce((total,count,i) => total + Math.min(count,right[i]),0);
    turn++; if (exact > bestExact) { ui.add((exact - bestExact) * 100); bestExact = exact; }
    const row = document.createElement('li'); row.textContent = `${turn}. ${guess.map(c => symbols[c] + ' ' + colors[c]).join(' · ')} → ${exact} đúng chỗ, ${misplaced} đúng màu sai chỗ`; document.querySelector('#history').append(row);
    if (exact === 4) { ended = true; ui.add(400 + (8 - turn) * 100); ui.status('Mở khóa thành công! Bạn đã tìm đúng cả bốn vị trí.'); }
    else if (turn === 8) { ended = true; ui.status(`Hết lượt! Mật mã là ${secret.map(c => colors[c]).join(' · ')}. Thử một ván suy luận mới nhé.`); }
    else ui.status(`${exact} đúng chỗ; ${misplaced} đúng màu sai chỗ. Mỗi viên màu chỉ được tính một lần.`);
    draw();
  };
  function reset() { secret = Array.from({length:4}, () => Math.floor(Math.random() * 4)); guess = [0,0,0,0]; turn = 0; ended = false; bestExact = 0; document.querySelector('#history').replaceChildren(); ui.reset(); ui.status('Mật mã có thể lặp màu. Chạm từng vị trí để đổi màu, rồi gửi dự đoán.'); draw(); }
  document.querySelector('#restart').onclick = reset; reset();
}

export const gamesB = [
  game('strategy', 'Vườn Cờ Chiến Thuật', 'Chiến thuật theo lượt', 'Giữ vườn qua 6 đợt sâu. Dùng nắng trồng lính cho từng luống hoặc hồi lá chắn. Mỗi lính chặn 1 sâu mỗi đợt; sâu lọt qua làm mất 1 lá chắn. Nhận 5 nắng sau mỗi đợt.', '<div class="stats"><span>Đợt <b id="turn"></b></span><span>☀ <b id="sun"></b></span><span>🛡 <b id="health"></b>/10</span></div><div id="lanes"></div><div class="actions"><button id="advance">Cho sâu tiến vào</button><button id="repair">Chăm vườn +3 🛡 · 3 ☀</button></div>', '--bg:#f3f4df;--ink:#203c2b;--panel:#e0e8be;--accent:#356846;--btn:#fff', '#lanes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.lane{background:var(--panel);padding:15px;border-radius:20px;border-bottom:6px solid #8ba46a}.lane h2{font-size:20px}.lane button{width:100%;font-size:14px}@media(max-width:560px){#lanes{grid-template-columns:1fr}.lane{padding:10px}.lane h2,.lane p{margin:6px 0}}', strategy, [0,60,140,240,400,580,900,1200,1440], [65,240]),
  game('reflex', 'Nhịp Chớp Neon', 'Phản xạ & nhịp độ', 'Chạm đúng ô phát sáng 12 lần để hoàn thành. Càng nhanh càng nhiều điểm. Chạm sai hoặc bỏ lỡ mất một trong 3 cơ hội. Ô sáng ngắn dần theo tiến độ; dùng chuột hoặc chạm màn hình.', '<div class="stats"><span>Nhịp <b id="hits">0/12</b></span><span>Cơ hội <b id="lives">3</b></span><span>Cửa sổ <b id="time">—</b></span></div><div id="pads">'+Array.from({length:9},(_,i)=>`<button data-pad="${i}">${i+1}</button>`).join('')+'</div><button id="start">Bắt đầu</button>', '--bg:#111028;--ink:#f2eaff;--panel:#242043;--accent:#ad80ff;--btn:#160c2f', '#pads{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:450px;margin:18px auto}#pads button{aspect-ratio:1;background:#28233f;color:#b3a5d5;font-size:clamp(20px,5vw,30px);border-color:#51476b;opacity:1}#pads .lit{background:#66ffe1;color:#072c25;box-shadow:0 0 22px #66ffe177;border-color:#bafff2}#start{display:block;margin:18px auto}@media(max-height:500px){body.playing main{padding:8px}body.playing .eyebrow,body.playing h1,body.playing main>p:not(#status),body.playing main>.stats:nth-of-type(2),body.playing #start{display:none}body.playing #pads{max-width:210px;gap:6px;margin:6px auto}body.playing .stats{padding:0;justify-content:center}body.playing .stats span{font-size:12px;padding:5px}body.playing #status{font-size:12px;min-height:30px;margin:5px 0}body.playing #restart{min-height:40px;padding:6px 12px}}', reflex, [100,220,375,540,760,980,1320,1560,1740,1880], [8,40]),
  game('ecology', 'Phân Loại Xanh', 'Môi trường & giáo dục', 'Đưa 12 vật vào đúng thùng. Mỗi câu đúng được 100 điểm; sai 3 lần thì ca phân loại kết thúc. Đọc giải thích sau mỗi vật rồi nhấn Tiếp theo. Hoàn thành được thưởng theo số cơ hội còn lại.', '<div class="stats"><span>Vật <b id="count"></b></span><span>Cơ hội <b id="lives"></b></span></div><section class="panel item"><div id="item-emoji"></div><h2 id="item-name"></h2></section><div id="bins"><button data-bin="organic">🌿 Hữu cơ</button><button data-bin="recycle">♻ Tái chế</button><button data-bin="hazard">⚠ Nguy hại</button><button data-bin="other">▣ Còn lại</button></div><button id="next" hidden>Tiếp theo</button>', '--bg:#edf8f4;--ink:#144d48;--panel:#d5ece4;--accent:#087e73;--btn:#fff', '.item{text-align:center}#item-emoji{font-size:72px}.item h2{margin:8px}#bins{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}#bins [data-bin="hazard"]{background:#82520c}#bins [data-bin="other"]{background:#58606a}#bins [data-bin="recycle"]{background:#2466a6}#next{margin-top:16px}', ecology, [0,100,300,500,700,900,1100,1300,1500], [40,180]),
  game('pipes', 'Xưởng Ghép Đường', 'Giải đố không gian', 'Chạm một ống để xoay 90° theo chiều kim đồng hồ. Nối nguồn ở cạnh trái ô đầu với cửa ra cạnh phải ô cuối trong 40 lượt. Ống có nước chuyển xanh; điểm thưởng cho đường dài và số lượt còn lại.', '<div class="stats"><span>Lượt xoay <b id="moves"></b></span><span>Ống có nước <b id="flow"></b></span></div><section class="panel"><p class="source">Nguồn nước → ô trên trái</p><div id="pipes" aria-label="Lưới đường ống 4 nhân 4"></div><p class="sink">Ô dưới phải → Cửa ra</p></section>', '--bg:#fff4e5;--ink:#513527;--panel:#f3ddbd;--accent:#aa592e;--btn:#fff', '#pipes{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;max-width:440px;margin:auto}.pipe{aspect-ratio:1;padding:0;background:#fff8ed;color:#9d7356;font-family:monospace;font-size:clamp(42px,10vw,76px);line-height:1;border:2px solid #d7b18d;border-radius:8px;opacity:1!important}.pipe.wet{color:#087ea1;background:#d3f0f5;border-color:#3fb8d0}.source{color:#08647e}.sink{text-align:right}', pipes, [20,40,80,120,160,200,820,880,920], [45,240]),
  game('logic', 'Mật Mã Bốn Màu', 'Suy luận logic', 'Tìm mật mã gồm 4 vị trí với 4 màu trong 8 lượt; màu được phép lặp. Chạm mỗi vị trí để đổi màu. Phản hồi cho biết số màu đúng vị trí và đúng màu sai vị trí. Điểm tăng khi kỷ lục số vị trí đúng của ván tăng.', '<div class="stats"><span>Lượt <b id="attempt"></b></span></div><div class="panel"><div id="slots">'+Array.from({length:4},(_,i)=>`<button data-slot="${i}"></button>`).join('')+'</div><button id="guess">Thử mật mã</button></div><ol id="history" aria-label="Lịch sử suy luận"></ol>', '--bg:#f0edfa;--ink:#362854;--panel:#e1daf2;--accent:#684aa1;--btn:#fff', '#slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:15px}#slots button{padding:15px 4px;min-height:66px;font-size:16px;border-color:#fff}#slots [data-color="0"]{background:#ad294a}#slots [data-color="1"]{background:#f3c754;color:#4c3b03}#slots [data-color="2"]{background:#166b88}#slots [data-color="3"]{background:#74419d}#history{padding:0;list-style:none}#history li{padding:12px;background:#fff9;border-radius:10px;margin:8px 0;font-size:14px;line-height:1.5}', logic, [0,100,200,300,800,900,1000,1100,1200,1300], [60,360]),
];
