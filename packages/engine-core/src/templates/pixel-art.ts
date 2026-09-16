/** Palette-indexed artwork. A dot is transparent; reserved frames need no upload. */
export type BuiltinPixelSprite = { width: number; height: number; pixels: string[]; palette: Record<string, string> };
const palette = { o:'#142e36', g:'#28765b', l:'#63b86d', m:'#b1dc83', s:'#efc88f', b:'#297c9b', c:'#73e6d0', w:'#fff2c3', r:'#d85e65', d:'#754f59', t:'#997955', y:'#ffce66' };
const sprite = (pixels: string[]): BuiltinPixelSprite => ({width:16,height:16,pixels,palette:{...palette}});
export const BUILTIN_PIXEL_SPRITES: Record<string, BuiltinPixelSprite> = {
  'tfg:hero': sprite([
    '.....oooooo.....','....ogggglgo....','...ogllllllgo...','...oggggggggo...',
    '....osssssso....','....osossoso....','....osssssso....','.....osssso.....',
    '...oobbbbbboo...','..osobbcbboso...','..ossbbbbssso...','...oobbbbboo....',
    '....obbbbo......','....oo..oo......','...odd..ddo.....','...ooo..ooo.....',
  ]),
  'tfg:crystal': sprite([
    '................','.......w........','......wcw.......','.....wccco......',
    '....wccccbo.....','...wccccbbbo....','...occccbbbo....','...occccbbbo....',
    '....occcbbo.....','.....occbo......','......obo.......','.......o........',
    '................','....c......c....','................','................',
  ]),
  'tfg:hazard': sprite([
    '................','....r......r....','....ro....ro....','....rgo..rgo....',
    '.....gogggo.....','..r..gllgo..r...','..roglllgorro...','...oglllggo.....',
    '....ogllgo......','...rgllglgo.....','..rogllglgro....','....oggggo......',
    '.....otto.......','...oottttoo.....','..oddddddddo....','...oooooooo.....',
  ]),
  'tfg:gate': sprite([
    '......yyyy......','.....ywwwwy.....','....oyyyyyyo....','....obwwwwbo....',
    '....obwwwwbo....','....obbbbbbo....','.....owwwo......','.....owwwo......',
    '.....owwwo......','.....owbwo......','.....owwwo......','.....owwwo......',
    '....owwwwwo.....','....owooowo.....','...owwoowwo.....','...ooooooooo....',
  ]),
  'tfg:tree': sprite([
    '......oooo......','....ooggggoo....','...oglllllggo...','..ogllmllllggo..',
    '..oglllllllggo..','..oglllgllllgo..','.ogllllgllllggo.','.ogllggggllllgo.',
    '..oggggggggggo..','...oggggggggo...','....ooooooo.....','......otto......',
    '......otto......','.....otttto.....','....oddddddo....','.....oooooo.....',
  ]),
  'tfg:grass': sprite([
    'gggggggggggggggg','gggggggggggggggg','gggglggggggggggg','ggggglgggggggggg',
    'gggggggggggggggg','gggggggggggggggg','gggggggggggglggg','ggggggggggglgggg',
    'gggggggggggggggg','gggggggggggggggg','gglggggggggggggg','ggglgggggggggggg',
    'gggggggggggggggg','gggggggggggggggg','gggggggggggggggg','gggggggggggggggg',
  ]),
  'tfg:stone': sprite([
    '....oooooooo....','..oottttttttoo..','.otttssssstttto.','otttssssssstttto',
    'ottssttttttsstto','ottssttttttsstto','otttttttttttttto','otttttttttttttto',
    'otttttttttttttto','otttttttttttttto','odtttttttttttddo','oddtttttttttdddo',
    '.oddddddddddddo.','..oddddddddddo..','...oooooooooo...','................',
  ]),
};
