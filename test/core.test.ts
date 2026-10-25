import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReview, storagePath, setResolved, createComment, reviewPrompt, findQuote } from '../src/comments.ts';
const legacy = {version:1,source:'docs/a.md',comments:[{id:'a',line:2,endLine:2,highlightedText:'text',comment:'change',createdAt:'2026-10-25',extra:'keep'}],extra:'keep'};
test('legacy comments are open and resolution mutations preserve unknown data', () => {
 const file=parseReview(JSON.stringify(legacy),'docs/a.md');
 assert.equal(file.comments[0].resolved,undefined);
 const done=setResolved(file,'a',true);
 assert.equal(done.comments[0].resolved,true);
 assert.equal(done.comments[0].extra,'keep'); assert.equal(done.extra,'keep');
 assert.equal(setResolved(done,'a',false).comments[0].resolved,false);
});
test('invalid files and wrong source are rejected rather than replaced',()=>{
 for(const content of ['{',JSON.stringify({...legacy,version:2}),JSON.stringify({...legacy,comments:[{...legacy.comments[0],resolved:'yes'}]})]) assert.throws(()=>parseReview(content,'docs/a.md'));
 assert.throws(()=>parseReview(JSON.stringify(legacy),'docs/b.md'));
 assert.throws(()=>parseReview(JSON.stringify({...legacy,comments:[legacy.comments[0],legacy.comments[0]]}),'docs/a.md'));
});
test('paths mirror the source and reject traversal',()=>{
 assert.equal(storagePath('docs/a.md'),'.comments/docs/a.md.comments.json');
 for(const p of ['../a.md','/a.md','a/../b.md','a\\b.md']) assert.throws(()=>storagePath(p));
});
test('new comments start open with stable IDs and quote context',()=>{
 const c=createComment('hello','change',3,4,{prefix:'before ',suffix:' after'});
 assert.equal(c.resolved,false); assert.ok(c.id); assert.equal(c.line,3); assert.equal(c.anchor?.prefix,'before ');
});
test('quote matching relocates unique passages and refuses ambiguous guesses',()=>{
 assert.deepEqual(findQuote('New paragraph. Some text here.','Some text'),{kind:'found',start:15,end:24});
 assert.deepEqual(findQuote('same x same','same'),{kind:'ambiguous'});
 assert.deepEqual(findQuote('gone','same'),{kind:'missing'});
 assert.deepEqual(findQuote('same x same','same',{prefix:' x ',suffix:''}),{kind:'found',start:7,end:11});
});
test('AI handoff processes only open comments and resolves every attempted outcome',()=>{
 const prompt=reviewPrompt('/vault/docs/a.md','/vault/.comments/docs/a.md.comments.json');
 assert.match(prompt,/resolved.*true/i); assert.match(prompt,/incorrect|unsuccessful/i);
 assert.match(prompt,/after each/i); assert.match(prompt,/unprocessed/i); assert.match(prompt,/stable.*id/i);
 assert.doesNotMatch(prompt,/do not edit.*JSON/i);
});
