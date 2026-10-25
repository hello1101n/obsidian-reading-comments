import { App, Modal, Notice } from 'obsidian';
export class CommentComposer extends Modal {
 private quote:string;
 private initial:string;
 private save:(text:string)=>Promise<void>;
 private closed:()=>void;
 constructor(app:App,quote:string,initial:string,save:(text:string)=>Promise<void>,closed:()=>void=()=>{}){super(app);this.quote=quote;this.initial=initial;this.save=save;this.closed=closed;}
 onOpen():void {
  this.titleEl.setText(this.initial?'Edit comment':'Add comment');
  this.contentEl.createEl('blockquote',{text:this.quote});
  const input=this.contentEl.createEl('textarea',{cls:'rc-composer',attr:{placeholder:'What should change?','aria-label':'Comment',rows:'5'}});
  input.value=this.initial;
  const actions=this.contentEl.createDiv({cls:'rc-actions'});
  const cancel=actions.createEl('button',{text:'Cancel'});cancel.onclick=()=>this.close();
  const save=actions.createEl('button',{text:'Save comment',cls:'mod-cta'});
  let saving=false;
  const submit=async()=>{
   if(saving || !input.value.trim()) {input.focus();return;}
   saving=true;save.disabled=true;cancel.disabled=true;input.disabled=true;
   try {await this.save(input.value.trim());this.close();} catch(error){new Notice(error instanceof Error?error.message:String(error));}
   finally {saving=false;save.disabled=false;cancel.disabled=false;input.disabled=false;}
  };
  save.onclick=()=>{void submit();};
  input.onkeydown=e=>{if(e.key==='Enter' && (e.metaKey||e.ctrlKey) && !e.isComposing){e.preventDefault();void submit();}};
  input.focus();
 }
 onClose():void {this.contentEl.empty();this.closed();}
}
