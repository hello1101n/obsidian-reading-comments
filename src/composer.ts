import { type App, Notice, Scope } from 'obsidian';
import {popupPosition,type PopupAnchor} from './popupPosition.ts';
export interface ComposerPlacement {doc:Document;anchor:()=>PopupAnchor}
export class CommentComposer {
 private app:App;
 private quote:string;
 private initial:string;
 private save:(text:string)=>Promise<void>;
 private closed:()=>void;
 private placement?:ComposerPlacement;
 private popup:HTMLElement|null=null;
 private cleanups:Array<()=>void>=[];
 private saving=false;
 constructor(_app:App,quote:string,initial:string,save:(text:string)=>Promise<void>,closed:()=>void=()=>{},placement?:ComposerPlacement){
  this.app=_app;this.quote=quote;this.initial=initial;this.save=save;this.closed=closed;this.placement=placement;
 }
 open():void {
  if(this.popup)return;
  const doc=this.placement?.doc??document,win=doc.defaultView;
  if(!win)return;
  const popup=doc.body.createDiv({cls:'rc-ui rc-popup',attr:{role:'dialog','aria-modal':'false','aria-label':this.initial?'Edit comment':'Add comment'}});
  this.popup=popup;
  const scope=new Scope();this.app.keymap.pushScope(scope);this.cleanups.push(()=>this.app.keymap.popScope(scope));
  const heading=popup.createDiv({cls:'rc-popup-heading'});
  heading.createEl('strong',{text:this.initial?'Edit comment':'Add comment'});
  const dismiss=heading.createEl('button',{text:'×',cls:'rc-popup-close',attr:{'aria-label':'Cancel comment'}});
  dismiss.onclick=()=>{if(!this.saving)this.close();};
  popup.createEl('blockquote',{text:this.quote,cls:'rc-popup-quote'});
  const input=popup.createEl('textarea',{cls:'rc-composer',attr:{placeholder:'What should change?','aria-label':'Comment',rows:'3'}});
  input.value=this.initial;
  const actions=popup.createDiv({cls:'rc-actions'});
  actions.createEl('span',{text:'⌘/Ctrl+Enter to save',cls:'rc-popup-hint'});
  const cancel=actions.createEl('button',{text:'Cancel'});cancel.onclick=()=>{if(!this.saving)this.close();};
  const save=actions.createEl('button',{text:'Save',cls:'mod-cta'});
  const submit=async()=>{
   if(this.saving || !input.value.trim()){input.focus({preventScroll:true});return;}
   this.saving=true;save.disabled=true;cancel.disabled=true;dismiss.disabled=true;input.disabled=true;
   try{await this.save(input.value.trim());this.close();}
   catch(error){new Notice(error instanceof Error?error.message:String(error));}
   finally{this.saving=false;save.disabled=false;cancel.disabled=false;dismiss.disabled=false;input.disabled=false;if(this.popup)input.focus({preventScroll:true});}
  };
  save.onclick=()=>{void submit();};
  input.onkeydown=event=>{
   if(event.key==='Enter' && (event.metaKey||event.ctrlKey) && !event.isComposing){event.preventDefault();event.stopPropagation();void submit();}
  };
  const position=()=>{
   const anchor=this.placement?.anchor()??{left:(win.innerWidth-360)/2,top:win.innerHeight/3,bottom:win.innerHeight/3};
   const bounds=popup.getBoundingClientRect();
   const {left,top}=popupPosition(anchor,bounds.width||Math.min(360,win.innerWidth-24),bounds.height||250,win.innerWidth,win.innerHeight);
   popup.style.left=`${left}px`;popup.style.top=`${top}px`;
  };
  const outside=(event:Event)=>{if(!this.saving && !popup.contains(event.target as Node))this.close();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape' && !this.saving){event.preventDefault();event.stopPropagation();this.close();}};
  doc.addEventListener('pointerdown',outside,true);doc.addEventListener('keydown',escape,true);
  win.addEventListener('resize',position);doc.addEventListener('scroll',position,true);
  this.cleanups.push(()=>doc.removeEventListener('pointerdown',outside,true),()=>doc.removeEventListener('keydown',escape,true),()=>win.removeEventListener('resize',position),()=>doc.removeEventListener('scroll',position,true));
  const Observer=(win as unknown as {ResizeObserver?:typeof ResizeObserver}).ResizeObserver;
  if(Observer){const observer=new Observer(position);observer.observe(popup);this.cleanups.push(()=>observer.disconnect());}
  position();
  input.focus({preventScroll:true});
  input.setSelectionRange(input.value.length,input.value.length);
 }
 close():void {
  if(!this.popup)return;
  for(const cleanup of this.cleanups.splice(0))cleanup();
  this.popup.remove();this.popup=null;this.closed();
 }
}
