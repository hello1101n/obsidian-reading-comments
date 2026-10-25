import {Plugin,MarkdownView,FileSystemAdapter,Notice,type WorkspaceLeaf} from 'obsidian';
import {changeComment,createComment,reviewPrompt,setResolved,storagePath,type ReviewComment} from './comments.ts';
import {ReviewStore,type Snapshot} from './storage.ts';
import {captureSelection,indexReading,rangeForQuote} from './reading.ts';
import {CommentComposer} from './composer.ts';
import {CommentsSidebar,SIDEBAR,type SidebarModel} from './sidebar.ts';

interface Painted {nodes:Text[];signature:string;ranges:Map<string,Range>;open:Range[];resolved:Range[];matches:Map<string,string>}
interface HighlightWindow extends Window {Highlight?:new(...ranges:Range[])=>unknown;CSS:typeof CSS & {highlights?:Map<string,unknown>}}
export default class ReadingComments extends Plugin {
 store!:ReviewStore;
 private selected:MarkdownView|null=null;
 private snapshot:Snapshot|null=null;
 private selectedSource='';
 private painted=new Map<HTMLElement,Painted>();
 private attached=new Set<Document>();
 private composer:CommentComposer|null=null;
 private timer:number|undefined;
 private sequence=0;
 private stopped=false;
 private sidebarSignature='';
 async onload():Promise<void> {
  this.store=new ReviewStore(this.app.vault.adapter);
  this.registerView(SIDEBAR,leaf=>new CommentsSidebar(leaf,{
   copy:()=>this.run(()=>this.copyPrompt()),refresh:()=>this.schedule(),jump:id=>this.jump(id),
   edit:id=>this.edit(id),toggle:id=>this.run(()=>this.toggle(id)),remove:id=>this.run(()=>this.remove(id)),
  }));
  this.addRibbonIcon('message-square','Open reading comments',()=>{void this.openSidebar();});
  this.addCommand({id:'open-comments',name:'Open reading comments',callback:()=>{void this.openSidebar();}});
  this.addCommand({id:'copy-review-prompt',name:'Copy review prompt',callback:()=>this.run(()=>this.copyPrompt())});
  this.addCommand({id:'add-comment',name:'Comment on selected passage',callback:()=>this.offerSelection(this.selected?.containerEl.ownerDocument ?? document)});
  this.registerMarkdownPostProcessor((el,ctx)=>{const info=ctx.getSectionInfo(el);if(info)el.dataset.rcLine=String(info.lineStart+1);this.schedule();});
  this.registerEvent(this.app.workspace.on('active-leaf-change',leaf=>{
   if(leaf?.view instanceof MarkdownView && leaf.view.getMode()==='preview') this.selected=leaf.view;
   this.schedule();
  }));
  this.registerEvent(this.app.workspace.on('layout-change',()=>this.schedule()));
  this.registerEvent(this.app.vault.on('modify',()=>this.schedule()));
  this.registerEvent(this.app.vault.on('rename',(file,old)=>this.run(async()=>{await this.store.move(old,file.path);this.schedule();})));
  this.registerInterval(window.setInterval(()=>this.schedule(),1500));
  this.app.workspace.onLayoutReady(()=>{if(!this.stopped)this.schedule();});
 }
 private run(fn:()=>Promise<void>):void {void fn().catch(e=>{if(!this.stopped)new Notice(e instanceof Error?e.message:String(e));});}
 private schedule():void {
  if(this.stopped)return;
  if(this.timer!==undefined)window.clearTimeout(this.timer);
  this.timer=window.setTimeout(()=>{this.timer=undefined;this.run(()=>this.refresh());},120);
 }
 private views():MarkdownView[]{return this.app.workspace.getLeavesOfType('markdown').map(l=>l.view).filter((v):v is MarkdownView=>v instanceof MarkdownView && v.getMode()==='preview' && !!v.file);}
 private root(view:MarkdownView):HTMLElement|null {return view.contentEl.querySelector<HTMLElement>('.markdown-preview-view');}
 private attach(doc:Document):void {
  if(this.attached.has(doc))return;this.attached.add(doc);
  this.registerDomEvent(doc,'mouseup',event=>{
   if(event.button===0 && event.target && this.views().some(view=>this.root(view)?.contains(event.target as Node)))this.offerSelection(doc);
  });
  this.registerDomEvent(doc,'keyup',e=>{if(e.key==='Shift')this.offerSelection(doc);});
 }
 private offerSelection(doc:Document):void {
  if(this.composer || this.stopped)return;
  const selection=doc.getSelection();if(!selection?.rangeCount || selection.isCollapsed)return;
  const range=selection.getRangeAt(0);
  const view=this.views().find(v=>{const root=this.root(v);return root?.contains(range.startContainer) && root.contains(range.endContainer);});
  if(!view?.file)return;
  const root=this.root(view)!;const captured=captureSelection(root,range);if(!captured)return;
  this.selected=view;const source=view.file.path;
  const modal=new CommentComposer(this.app,captured.quote,'',async text=>{
   if(view.file?.path!==source)throw new Error('The note changed or moved. Select the passage again.');
   await this.store.add(source,createComment(captured.quote,text,captured.line,captured.endLine,captured.anchor));
   doc.getSelection()?.removeAllRanges();await this.openSidebar();await this.refresh();
  },()=>{doc.getSelection()?.removeAllRanges();this.composer=null;});
  this.composer=modal;modal.open();
 }
 private async refresh():Promise<void> {
  if(this.stopped)return;const seq=++this.sequence;
  const views=this.views();const active=this.app.workspace.getActiveViewOfType(MarkdownView);
  if(active?.getMode()==='preview' && active.file)this.selected=active;
  if(!views.includes(this.selected!))this.selected=views[0]??null;
  const liveRoots=new Set<HTMLElement>();const loaded=new Map<string,Snapshot>();
  let sidebar:SidebarModel={source:'',comments:[],matches:new Map()};
  for(const view of views){
   const root=this.root(view);if(!root || !view.file)continue;
   this.attach(root.ownerDocument);liveRoots.add(root);const source=view.file.path;
   try{
    let snapshot=loaded.get(source);if(!snapshot){snapshot=await this.store.load(source);loaded.set(source,snapshot);}
    if(this.stopped || seq!==this.sequence)return;
    const index=indexReading(root);const signature=JSON.stringify([source,snapshot.raw,index.text]);
    const nodes=[...new Set(index.points.flatMap(p=>p?[p.node]:[]))];
    let paint=this.painted.get(root);
    if(!paint || paint.signature!==signature || paint.nodes.length!==nodes.length || paint.nodes.some((n,i)=>n!==nodes[i])){
     root.querySelectorAll('.rc-marker').forEach(el=>el.remove());
     paint={nodes,signature,ranges:new Map(),open:[],resolved:[],matches:new Map()};
     for(const comment of snapshot.file.comments){
      const found=rangeForQuote(index,comment.highlightedText,comment.anchor);paint.matches.set(comment.id,found.kind);
      if(found.kind!=='found')continue;
      paint.ranges.set(comment.id,found.range);(comment.resolved?paint.resolved:paint.open).push(found.range);
      const parent=found.range.endContainer.parentElement?.closest('p,li,td,th,h1,h2,h3,h4,h5,h6,pre,blockquote') ?? found.range.endContainer.parentElement;
      if(parent){const marker=parent.createEl('button',{text:comment.resolved?'✓':'💬',cls:'rc-ui rc-marker',attr:{'aria-label':`${comment.resolved?'Resolved':'Open'} comment: ${comment.comment}`,title:comment.comment}});marker.classList.toggle('is-resolved',comment.resolved===true);marker.onclick=e=>{e.preventDefault();e.stopPropagation();this.selected=view;void this.openSidebar(comment.id);};}
     }
     this.painted.set(root,paint);
    }
    if(view===this.selected){this.snapshot=snapshot;this.selectedSource=source;sidebar={source,comments:snapshot.file.comments,matches:paint.matches};}
   }catch(error){if(this.stopped || seq!==this.sequence)return;root.querySelectorAll('.rc-marker').forEach(el=>el.remove());this.painted.delete(root);if(view===this.selected){this.snapshot=null;this.selectedSource=source;sidebar={source,comments:[],matches:new Map(),error:error instanceof Error?error.message:String(error)};}}
  }
  if(this.stopped || seq!==this.sequence)return;
  for(const [root] of this.painted)if(!liveRoots.has(root)){root.querySelectorAll('.rc-marker').forEach(el=>el.remove());this.painted.delete(root);}
  this.updateHighlights();
  if(!this.selected){this.snapshot=null;this.selectedSource='';}
  const signature=JSON.stringify([sidebar.source,sidebar.comments,[...sidebar.matches],sidebar.error]);
  if(signature!==this.sidebarSignature){this.sidebarSignature=signature;for(const leaf of this.app.workspace.getLeavesOfType(SIDEBAR))(leaf.view as CommentsSidebar).render(sidebar);}
 }
 private updateHighlights():void {
  for(const doc of this.attached){
   const win=doc.defaultView as HighlightWindow|null;if(!win?.CSS?.highlights || !win.Highlight)continue;
   const paints=[...this.painted].filter(([root])=>root.ownerDocument===doc).map(([,p])=>p);
   win.CSS.highlights.set('rc-open',new win.Highlight(...paints.flatMap(p=>p.open)));
   win.CSS.highlights.set('rc-resolved',new win.Highlight(...paints.flatMap(p=>p.resolved)));
  }
 }
 private async openSidebar(id?:string):Promise<void> {
  let leaf:WorkspaceLeaf|undefined=this.app.workspace.getLeavesOfType(SIDEBAR)[0];
  if(!leaf){leaf=this.app.workspace.getRightLeaf(false)??undefined;if(!leaf)throw new Error('Cannot open comments sidebar.');await leaf.setViewState({type:SIDEBAR,active:true});}
  await this.app.workspace.revealLeaf(leaf);this.sidebarSignature='';await this.refresh();if(id)(leaf.view as CommentsSidebar).focusComment(id);
 }
 private current(id:string):{comment:ReviewComment;source:string;snapshot:Snapshot}{
  const c=this.snapshot?.file.comments.find(c=>c.id===id);if(!c || !this.snapshot)throw new Error('Comment unavailable. Refresh and try again.');
  return {comment:c,source:this.selectedSource,snapshot:this.snapshot};
 }
 private async toggle(id:string):Promise<void>{const {comment,source,snapshot}=this.current(id);await this.store.update(source,snapshot.raw,f=>setResolved(f,id,!comment.resolved));await this.refresh();}
 private async remove(id:string):Promise<void>{const {source,snapshot}=this.current(id);await this.store.update(source,snapshot.raw,f=>({...f,comments:f.comments.filter(c=>c.id!==id)}));await this.refresh();}
 private edit(id:string):void {
  if(this.composer)return;
  this.run(async()=>{const {comment,source,snapshot}=this.current(id);const modal=new CommentComposer(this.app,comment.highlightedText,comment.comment,async text=>{await this.store.update(source,snapshot.raw,f=>changeComment(f,id,c=>({...c,comment:text})));await this.refresh();},()=>{this.composer=null;});this.composer=modal;modal.open();});
 }
 private jump(id:string):void {
  const root=this.selected?this.root(this.selected):null;const range=root?this.painted.get(root)?.ranges.get(id):null;
  range?.startContainer.parentElement?.scrollIntoView({block:'center',behavior:'smooth'});
 }
 private async copyPrompt():Promise<void>{
  const source=this.selected?.file?.path ?? this.selectedSource;if(!source)throw new Error('Open a note in Reading view first.');
  const snapshot=await this.store.load(source);if(!snapshot.file.comments.some(c=>!c.resolved))throw new Error('No open comments to process.');
  const adapter=this.app.vault.adapter;if(!(adapter instanceof FileSystemAdapter))throw new Error('This plugin requires a desktop filesystem vault.');
  const base=adapter.getBasePath().replace(/\/$/,'');
  await navigator.clipboard.writeText(reviewPrompt(`${base}/${source}`,`${base}/${storagePath(source)}`));new Notice('Review prompt copied.');
 }
 onunload():void {
  this.stopped=true;this.sequence++;if(this.timer!==undefined)window.clearTimeout(this.timer);
  this.composer?.close();this.composer=null;
  for(const [root]of this.painted)root.querySelectorAll('.rc-marker').forEach(el=>el.remove());
  for(const doc of this.attached){const win=doc.defaultView as HighlightWindow|null;win?.CSS?.highlights?.delete('rc-open');win?.CSS?.highlights?.delete('rc-resolved');doc.querySelectorAll('[data-rc-line]').forEach(el=>el.removeAttribute('data-rc-line'));}
  this.painted.clear();this.attached.clear();
 }
}
