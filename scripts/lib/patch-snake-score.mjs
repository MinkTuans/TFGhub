/** Upgrade the explicitly requested legacy Snake game; refuse unknown source. */
export function patchSnakeScore(project) {
  if(project?.sourceType!=='CODE'||typeof project.javascript!=='string')throw Error('Expected Snake CODE project');
  const source=project.javascript;
  if(source.includes('tfg:score-state'))throw Error('Score bridge already installed');
  const replacements=[
    ["function loadBest(){try{return Number(localStorage.getItem('neonSnakeBest')||0)}catch{return 0}}","function loadBest(){return 0}"],
    ["function saveBest(value){try{localStorage.setItem('neonSnakeBest',String(value))}catch{}}","function saveBest(value){if(Number.isInteger(value)&&value>=0&&value<=2147483647)window.parent.postMessage({type:'tfg:score',score:value},'*')}"],
    ["let best=loadBest();bestEl.textContent=String(best).padStart(3,'0');",`let best=loadBest();bestEl.textContent=String(best).padStart(3,'0');
  window.addEventListener('message',function(event){
    if(event.source!==window.parent||event.data?.type!=='tfg:score-state')return;
    const saved=event.data.personalBest;
    if(!Number.isInteger(saved)||saved<0||saved>2147483647)return;
    best=Math.max(best,saved);bestEl.textContent=String(best).padStart(3,'0');
  });
  window.parent.postMessage({type:'tfg:score-ready'},'*');`],
    ["score++;scoreEl.textContent=String(score).padStart(3,'0');","score++;scoreEl.textContent=String(score).padStart(3,'0');if(score>best){best=score;bestEl.textContent=String(best).padStart(3,'0');saveBest(best);}"]
  ];
  let javascript=source;
  for(const [old,replacement] of replacements){if(javascript.split(old).length!==2)throw Error('Snake source changed; inspect before patching');javascript=javascript.replace(old,replacement);}
  return {...project,javascript};
}
