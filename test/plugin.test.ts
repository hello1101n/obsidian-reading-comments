// @ts-nocheck
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {mkdtemp,mkdir,readFile,writeFile,access,unlink,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const code=buildSync({entryPoints:['src/main.ts'],bundle:true,platform:'node',format:'cjs',external:['obsidian'],write:false}).outputFiles[0].text;
async function host(t){
 const dom=new JSDOM('<body><div class="workspace-leaf-content"><div class="markdown-preview-view"><p data-rc-line="3">The rollout should happen soon.</p><p>Another paragraph.</p></div></div></body>');
 const win=dom.window;
 const proto=win.HTMLElement.prototype;
 proto.createEl=function(tag,opts={}){const el=win.document.createElement(tag);if(typeof opts==='string')opts={cls:opts};if(opts.text)el.textContent=opts.text;if(opts.cls)el.className=opts.cls;for(const [k,v]of Object.entries(opts.attr??{}))el.setAttribute(k,v);this.append(el);return el;};
 proto.createDiv=function(opts={}){return this.createEl('div',opts);};proto.empty=function(){this.replaceChildren();};proto.setText=function(t){this.textContent=t;};proto.addClass=function(c){this.classList.add(c);};proto.removeClass=function(c){this.classList.remove(c);};proto.scrollIntoView=function(){};
 win.Range.prototype.getBoundingClientRect=()=>({left:50,bottom:100});
 const rootDir=await mkdtemp(join(tmpdir(),'rc-plugin-'));
 class Adapter {
  getBasePath(){return rootDir;}
  async exists(p){try{await access(join(rootDir,p));return true;}catch{return false;}}
  read(p){return readFile(join(rootDir,p),'utf8');}
  async write(p,s){await writeFile(join(rootDir,p),s);}
  async mkdir(p){await mkdir(join(rootDir,p),{recursive:true});}
  remove(p){return unlink(join(rootDir,p));}
  async list(p){const entries=await readdir(join(rootDir,p),{withFileTypes:true});return {files:entries.filter(e=>e.isFile()).map(e=>`${p}/${e.name}`),folders:entries.filter(e=>e.isDirectory()).map(e=>`${p}/${e.name}`)};}
 }
 class MarkdownView {file={path:'Review sample.md'};contentEl=win.document.querySelector('.workspace-leaf-content');containerEl=this.contentEl;getMode(){return 'preview';}}
 const markdown=new MarkdownView();const leaves=[{view:markdown}];const factories=new Map();const disposals=[];const notices=[];const clipboard={text:'',async writeText(s){this.text=s;}};
 const workspace={getLeavesOfType:type=>leaves.filter(l=>type==='markdown'?l.view instanceof MarkdownView:l.view.getViewType?.()===type),getActiveViewOfType:()=>markdown,on:()=>({}),onLayoutReady:f=>f(),async revealLeaf(){},getRightLeaf(){const leaf={async setViewState(state){this.view=factories.get(state.type)(this);}};leaves.push(leaf);return leaf;}};
 const app={vault:{adapter:new Adapter(),on:()=>({})},workspace};
 class Plugin {constructor(app){this.app=app;}register(f){disposals.push(f);}registerView(type,f){factories.set(type,f);}addRibbonIcon(){}addCommand(){}registerMarkdownPostProcessor(){}registerEvent(){}registerInterval(id){disposals.push(()=>win.clearInterval(id));}registerDomEvent(target,type,f){target.addEventListener(type,f);disposals.push(()=>target.removeEventListener(type,f));}}
 class ItemView {constructor(leaf){this.leaf=leaf;this.contentEl=win.document.body.createDiv();}}
 class Modal {constructor(){this.modalEl=win.document.body.createDiv({cls:'modal'});this.titleEl=this.modalEl.createEl('h2');this.contentEl=this.modalEl.createDiv();}open(){this.onOpen();}close(){this.onClose?.();this.modalEl.remove();}}
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:()=>({Plugin,MarkdownView,ItemView,Modal,FileSystemAdapter:Adapter,Notice:class{constructor(s){notices.push(s);}}}),window:win,document:win.document,navigator:{clipboard},crypto,console});
 const plugin=new module.exports.default(app);await plugin.onload();await plugin.refresh();
 t.after(()=>{plugin.onunload();for(const f of disposals)f();dom.window.close();});
 return {plugin,dom,win,markdown,app,root:markdown.contentEl.querySelector('.markdown-preview-view'),rootDir,notices,clipboard};
}
const comment={id:'one',line:3,endLine:3,highlightedText:'The rollout should happen soon.',comment:'Use a date',createdAt:'2026-10-25',resolved:false};
test('Reading view selection opens composer, persists comment, resolves, reopens, and copies prompt',async t=>{
 const {plugin,win,root,rootDir,clipboard}=await host(t);
 const range=win.document.createRange();range.selectNodeContents(root.querySelector('p'));win.getSelection().addRange(range);
 root.dispatchEvent(new win.MouseEvent('mouseup',{bubbles:true}));
 const button=win.document.querySelector('.rc-add-comment');assert.equal(button.hidden,false);button.click();
 const input=win.document.querySelector('textarea');input.value='Use a date';input.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true}));
 let saved;for(let i=0;i<50;i++){try{saved=JSON.parse(await readFile(join(rootDir,'.comments/Review sample.md.comments.json'),'utf8'));break;}catch{await new Promise(r=>setTimeout(r,10));}}
 assert.equal(saved.comments[0].comment,'Use a date');assert.equal(saved.comments[0].resolved,false);
 await plugin.refresh();assert.ok(win.document.querySelector('.rc-marker'));
 await plugin.toggle(saved.comments[0].id);
 assert.equal(JSON.parse(await readFile(join(rootDir,'.comments/Review sample.md.comments.json'),'utf8')).comments[0].resolved,true);
 await assert.rejects(plugin.copyPrompt(),/No open comments/);
 await plugin.toggle(saved.comments[0].id);await plugin.copyPrompt();assert.match(clipboard.text,/Review sample.md/);
});
test('identical-content Reading view rerender restores markers and non-collapsed anchors',async t=>{
 const {plugin,root}=await host(t);await plugin.store.add('Review sample.md',comment);await plugin.refresh();
 assert.equal(root.querySelectorAll('.rc-marker').length,1);
 root.innerHTML='<p data-rc-line="3">The rollout should happen soon.</p><p>Another paragraph.</p>';
 await plugin.refresh();assert.equal(root.querySelectorAll('.rc-marker').length,1);
 assert.equal(plugin.painted.get(root).ranges.get('one').collapsed,false);
});
test('a stale failing read cannot overwrite a newer successful refresh',async t=>{
 const {plugin,root}=await host(t);await plugin.store.add('Review sample.md',comment);
 const original=plugin.store.load.bind(plugin.store);let reject;
 plugin.store.load=()=>new Promise((_,r)=>{reject=r;});const pending=plugin.refresh();
 plugin.store.load=original;await plugin.refresh();reject(new Error('Delayed read failure'));await pending;
 assert.equal(plugin.snapshot.file.comments[0].id,'one');assert.equal(root.querySelectorAll('.rc-marker').length,1);
});
test('unload during a failing read does not restore sidebar state or markers',async t=>{
 const {plugin,root}=await host(t);await plugin.store.add('Review sample.md',comment);await plugin.refresh();
 let reject;plugin.store.load=()=>new Promise((_,r)=>{reject=r;});const pending=plugin.refresh();
 plugin.onunload();reject(new Error('Late failure'));await pending;
 assert.equal(plugin.painted.size,0);assert.equal(root.querySelectorAll('.rc-marker').length,0);
});
test('AI status changes in JSON appear on refresh and survive a new store load',async t=>{
 const {plugin,app,rootDir,win}=await host(t);await plugin.store.add('Review sample.md',comment);await plugin.openSidebar();
 const path=join(rootDir,'.comments/Review sample.md.comments.json');const f=JSON.parse(await readFile(path,'utf8'));f.comments[0].resolved=true;await writeFile(path,JSON.stringify(f));await plugin.refresh();
 assert.equal(win.document.querySelector('.rc-status').textContent,'Resolved');
 assert.equal((await plugin.store.load('Review sample.md')).file.comments[0].resolved,true);
});
