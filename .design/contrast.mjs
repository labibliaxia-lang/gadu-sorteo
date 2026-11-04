const hexToRgb = (h) => { h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const lum = (h) => { const [r,g,b]=hexToRgb(h).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)); };
const dark = { canvas:'#010102', panel1:'#0f1011', panel2:'#141516', panel3:'#18191a', fg:'#f7f8f8', muted:'#d0d6e0', subtle:'#8a8f98', faint:'#62666d', brand300:'#ffd23a', brand500:'#f5b301', ink:'#0a0a0b', emerald300:'#6ee7b7', amber300:'#fcd34d' };
const light = { canvas:'#f6f4ef', panel1:'#fdfcf9', panel2:'#eeeae2', panel3:'#e7e3da', fg:'#14130f', muted:'#3f3d36', subtle:'#676358', faint:'#8e8a7e', brand700:'#b37f00', brand800:'#8c6400', ink:'#0a0a0b', emerald700:'#047857', amber700:'#b45309' };
const pairs = [
 ['dark','fg','canvas'],['dark','muted','canvas'],['dark','subtle','canvas'],['dark','subtle','panel1'],['dark','subtle','panel2'],['dark','subtle','panel3'],['dark','brand300','canvas'],['dark','brand300','panel1'],['dark','ink','brand500'],['dark','muted','panel2'],['dark','emerald300','panel1'],['dark','amber300','panel1'],
 ['light','fg','canvas'],['light','muted','canvas'],['light','subtle','panel1'],['light','subtle','panel2'],['light','subtle','panel3'],['light','brand700','panel1'],['light','brand800','panel1'],['light','emerald700','panel1'],['light','amber700','panel1']
];
for (const [mode,a,b] of pairs) { const map = mode==='dark'?dark:light; const r = ratio(map[a],map[b]); const pass = r>=4.5?'AA text':(r>=3?'AA large/UI':'FAIL'); console.log(`${mode.padEnd(5)} ${a.padEnd(9)} on ${b.padEnd(7)} = ${r.toFixed(2)}  ${pass}`); }