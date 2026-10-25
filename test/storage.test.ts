import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,access,rename,unlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {ReviewStore,type Backend} from '../src/storage.ts';
import {createComment,setResolved} from '../src/comments.ts';
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'rc-store-'));
 const b:Backend={exists:async p=>{try{await access(join(root,p));return true;}catch{return false;}},read:p=>readFile(join(root,p),'utf8'),write:async(p,s)=>{await writeFile(join(root,p),s);},mkdir:async p=>{await mkdir(join(root,p),{recursive:true});},remove:p=>unlink(join(root,p)),list:async p=>{const es=await readdir(join(root,p),{withFileTypes:true});return {files:es.filter(e=>e.isFile()).map(e=>`${p}/${e.name}`),folders:es.filter(e=>e.isDirectory()).map(e=>`${p}/${e.name}`)};}};
 return {root,b,store:new ReviewStore(b)};
}
const comment=()=>createComment('quote','change',1,1,{prefix:'',suffix:''});
test('queued additions preserve both comments',async()=>{
 const {store}=await setup();
 await Promise.all([store.add('a.md',comment()),store.add('a.md',comment())]);
 assert.equal((await store.load('a.md')).file.comments.length,2);
});
test('stale status updates reject external edits and preserve the latest JSON',async()=>{
 const {store,b}=await setup();const c=comment();await store.add('a.md',c);
 const snapshot=await store.load('a.md');
 const external=JSON.stringify({...snapshot.file,extra:'external'});
 await b.write('.comments/a.md.comments.json',external);
 await assert.rejects(store.update('a.md',snapshot.raw,f=>setResolved(f,c.id,true)),/changed/i);
 assert.equal(await b.read('.comments/a.md.comments.json'),external);
});
test('malformed JSON is never overwritten by adding a comment',async()=>{
 const {store,b}=await setup(); await b.mkdir('.comments');await b.write('.comments/a.md.comments.json','broken');
 await assert.rejects(store.add('a.md',comment()));assert.equal(await b.read('.comments/a.md.comments.json'),'broken');
});
test('folder rename moves comments, updates source, and retains resolution',async()=>{
 const {store,b}=await setup();const c={...comment(),resolved:true};await store.add('old/a.md',c);
 await store.move('old','new');const f=await store.load('new/a.md');
 assert.equal(f.file.source,'new/a.md');assert.equal(f.file.comments[0].resolved,true);assert.equal(await b.exists('.comments/old/a.md.comments.json'),false);
});
test('rename collision preserves both original reviews',async()=>{
 const {store}=await setup();await store.add('a.md',comment());await store.add('b.md',comment());
 await assert.rejects(store.move('a.md','b.md'),/already exists/i);
 assert.equal((await store.load('a.md')).file.comments.length,1);
 assert.equal((await store.load('b.md')).file.comments.length,1);
});
