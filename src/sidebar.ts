import {ItemView, WorkspaceLeaf} from 'obsidian';
import type {ReviewComment} from './comments.ts';
export const SIDEBAR='reading-comments-sidebar';
export interface SidebarModel {source:string;comments:ReviewComment[];matches:Map<string,string>;error?:string}
export interface SidebarActions {copy:()=>void;refresh:()=>void;jump:(id:string)=>void;edit:(id:string,anchor:HTMLElement)=>void;toggle:(id:string)=>void;remove:(id:string)=>void}
export class CommentsSidebar extends ItemView {
 private actions:SidebarActions;
 constructor(leaf:WorkspaceLeaf,actions:SidebarActions){super(leaf);this.actions=actions;}
 getViewType():string{return SIDEBAR;}
 getDisplayText():string{return 'Reading comments';}
 getIcon():string{return 'message-square';}
 render(model:SidebarModel):void {
  const el=this.contentEl;el.empty();el.addClass('rc-sidebar');
  el.createEl('h3',{text:'Reading comments'});
  el.createEl('p',{text:model.source||'Open a note in Reading view.',cls:'rc-source'});
  const toolbar=el.createDiv({cls:'rc-actions'});
  const copy=toolbar.createEl('button',{text:'Copy review prompt'});copy.disabled=!model.source || !model.comments.some(c=>!c.resolved);copy.onclick=this.actions.copy;
  toolbar.createEl('button',{text:'Refresh'}).onclick=this.actions.refresh;
  if(model.error) el.createEl('p',{text:model.error,cls:'rc-error'});
  if(!model.comments.length && !model.error) el.createEl('p',{text:'Select a passage in Reading view, then click Add comment.',cls:'rc-help'});
  for(const comment of model.comments){
   const card=el.createDiv({cls:'rc-card',attr:{'data-comment-id':comment.id}});
   card.classList.toggle('is-resolved',comment.resolved===true);
   card.createEl('span',{text:comment.resolved?'Resolved':'Open',cls:'rc-status'});
   const match=model.matches.get(comment.id);
   if(match && match!=='found') card.createEl('p',{text:match==='ambiguous'?'Passage appears more than once. Review its location.':'Passage no longer found in the displayed note.',cls:'rc-warning'});
   card.createEl('blockquote',{text:comment.highlightedText});
   card.createEl('p',{text:comment.comment,cls:'rc-comment-text'});
   const actions=card.createDiv({cls:'rc-actions'});
   const jump=actions.createEl('button',{text:'Show passage'});jump.disabled=match!=='found';jump.onclick=()=>this.actions.jump(comment.id);
   actions.createEl('button',{text:comment.resolved?'Reopen':'Resolve'}).onclick=()=>this.actions.toggle(comment.id);
   const edit=actions.createEl('button',{text:'Edit'});edit.onclick=()=>this.actions.edit(comment.id,edit);
   actions.createEl('button',{text:'Delete'}).onclick=()=>this.actions.remove(comment.id);
  }
 }
 focusComment(id:string):void {
  const card=Array.from(this.contentEl.querySelectorAll<HTMLElement>('[data-comment-id]')).find(el=>el.dataset.commentId===id);
  card?.scrollIntoView({block:'nearest'});card?.addClass('rc-focused');
  if(card) window.setTimeout(()=>card.removeClass('rc-focused'),1200);
 }
}
