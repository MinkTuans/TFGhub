// Self-contained CODE games. Browser functions are serialized, never evaluated by the seed.
const baseCss = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--bg);color:var(--ink);min-height:100vh}main{max-width:820px;height:100dvh;overflow-y:auto;overscroll-behavior:contain;margin:auto;padding:24px 18px}header{display:flex;align-items:center;justify-content:space-between;gap:14px}h1{font-size:clamp(24px,5vw,38px);margin:8px 0}p{line-height:1.55}.eyebrow{letter-spacing:.18em;font-size:11px;font-weight:800;text-transform:uppercase}.stats{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.stat{border:1px solid var(--line);border-radius:14px;padding:10px 16px;background:var(--panel)}button,input{font:inherit}button{cursor:pointer;min-height:46px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);padding:11px 15px;font-weight:700;touch-action:manipulation}button:hover:enabled{filter:brightness(.95);transform:translateY(-1px)}button:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:3px}button:disabled{cursor:default;opacity:.62}.primary{background:var(--accent);color:var(--onAccent);border-color:transparent}.panel{background:var(--panel);border:1px solid var(--line);padding:22px;border-radius:22px}#status{min-height:54px;padding:14px 0;font-weight:650}#board{margin-top:18px}.grid{display:grid;gap:10px}.big{font-size:34px}.muted{opacity:.7}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}@media(max-width:480px){main{padding:16px 12px}.panel{padding:16px}.stat{padding:8px 10px}header{align-items:flex-start}button{padding:10px}}`;
function runtime(play) {
  const $ = (id) => document.getElementById(id);
  let score = 0;
  const api = {
    $, score: () => score,
    add(points) { score += points; $('score').textContent = score; parent.postMessage({ type: 'tfg:score', score }, '*'); },
    reset() { score = 0; $('score').textContent = '0'; $('board').dataset.state = 'playing'; },
    say(text) { $('status').textContent = text; },
    end(won, text) { $('board').dataset.state = won ? 'won' : 'lost'; $('status').textContent = text; },
    shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; },
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.type !== 'tfg:score-state') return;
    const best = event.data.personalBest;
    if (Number.isInteger(best) && best >= 0 && best <= 2147483647) $('best').textContent = String(best);
  });
  parent.postMessage({ type: 'tfg:score-ready' }, '*');
  play(api);
}
function game(key, title, genre, instructions, palette, css, play) {
  return { key, title, genre, instructions, project: {
    sourceType: 'CODE',
    html: `<main><div class="stats"><div class="stat">Điểm <strong id="score">0</strong></div><div class="stat">Kỷ lục của bạn <strong id="best">—</strong></div><div class="stat" id="meter"></div></div><section id="board" aria-label="Bàn chơi" data-state="playing"></section><div id="status" role="status" aria-live="polite"></div><button id="restart" aria-label="Chơi lại">↻ Chơi lại</button></main>`,
    css: `:root{${palette}}${baseCss}${css}`,
    javascript: `(${runtime.toString()})(${play.toString()});`,
  } };
}

function memory(a) {
  const symbols = ['🏮', '🪷', '🛵', '🍜', '🫖', '🧺'];
  let cards, open, matched, attempts, locked;
  function draw() {
    a.$('meter').textContent = `${matched.size / 2}/6 đôi · ${16 - attempts} lượt còn lại`;
    a.$('board').innerHTML = '<div class="grid cards">' + cards.map((symbol, i) => `<button class="card ${matched.has(i) ? 'matched' : ''}" data-card="${i}" aria-label="${open.includes(i) || matched.has(i) ? symbol : 'Lật thẻ ' + (i + 1)}" ${matched.has(i) || locked ? 'disabled' : ''}>${open.includes(i) || matched.has(i) ? symbol : '<span>✦</span>'}</button>`).join('') + '</div>';
    a.$('board').querySelectorAll('[data-card]').forEach(button => button.onclick = () => flip(Number(button.dataset.card)));
  }
  function flip(i) {
    if (locked || matched.has(i) || open.includes(i)) return;
    if (open.length === 2) open = [];
    open.push(i);
    if (open.length === 2) {
      attempts++;
      if (cards[open[0]] === cards[open[1]]) {
        open.forEach(index => matched.add(index)); open = []; a.add(100); a.say('Một góc phố đã sáng đèn!');
        if (matched.size === 12) { locked = true; a.add((16 - attempts) * 20); a.end(true, 'Phố cổ lên đèn! Bạn đã tìm đủ sáu đôi.'); }
      } else a.say('Chưa trùng nhau. Ghi nhớ vị trí rồi chọn thẻ tiếp theo.');
      if (attempts === 16 && matched.size < 12) { locked = true; a.end(false, 'Hết lượt — chơi lại để thắp sáng cả khu phố!'); }
    }
    draw();
  }
  function reset() { a.reset(); cards = a.shuffle([...symbols, ...symbols]); open = []; matched = new Set(); attempts = 0; locked = false; a.say('Chọn hai thẻ để tìm một đôi giống nhau.'); draw(); }
  a.$('restart').onclick = reset; reset();
}
function arithmetic(a) {
  let round, mistakes, answer, stopped;
  function next() {
    const left = 3 + Math.floor(Math.random() * 10), right = 2 + Math.floor(Math.random() * 8);
    const op = round % 3;
    answer = op === 0 ? left + right : op === 1 ? left * right : left + right - right;
    const equation = op === 0 ? `${left} + ${right}` : op === 1 ? `${left} × ${right}` : `${left + right} − ${right}`;
    a.$('meter').textContent = `Ga ${round + 1}/8 · ${3 - mistakes} vé sửa sai`;
    a.$('board').innerHTML = `<div class="rail">🚂 ${Array.from({length:8}, (_, i) => `<span class="wagon ${i < round ? 'delivered' : ''}">${i < round ? '✓' : i + 1}</span>`).join('')}</div><form id="answer-form" class="panel"><div class="eyebrow">Đơn hàng của trưởng ga</div><h2 class="big" id="equation">${equation} = ?</h2><label for="answer">Nhập số kiện hàng cần chuyển</label><div class="actions"><input id="answer" type="number" inputmode="numeric" min="0" max="999" required autocomplete="off"><button class="primary" type="submit">Giao hàng →</button></div></form>`;
    a.$('answer-form').onsubmit = event => {
      event.preventDefault(); if (stopped) return;
      if (Number(a.$('answer').value) === answer) {
        round++; a.add(120); a.say('Đúng rồi! Đoàn tàu tiếp tục hành trình.');
        if (round === 8) { stopped = true; a.add((3 - mistakes) * 50); a.end(true, 'Đã giao đủ 8 chuyến hàng. Chúc mừng trưởng tàu!'); a.$('meter').textContent = '8/8 ga hoàn tất'; a.$('answer-form').querySelectorAll('input,button').forEach(el => el.disabled = true); }
        else { next(); a.$('answer').focus(); }
      } else { mistakes++; a.say('Số kiện chưa đúng. Thử tính lại nhé!'); a.$('meter').textContent = `Ga ${round + 1}/8 · ${3 - mistakes} vé sửa sai`; if (mistakes === 3) { stopped = true; a.end(false, `Hết vé sửa sai. Đáp án là ${answer}. Hãy thử chuyến tàu mới!`); a.$('answer-form').querySelectorAll('input,button').forEach(el => el.disabled = true); } }
    };
  }
  function reset() { a.reset(); round = 0; mistakes = 0; stopped = false; a.say('Không giới hạn thời gian. Tính chắc trước khi giao hàng!'); next(); }
  a.$('restart').onclick = reset; reset();
}
function english(a) {
  const goods = [{en:'apple',vi:'Táo',icon:'🍎'}, {en:'bread',vi:'Bánh mì',icon:'🍞'}, {en:'milk',vi:'Sữa',icon:'🥛'}, {en:'egg',vi:'Trứng',icon:'🥚'}, {en:'carrot',vi:'Cà rốt',icon:'🥕'}, {en:'fish',vi:'Cá',icon:'🐟'}, {en:'banana',vi:'Chuối',icon:'🍌'}, {en:'cheese',vi:'Phô mai',icon:'🧀'}, {en:'rice',vi:'Gạo',icon:'🍚'}];
  let round, lives, list, basket, stopped;
  function draw() {
    a.$('meter').textContent = `Khách ${round + 1}/3 · ${lives} lượt đổi giỏ`;
    a.$('board').innerHTML = `<div class="panel receipt"><div class="eyebrow">Shopping list · Danh sách của khách</div><h2>${list.map(item => item.en).join(' · ')}</h2><p>Giỏ hàng: <strong id="basket-count">${basket.size}/3</strong></p></div><div class="grid shelves">${goods.map((item, i) => `<button data-good="${i}" aria-pressed="${basket.has(i)}" ${stopped ? 'disabled' : ''}><span class="big">${item.icon}</span><br>${item.vi}${basket.has(i) ? ' ✓' : ''}</button>`).join('')}</div><button id="checkout" class="primary" ${stopped ? 'disabled' : ''}>Thanh toán giỏ hàng</button>`;
    a.$('board').querySelectorAll('[data-good]').forEach(button => button.onclick = () => { const i = Number(button.dataset.good); if (basket.has(i)) basket.delete(i); else if (basket.size < 3) basket.add(i); else a.say('Giỏ có ba ngăn. Bỏ một món trước khi chọn món khác.'); draw(); });
    a.$('checkout').onclick = () => {
      if (stopped) return;
      if (basket.size !== 3) { a.say('Hãy chọn đủ ba món trước khi thanh toán.'); return; }
      if ([...basket].every(i => list.includes(goods[i]))) {
        a.add(250); round++;
        if (round === 3) { stopped = true; a.add(lives * 40); round = 2; a.end(true, 'Excellent! Bạn đã phục vụ đủ ba khách hàng.'); draw(); a.$('meter').textContent = '3/3 khách hài lòng'; }
        else { list = a.shuffle(goods).slice(0, 3); basket = new Set(); a.say('Perfect basket! Khách tiếp theo đã đến.'); draw(); }
      } else { lives--; if (!lives) { stopped = true; a.end(false, 'Hết lượt đổi giỏ. Chơi lại và học thêm từ mới nhé!'); } else a.say('Có món chưa đúng danh sách tiếng Anh. Hãy đổi món trong giỏ.'); draw(); }
    };
  }
  function reset() { a.reset(); round = 0; lives = 3; basket = new Set(); stopped = false; list = a.shuffle(goods).slice(0, 3); a.say('Đọc danh sách tiếng Anh, chọn ba món trên kệ rồi thanh toán.'); draw(); }
  a.$('restart').onclick = reset; reset();
}
function trivia(a) {
  const questions = [
    ['Thủ đô của Việt Nam là thành phố nào?', ['Hà Nội','Huế','Đà Nẵng','Cần Thơ'], 0, 'Hà Nội là thủ đô của Việt Nam.'],
    ['Vịnh Hạ Long nằm ở tỉnh nào?', ['Quảng Ninh','Quảng Nam','Khánh Hòa','Bình Định'], 0, 'Vịnh Hạ Long nằm ở tỉnh Quảng Ninh.'],
    ['Ngày Quốc khánh Việt Nam là ngày nào?', ['2/9','30/4','1/5','20/11'], 0, 'Ngày 2 tháng 9 là Quốc khánh Việt Nam.'],
    ['Nhạc sĩ nào sáng tác Tiến quân ca?', ['Văn Cao','Trịnh Công Sơn','Phạm Tuyên','Hoàng Vân'], 0, 'Văn Cao sáng tác Tiến quân ca vào năm 1944.'],
    ['Phố cổ Hội An nằm bên dòng sông nào?', ['Sông Hoài','Sông Hương','Sông Hàn','Sông Đà'], 0, 'Sông Hoài chảy qua khu phố cổ Hội An.'],
    ['Bánh chưng truyền thống thường có hình gì?', ['Hình vuông','Hình tròn','Hình tam giác','Hình trụ'], 0, 'Bánh chưng có hình vuông; bánh tét thường có hình trụ.'],
    ['Đỉnh núi cao nhất Việt Nam là đỉnh nào?', ['Fansipan','Bà Đen','Bạch Mã','Langbiang'], 0, 'Fansipan thuộc dãy Hoàng Liên Sơn.'],
    ['Nhã nhạc cung đình gắn với cố đô nào?', ['Huế','Hoa Lư','Cổ Loa','Hội An'], 0, 'Nhã nhạc cung đình Huế là di sản văn hóa phi vật thể.'],
  ];
  let queue, round, lives, answered, stopped;
  function draw() {
    const q = queue[round]; answered = false;
    a.$('meter').textContent = `Câu ${round + 1}/8 · ${lives} trái tim`;
    const choices = a.shuffle(q[1].map((text, i) => ({text, correct: i === q[2]})));
    a.$('board').innerHTML = `<div class="panel"><div class="eyebrow">Dọc miền đất nước · ${round + 1}/8</div><h2>${q[0]}</h2><div class="grid choices">${choices.map((choice, i) => `<button data-choice="${i}">${choice.text}</button>`).join('')}</div><button id="next" class="primary" hidden>Tiếp tục →</button></div>`;
    a.$('board').querySelectorAll('[data-choice]').forEach(button => button.onclick = () => {
      if (answered || stopped) return; answered = true;
      const correct = choices[Number(button.dataset.choice)].correct;
      if (correct) a.add(125); else lives--;
      a.$('board').querySelectorAll('[data-choice]').forEach((el, i) => { el.disabled = true; if (choices[i].correct) el.classList.add('correct'); });
      a.$('meter').textContent = `Câu ${round + 1}/8 · ${lives} trái tim`;
      a.say(`${correct ? 'Chính xác!' : 'Chưa đúng.'} ${q[3]}`);
      if (lives === 0) { stopped = true; a.end(false, `Hết trái tim. ${q[3]} Hãy bắt đầu hành trình mới!`); }
      else if (round === 7) { stopped = true; a.add(lives * 50); a.end(true, `Hoàn thành hành trình! ${q[3]}`); }
      else a.$('next').hidden = false;
    });
    a.$('next').onclick = () => { round++; draw(); a.say('Tiếp tục khám phá Việt Nam!'); };
  }
  function reset() { a.reset(); queue = a.shuffle(questions); round = 0; lives = 3; stopped = false; a.say('Mỗi đáp án đúng là một dấu ấn trên hành trình.'); draw(); }
  a.$('restart').onclick = reset; reset();
}
function adventure(a) {
  // Coordinates: x grows east, y grows south. All required items have a safe route.
  const map = ['.....', '.##.#', '...#.', '.#...', '.....'];
  const locations = { '0,4': ['🗝️','chìa khóa'], '4,4': ['🔋','pin'], '2,2': ['📜','bản đồ'], '4,0': ['🗼','hải đăng'] };
  let x, y, air, inventory, visited, stopped;
  const key = () => `${x},${y}`;
  function draw() {
    a.$('meter').textContent = `Năng lượng ${air}/36 · ${inventory.has('chìa khóa') ? '🗝️' : '—'} ${inventory.has('pin') ? '🔋' : '—'} ${inventory.has('bản đồ') ? '📜' : '—'}`;
    a.$('board').innerHTML = `<div class="panel"><div class="island grid" aria-label="Bản đồ đảo">${map.flatMap((row, yy) => [...row].map((tile, xx) => { const pos = `${xx},${yy}`, landmark = locations[pos]; return `<div class="tile ${tile === '#' ? 'rock' : ''} ${visited.has(pos) ? 'visited' : ''}" data-cell="${pos}" ${x === xx && y === yy ? 'aria-current="location"' : ''} aria-label="${x === xx && y === yy ? 'Bạn đang ở đây' : tile === '#' ? 'Đá chắn' : landmark && !inventory.has(landmark[1]) ? landmark[1] : 'Đường đi'}">${x === xx && y === yy ? '🧭' : tile === '#' ? '⛰️' : landmark && !inventory.has(landmark[1]) ? landmark[0] : visited.has(pos) ? '·' : ''}</div>`; })).join('')}</div><p class="muted">🗝️ Mở cửa · 🔋 Cấp điện · 📜 +100 điểm. Đá núi không thể đi qua.</p><div class="dpad"><button data-move="0,-1" aria-label="Đi lên" ${stopped ? 'disabled' : ''}>↑</button><button data-move="-1,0" aria-label="Đi trái" ${stopped ? 'disabled' : ''}>←</button><button data-move="0,1" aria-label="Đi xuống" ${stopped ? 'disabled' : ''}>↓</button><button data-move="1,0" aria-label="Đi phải" ${stopped ? 'disabled' : ''}>→</button></div></div>`;
    a.$('board').querySelectorAll('[data-move]').forEach(button => button.onclick = () => move(...button.dataset.move.split(',').map(Number)));
  }
  function move(dx, dy) {
    if (stopped) return;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx > 4 || ny < 0 || ny > 4 || map[ny][nx] === '#') { a.say('Đường bị chắn. Chọn hướng khác — không mất năng lượng.'); return; }
    x = nx; y = ny; air--; const pos = key();
    if (!visited.has(pos)) { visited.add(pos); a.add(10); }
    const landmark = locations[pos];
    a.say('Gió biển thổi mạnh. Tiếp tục tìm vật dụng để bật hải đăng.');
    if (landmark && landmark[1] !== 'hải đăng' && !inventory.has(landmark[1])) { inventory.add(landmark[1]); a.add(100); a.say(`Đã nhặt ${landmark[1]}! Vật dụng được giữ trong túi.`); }
    if (pos === '4,0') {
      if (inventory.has('chìa khóa') && inventory.has('pin')) { stopped = true; a.add(300 + air * 15); a.end(true, 'Hải đăng đã sáng! Những con thuyền có thể trở về bến.'); }
      else a.say('Cửa hải đăng cần chìa khóa và pin. Tìm cả hai trên đảo!');
    }
    if (air === 0 && !stopped) { stopped = true; a.end(false, 'Hết năng lượng. Đội cứu hộ đã đưa bạn về bến — thử tuyến đường ngắn hơn!'); }
    draw();
  }
  document.addEventListener('keydown', event => {
    const moves = {ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0], w:[0,-1], s:[0,1], a:[-1,0], d:[1,0]};
    if (moves[event.key]) { event.preventDefault(); move(...moves[event.key]); }
  });
  function reset() { a.reset(); x = 0; y = 0; air = 36; inventory = new Set(); visited = new Set(['0,0']); stopped = false; a.say('Bạn cập bến phía tây bắc. Tìm chìa khóa, pin rồi đến ngọn hải đăng.'); draw(); }
  a.$('restart').onclick = reset; reset();
}

export const gamesA = [
  game('memory', 'Lật Thẻ Phố Cổ', 'Trí nhớ', 'Lật hai thẻ mỗi lượt, ghép đủ 6 đôi trong 16 lượt. Thẻ sai giữ mở để bạn ghi nhớ; chọn thẻ tiếp theo để tiếp tục.', '--bg:#fff5df;--ink:#512f27;--panel:#fffdf5;--line:#dec7a1;--accent:#ad4734;--onAccent:white', '.cards{grid-template-columns:repeat(4,1fr)}.card{height:105px;font-size:38px;background:#8c382e;color:#f5d6a0;border:3px solid #bf7c50;box-shadow:0 5px 0 #d7b790}.card.matched{background:#f5e5ab;opacity:1}.card span{font-size:32px}@media(max-width:480px){.card{height:83px;font-size:30px}}', memory),
  game('arithmetic', 'Chuyến Tàu Tính Nhẩm', 'Toán học', 'Nhập đáp án để giao hàng qua 8 ga. Bạn có 3 vé sửa sai. Phép cộng, trừ và nhân thay phiên nhau, không giới hạn thời gian.', '--bg:#eaf3ff;--ink:#18355a;--panel:#fff;--line:#b6cde8;--accent:#2369bf;--onAccent:white', '.rail{display:flex;align-items:center;gap:6px;margin:22px 0;font-size:30px}.wagon{flex:1;text-align:center;padding:9px 2px;background:#d4e5f8;border-bottom:5px solid #244d7c;font-size:16px;border-radius:7px}.delivered{background:#a6deba}input{width:130px;min-height:48px;border:2px solid #b6cde8;border-radius:10px;padding:10px}.big{letter-spacing:.05em}', arithmetic),
  game('english', 'English Market', 'Tiếng Anh', 'Đọc danh sách mua sắm tiếng Anh, chọn đúng ba món trên kệ rồi thanh toán. Nhấn lại để bỏ món. Phục vụ 3 khách trước khi hết lượt đổi giỏ.', '--bg:#f0f8e9;--ink:#24452d;--panel:#fffef4;--line:#c5d9b4;--accent:#397e42;--onAccent:white', '.receipt{border-top:6px solid #e5af46}.shelves{grid-template-columns:repeat(3,1fr);margin:16px 0}.shelves button{min-height:100px}.shelves [aria-pressed=true]{background:#d6ecc3;border:2px solid #397e42}#checkout{width:100%}', english),
  game('trivia', 'Việt Nam Trong Tôi', 'Kiến thức', 'Khám phá 8 câu hỏi về địa lý và văn hóa Việt Nam. Bạn có 3 trái tim; đọc lời giải rồi nhấn Tiếp tục. Mỗi đáp án đúng ghi thêm điểm.', '--bg:#fff0ed;--ink:#572638;--panel:#fffaf6;--line:#e5bec2;--accent:#ad3150;--onAccent:white', '.choices{grid-template-columns:1fr 1fr}.choices button{min-height:70px;text-align:left}.choices .correct{background:#d8ebbb;opacity:1;border-color:#669338}#next{margin-top:16px}@media(max-width:420px){.choices{grid-template-columns:1fr}}', trivia),
  game('adventure', 'Hải Đăng Mất Tích', 'Phiêu lưu', 'Dùng phím mũi tên/WASD hoặc nút hướng để khám phá đảo. Nhặt chìa khóa và pin, đến hải đăng trong 36 bước. Bản đồ cổ là phần thưởng tùy chọn.', '--bg:#102d3a;--ink:#e2f3ee;--panel:#183f4d;--line:#34616a;--accent:#f4c66b;--onAccent:#17353e', '.island{grid-template-columns:repeat(5,1fr);gap:5px;max-width:440px;margin:auto}.tile{aspect-ratio:1;display:grid;place-items:center;background:#22525e;border:1px solid #386a70;border-radius:8px;font-size:clamp(23px,6vw,40px)}.tile.visited{background:#317174}.tile.rock{background:#1a343f}.tile[aria-current]{background:#f0c879;border-color:#ffeab6}.dpad{display:grid;grid-template-columns:repeat(3,60px);gap:8px;justify-content:center}.dpad button:first-child{grid-column:2}.dpad button:nth-child(2){grid-column:1}.dpad button{font-size:25px;background:#265765}', adventure),
];

const activity = {
  memory: { scoreSamples: [0, 100, 200, 300, 400, 500, 600, 620, 660, 700, 740, 800], durationSeconds: [45, 160] },
  arithmetic: { scoreSamples: [0, 120, 240, 360, 480, 600, 720, 840, 1010, 1060, 1110], durationSeconds: [35, 150] },
  english: { scoreSamples: [0, 250, 500, 790, 830, 870], durationSeconds: [35, 140] },
  trivia: { scoreSamples: [0, 125, 250, 375, 500, 625, 800, 975, 1150], durationSeconds: [40, 165] },
  adventure: { scoreSamples: [0, 10, 30, 140, 150, 160, 170, 280, 290, 420, 1010], durationSeconds: [45, 180] },
};
for (const definition of gamesA) Object.assign(definition, activity[definition.key]);
