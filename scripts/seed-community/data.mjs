import {createHash} from 'node:crypto';
export const SEED_VERSION='vietnam-community-20260916-v1';
export const userSpecs=[
 ['Nguyễn Minh Anh','nguyen.minh.anh','Hà Nội','Thiết kế những trò nhỏ để thư giãn sau giờ làm.'],
 ['Trần Hoàng Nam','tran.hoang.nam','Đà Nẵng','Thích toán học và các thử thách tính nhẩm.'],
 ['Lê Thùy Linh','le.thuy.linh','Huế','Học ngoại ngữ qua những tình huống gần gũi.'],
 ['Phạm Quốc Huy','pham.quoc.huy','Hải Phòng','Hay đọc chuyện lịch sử và tìm hiểu các vùng miền.'],
 ['Võ Ngọc Mai','vo.ngoc.mai','Quy Nhơn','Mê những chuyến đi biển và game khám phá.'],
 ['Đặng Minh Tuấn','dang.minh.tuan','TP. Hồ Chí Minh','Chơi chiến thuật chậm rãi, thích thử nhiều cách giải.'],
 ['Bùi Khánh Vy','bui.khanh.vy','Cần Thơ','Thích nhạc điện tử và thử thách phản xạ.'],
 ['Đỗ Gia Bảo','do.gia.bao','Biên Hòa','Muốn làm những trò chơi nhỏ về môi trường.'],
 ['Hồ Thanh Hà','ho.thanh.ha','Nha Trang','Thích xếp hình và tự tìm quy luật.'],
 ['Ngô Đức Anh','ngo.duc.anh','Hà Nội','Một người mê các câu đố suy luận.'],
 ['Dương Quỳnh Chi','duong.quynh.chi','Đà Lạt','Thường chơi vài ván ngắn vào giờ nghỉ trưa.'],
 ['Vũ Thành Đạt','vu.thanh.dat','Hải Dương','Thích cạnh tranh kỷ lục cùng bạn bè.'],
 ['Phan Bảo Ngọc','phan.bao.ngoc','Vinh','Chơi game cùng em gái vào cuối tuần.'],
 ['Đinh Hải Yến','dinh.hai.yen','Hạ Long','Ưu tiên game nhẹ, dễ hiểu và không quá vội.'],
 ['Lý Hoàng Phúc','ly.hoang.phuc','TP. Hồ Chí Minh','Hay thử game mới rồi ghi lại vài góp ý.'],
 ['Mai Tú Anh','mai.tu.anh','Hà Nội','Thích các trò nhớ hình và nhận diện màu sắc.'],
 ['Tạ Minh Khang','ta.minh.khang','Đà Nẵng','Rảnh là tìm một câu đố để giải.'],
 ['Lương Ngọc Hân','luong.ngoc.han','Bến Tre','Thích những trò có thể chơi ngay trên điện thoại.'],
 ['Cao Nhật Minh','cao.nhat.minh','Thái Nguyên','Quan tâm tới game giáo dục và bài tập tư duy.'],
 ['Huỳnh Phương Thảo','huynh.phuong.thao','Long Xuyên','Chơi để nghỉ đầu óc, đôi lúc hơi hiếu thắng.'],
 ['Tống Khánh Linh','tong.khanh.linh','Nam Định','Tập tiếng Anh mỗi ngày bằng các trò nhỏ.'],
 ['Đoàn Việt Hoàng','doan.viet.hoang','Buôn Ma Thuột','Thích game ít chữ, thao tác rõ ràng.'],
 ['Trịnh Thu Trang','trinh.thu.trang','Hưng Yên','Mê các trò ghép nối và tìm đường.'],
 ['Hà Quốc Bảo','ha.quoc.bao','Pleiku','Thích câu hỏi về địa lý và đời sống.'],
 ['Kiều Diễm My','kieu.diem.my','Vũng Tàu','Thỉnh thoảng vào thử game bạn bè giới thiệu.'],
 ['Châu Anh Thư','chau.anh.thu','Sóc Trăng','Thích game có nội dung về thiên nhiên.'],
 ['Tô Đức Duy','to.duc.duy','Bắc Ninh','Kiên nhẫn với những màn giải đố khó.'],
 ['La Thanh Trúc','la.thanh.truc','Tuy Hòa','Ưa các chuyến phiêu lưu nhỏ và màu sắc dịu.'],
 ['Quách Hữu Nghĩa','quach.huu.nghia','Rạch Giá','Hay nghĩ hơi lâu trước mỗi nước đi.'],
 ['Ninh Bích Ngân','ninh.bich.ngan','Phan Thiết','Thích đoán quy luật và thử phản xạ của mình.'],
];
export const gameSpecs=[
 {key:'memory',owner:0,people:[0,10,11,12,13,14,15],plays:38,stars:[5,4,4,5,3,4],created:'2026-08-03T08:25:00Z',comments:[
 'Lật được cặp cuối cùng thấy đã ghê. Chơi vài ván là mình nhớ hình nhanh hơn hẳn.',
 'Hình dễ phân biệt, nhưng mình hay nhầm hai ô vừa mở. Hợp để chơi lúc nghỉ trưa.',
 'Cho em gái chơi thử mà cuối cùng hai chị em ngồi tranh nhau phá kỷ lục.',
 'Màu nhìn êm mắt, không bị rối. Mình thích kiểu chơi không cần đọc hướng dẫn dài.',
 'Vui nhưng chơi nhiều lượt thì hơi thiếu bất ngờ, thêm một bộ hình khác nữa chắc hay.',
 'Ổn áp. Trên điện thoại vẫn bấm từng ô khá dễ.' ]},
 {key:'arithmetic',owner:1,people:[1,10,16,17,18],plays:21,stars:[4,3,4,2],created:'2026-08-18T12:40:00Z',comments:[
 'Ý tưởng chuyến tàu dễ thương, tính nhẩm mấy phép đầu thấy khá cuốn.',
 'Đến những phép khó mình phải nhẩm lại hai lần. Mong có phần luyện chậm hơn cho người mới.',
 'Mình chơi trên màn hình nhỏ vẫn đọc số rõ, làm đúng liên tiếp khá vui.',
 'Mức khó chưa hợp với mình lắm, đang quen câu dễ thì gặp câu khó quá nên hơi hụt hẫng.' ]},
 {key:'english',owner:2,people:[2,11,19,20,21,22],plays:34,stars:[5,4,5,4,4],created:'2026-08-09T17:10:00Z',comments:[
 'Nhớ từ bằng việc chọn đồ trong chợ dễ vào đầu hơn học một danh sách dài.',
 'Từ vựng gần gũi, mình chơi cùng cháu thấy cháu chịu đọc tiếng Anh hơn.',
 'Rất hợp để ôn mấy từ cơ bản. Làm sai rồi chơi lại vẫn thấy nhớ được từ mới.',
 'Ước gì có thêm giọng đọc để biết phát âm. Phần chọn đồ hiện tại dùng ổn.',
 'Không quá khó, nhưng đó cũng là điểm mình thích. Tối chơi vài lượt cho đỡ quên từ.' ]},
 {key:'trivia',owner:3,people:[3,12,23,24],plays:12,stars:[3,4,3],created:'2026-09-02T06:45:00Z',comments:[
 'Có câu mình tưởng biết rồi mà vẫn trả lời sai. Số câu còn ít nên chơi lại hơi nhanh nhớ đáp án.',
 'Chủ đề Việt Nam gần gũi, chơi xong còn có chuyện kể với bạn. Mong có thêm câu về miền Trung.',
 'Chơi được, vài câu cần đọc kỹ mới hiểu ý hỏi. Nên diễn đạt ngắn hơn một chút.' ]},
 {key:'adventure',owner:4,people:[4,10,13,16,25,26,27],plays:47,stars:[5,5,4,4,3,5],created:'2026-08-01T14:15:00Z',comments:[
 'Đi tìm đồ rồi quay lại mở đường làm mình tò mò muốn khám phá hết bản đồ.',
 'Không khí hải đăng rất hợp gu. Mình đi vòng khá lâu mới tìm được thứ cần dùng, nhưng không thấy chán.',
 'Nút di chuyển dễ bấm. Giá mà có gợi ý nhẹ khi đứng mãi chưa tìm ra đường.',
 'Một cuộc phiêu lưu nhỏ vừa đủ cho giờ nghỉ, không phải học quá nhiều thao tác.',
 'Mình hơi lạc lúc đầu, chưa rõ nên tìm gì trước. Sau khi hiểu thì chơi ổn.',
 'Thích cảm giác tự tìm ra đường hơn là bị chỉ dẫn từng bước. Đã chơi lại để thử đi ít bước hơn.' ]},
 {key:'strategy',owner:5,people:[5,14,17,19,28],plays:19,stars:[4,3,4,4],created:'2026-08-22T09:30:00Z',comments:[
 'Phải cân nhắc từng lượt chứ bấm đại là thua. Trò nhỏ mà cũng cần tính toán đấy.',
 'Ban đầu mình chưa hiểu nên ưu tiên tài nguyên hay phòng thủ, cần đọc kỹ hướng dẫn.',
 'Có thể chơi chậm nên hợp với mình hơn mấy game bấm theo thời gian.',
 'Thử đổi cách đi là kết quả khác hẳn. Mong sau này có thêm bố cục để chơi lâu hơn.' ]},
 {key:'reflex',owner:6,people:[6,15,20,29],plays:16,stars:[3,2,4],created:'2026-09-05T19:05:00Z',comments:[
 'Nhanh thật, chơi hai lượt mới bắt được nhịp. Mình chỉ chơi vài ván ngắn thôi.',
 'Với mình hơi gấp, bấm trượt liên tục nên dễ nản. Có mức tập chậm hơn thì tốt.',
 'Cuốn phết, định chơi một lượt mà cứ muốn thử lại để hơn điểm cũ.' ]},
 {key:'ecology',owner:7,people:[7,10,18,21,23,25],plays:29,stars:[5,4,4,3,4],created:'2026-08-14T07:55:00Z',comments:[
 'Cho con chơi cùng, hai mẹ con còn tranh luận món này nên bỏ vào thùng nào. Rất có ích.',
 'Phần phản hồi giúp mình hiểu vì sao chọn sai, chứ không chỉ báo mất điểm.',
 'Giao diện đơn giản, vào là biết phải làm gì. Nội dung cũng gần với sinh hoạt hằng ngày.',
 'Một số món ngoài đời cần rửa sạch trước khi phân loại, thêm lưu ý cụ thể nữa sẽ hay hơn.',
 'Nhẹ nhàng mà học được vài điều. Mong có nhiều loại đồ hơn để không thuộc hết quá nhanh.' ]},
 {key:'pipes',owner:8,people:[8,11,22,24,26],plays:23,stars:[4,5,3,4],created:'2026-08-27T16:20:00Z',comments:[
 'Xoay thử rồi nhìn đường nối dần liền lại khá thư giãn.',
 'Mình thích kiểu phải nhìn cả bàn cờ, nối được đầu này chưa chắc đã tới được đích.',
 'Lúc đầu chưa rõ đầu nối nào đang mở. Chơi thêm một lượt thì hiểu, nhưng hướng dẫn có hình sẽ dễ hơn.',
 'Giải xong thấy vui, vừa đủ khó để phải nghĩ mà chưa đến mức bực mình.' ]},
 {key:'logic',owner:9,people:[9,10,12,14,16,27,29],plays:41,stars:[5,4,5,4,4,3],created:'2026-08-06T10:50:00Z',comments:[
 'Cảm giác loại trừ từng màu rồi tìm được mã rất đã. Đây là trò mình quay lại nhiều nhất.',
 'Mất một lúc mới phân biệt được đúng màu và đúng vị trí, hiểu rồi thì khá cuốn.',
 'Mã có màu lặp khiến phải suy nghĩ kỹ hơn, không thể chỉ đoán mỗi màu một lần.',
 'Không cần thao tác nhanh nên chơi trên điện thoại rất thoải mái.',
 'Có lúc chỉ còn một lượt mới đoán ra. Mình thích việc xem lại được các lần thử trước.',
 'Luật hơi khó với người chưa chơi kiểu này. Nên có một ví dụ giải thích phản hồi ngay đầu game.' ]},
];
export function stableId(kind,key){return `seedvn26_${kind}_${key}`;}
export function stableUuid(key){const s=createHash('sha256').update(SEED_VERSION+':'+key).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;}
function rng(key){let n=parseInt(createHash('sha256').update(key).digest('hex').slice(0,8),16);return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function createDataset(definitions){
 const users=userSpecs.map(([displayName,username,city,bio],i)=>({id:stableId('user',username.replaceAll('.','-')),email:`${username}@seed.tfg.example`,displayName,username,city,bio:`${bio} ${city}. Hồ sơ thuộc bộ dữ liệu mẫu cộng đồng.`,createdAt:new Date(Date.UTC(2026,5+(i%2),2+(i*7)%25,7+(i%13),i*11%60)).toISOString()}));
 const plays=[],scores=[],ratings=[],comments=[],memberships=[];
 const games=gameSpecs.map((spec,g)=>{
  const definition=definitions.find(x=>x.key===spec.key);if(!definition)throw Error('Missing playable game '+spec.key);
  const game={id:stableId('game',spec.key),slug:`${spec.key}-cong-dong`,title:definition.title,genre:definition.genre,description:`${definition.genre}. ${definition.instructions}\n\nMột trò chơi trong bộ demo cộng đồng TFGhub.`,ownerId:users[spec.owner].id,createdAt:spec.created,projectData:definition.project};
  const random=rng(SEED_VERSION+spec.key),earliest=Date.parse(spec.created)+86400000,latest=Date.parse('2026-09-13T19:00:00Z');
  const weights=spec.people.map((_,i)=>i===0?0.5:0.6+random()*2.8),sum=weights.reduce((a,b)=>a+b,0);
  for(let j=0;j<spec.plays;j++){
   let pick=j<spec.people.length?j:0;
   if(j>=spec.people.length){let n=random()*sum;while(pick<weights.length-1&&(n-=weights[pick])>0)pick++;}
   const user=users[spec.people[pick]],createdAt=new Date(earliest+Math.floor(random()*(latest-earliest))).toISOString();
   const duration=Math.round(definition.durationSeconds[0]+random()*(definition.durationSeconds[1]-definition.durationSeconds[0]));
   const id=stableUuid(spec.key+':play:'+j);plays.push({id,gameId:game.id,userId:user.id,createdAt,activeSeconds:duration,expiresAt:new Date(Date.parse(createdAt)+21600000).toISOString(),lastHeartbeatAt:new Date(Date.parse(createdAt)+duration*1000).toISOString(),sequence:Math.ceil(duration/15)});
   const score=definition.scoreSamples[Math.floor(random()*definition.scoreSamples.length)];scores.push({playId:id,score});
  }
  spec.people.forEach((userIndex,i)=>memberships.push({gameId:game.id,userId:users[userIndex].id,isCreator:i===0}));
  spec.stars.forEach((rating,i)=>{
   const userId=users[spec.people[i+1]].id;ratings.push({gameId:game.id,userId,rating});
   const firstPlay=Math.min(...plays.filter(p=>p.gameId===game.id&&p.userId===userId).map(p=>Date.parse(p.createdAt)))+600000;
   const reviewTime=firstPlay+Math.floor(random()*(Date.parse('2026-09-15T15:00:00Z')-firstPlay));
   comments.push({id:stableId('comment',`${spec.key}-${i}`),gameId:game.id,userId,body:spec.comments[i],createdAt:new Date(reviewTime).toISOString()});
  });return game;
 });
 return {version:SEED_VERSION,provenance:'Synthetic demonstration data; not real user activity or income.',users,games,memberships,plays,scores,ratings,comments};
}
export function summarize(data){return data.games.map(game=>{
 const plays=data.plays.filter(p=>p.gameId===game.id),ratings=data.ratings.filter(r=>r.gameId===game.id),ids=new Set(plays.map(p=>p.id)),scores=data.scores.filter(s=>ids.has(s.playId));
 return {id:game.id,title:game.title,creator:data.users.find(u=>u.id===game.ownerId).displayName,genre:game.genre,participants:new Set(plays.map(p=>p.userId)).size,totalPlays:plays.length,ratingAverage:ratings.reduce((n,r)=>n+r.rating,0)/ratings.length,ratingCount:ratings.length,commentCount:data.comments.filter(c=>c.gameId===game.id).length,totalPlaySeconds:plays.reduce((n,p)=>n+p.activeSeconds,0),averagePlaySeconds:plays.reduce((n,p)=>n+p.activeSeconds,0)/plays.length,highScore:Math.max(...scores.map(s=>s.score)),averageScore:scores.reduce((n,s)=>n+s.score,0)/scores.length};
});}
