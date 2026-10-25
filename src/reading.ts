import { findQuote, type Anchor, type Match } from './comments.ts';
interface Point { node: Text; offset: number }
export interface ReadingIndex { text: string; points: Array<Point | null>; root: HTMLElement }
const EXCLUDED='.rc-ui, .markdown-embed, .internal-embed, script, style, button, textarea, input';
export function indexReading(root: HTMLElement): ReadingIndex {
  const walker=root.ownerDocument.createTreeWalker(root,4);
  const chars:string[]=[]; const points:Array<Point|null>=[];
  let lastBlock:Element|null=null;
  for(let n=walker.nextNode();n;n=walker.nextNode()) {
    const node=n as Text;
    if(!node.parentElement || node.parentElement.closest(EXCLUDED)) continue;
    const block=node.parentElement.closest('p,li,tr,h1,h2,h3,h4,h5,h6,pre,blockquote,td,th') ?? node.parentElement;
    if(lastBlock && block!==lastBlock && chars.length && chars.at(-1)!==' ') {chars.push(' ');points.push(null);}
    lastBlock=block;
    for(let i=0;i<node.data.length;i++) {
      const c=/\s/.test(node.data[i])?' ':node.data[i];
      if(c===' ' && (!chars.length || chars.at(-1)===' ')) continue;
      chars.push(c);points.push({node,offset:i});
    }
  }
  while(chars.at(-1)===' ') {chars.pop();points.pop();}
  return {text:chars.join(''),points,root};
}
export function captureSelection(root: HTMLElement, range: Range): {quote:string;anchor:Anchor;line:number;endLine:number}|null {
  if(range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const index=indexReading(root);
  const included=index.points.map((p,i)=>p && range.comparePoint(p.node,p.offset)===0 && range.comparePoint(p.node,p.offset+1)===0 ? i:-1).filter(i=>i>=0);
  if(!included.length) return null;
  let start=included[0], end=included.at(-1)!+1;
  while(index.text[start]===' ') start++;
  while(index.text[end-1]===' ') end--;
  const quote=index.text.slice(start,end);
  if(!quote) return null;
  const lineFor=(point: Point|null|undefined)=>Number(point?.node.parentElement?.closest('[data-rc-line]')?.getAttribute('data-rc-line') ?? 1);
  return {quote,anchor:{prefix:index.text.slice(Math.max(0,start-64),start),suffix:index.text.slice(end,end+64)},line:lineFor(index.points[start]),endLine:Math.max(lineFor(index.points[start]),lineFor(index.points[end-1]))};
}
export function rangeForQuote(index: ReadingIndex, quote:string, anchor?:Anchor): {kind:'found';range:Range} | {kind:'missing'|'ambiguous'} {
  const match:Match=findQuote(index.text,quote,anchor);
  if(match.kind!=='found') return match;
  const first=index.points[match.start],last=index.points[match.end-1];
  if(!first || !last) return {kind:'missing'};
  const range=index.root.ownerDocument.createRange();
  range.setStart(first.node,first.offset); range.setEnd(last.node,last.offset+1);
  return {kind:'found',range};
}
