import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {indexReading, captureSelection, rangeForQuote} from '../src/reading.ts';
test('formatted and cross-block selections preserve text and context without modifying DOM',()=>{
 const dom=new JSDOM('<main><p>Before <strong>bold</strong> text.</p><p>Next paragraph.</p></main>');
 const root=dom.window.document.querySelector('main')!;
 const before=root.innerHTML;
 const range=dom.window.document.createRange();
 range.setStart(root.querySelector('strong')!.firstChild!,0);
 range.setEnd(root.querySelectorAll('p')[1].firstChild!,4);
 const c=captureSelection(root,range)!;
 assert.equal(c.quote,'bold text. Next'); assert.equal(c.anchor.prefix,'Before ');
 assert.equal(root.innerHTML,before);
 assert.equal(rangeForQuote(indexReading(root),'bold text. Next').kind,'found');
});
test('comment controls and embedded notes are excluded from note text',()=>{
 const d=new JSDOM('<main><p>Own text<button class="rc-ui">Comment</button></p><div class="markdown-embed">Other note</div></main>');
 assert.equal(indexReading(d.window.document.querySelector('main')!).text,'Own text');
});
test('repeated rendered quotes are ambiguous without matching context',()=>{
 const d=new JSDOM('<main><p>Repeat</p><p>Repeat</p></main>');
 assert.equal(rangeForQuote(indexReading(d.window.document.querySelector('main')!),'Repeat').kind,'ambiguous');
});
