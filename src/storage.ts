import {parseReview,storagePath,type ReviewFile,type ReviewComment} from './comments.ts';
export interface Backend {
 exists(path:string):Promise<boolean>; read(path:string):Promise<string>; write(path:string,text:string):Promise<void>;
 mkdir(path:string):Promise<void>; remove(path:string):Promise<void>; list(path:string):Promise<{files:string[];folders:string[]}>;
}
export interface Snapshot {file:ReviewFile;raw:string|null}
export class ReviewStore {
 private backend:Backend;
 private tail:Promise<unknown>=Promise.resolve();
 constructor(backend:Backend){this.backend=backend;}
 private queue<T>(fn:()=>Promise<T>):Promise<T>{const job=this.tail.then(fn);this.tail=job.catch(()=>{});return job;}
 async load(source:string):Promise<Snapshot>{
  const p=storagePath(source);
  if(!await this.backend.exists(p)) return {file:{version:1,source,comments:[]},raw:null};
  const raw=await this.backend.read(p);return {file:parseReview(raw,source),raw};
 }
 add(source:string,comment:ReviewComment):Promise<void>{
  return this.queue(async()=>{const s=await this.load(source);await this.save(source,s.raw,{...s.file,comments:[...s.file.comments,comment]});});
 }
 update(source:string,expected:string|null,fn:(file:ReviewFile)=>ReviewFile):Promise<void>{
  return this.queue(async()=>{const s=await this.load(source);if(s.raw!==expected) throw new Error('Comments changed externally. Refresh and try again.');await this.save(source,s.raw,fn(s.file));});
 }
 private async ensureParent(p:string):Promise<void>{
  const parts=p.split('/');parts.pop();let current='';
  for(const part of parts){current=current?`${current}/${part}`:part;if(!await this.backend.exists(current)) await this.backend.mkdir(current);}
 }
 private async save(source:string,expected:string|null,file:ReviewFile):Promise<void>{
  const p=storagePath(source);const text=JSON.stringify(file,null,2)+'\n';parseReview(text,source);
  await this.ensureParent(p);
  const current=await this.backend.exists(p)?await this.backend.read(p):null;
  if(current!==expected) throw new Error('Comments changed externally. Refresh and try again.');
  await this.backend.write(p,text);
 }
 move(oldSource:string,newSource:string):Promise<void>{
  storagePath(oldSource);storagePath(newSource);
  return this.queue(async()=>{
   if(!await this.backend.exists('.comments')) return;
   const paths:string[]=[];
   const walk=async(p:string)=>{const {files,folders}=await this.backend.list(p);paths.push(...files.filter(f=>f.endsWith('.comments.json')));for(const folder of folders) await walk(folder);};
   await walk('.comments');
   const moves:Array<{old:string;next:string;snapshot:Snapshot}>=[];
   for(const p of paths){
    const source=p.slice('.comments/'.length,-'.comments.json'.length);
    if(source!==oldSource && !source.startsWith(oldSource+'/')) continue;
    const next=newSource+source.slice(oldSource.length);
    if(await this.backend.exists(storagePath(next))) throw new Error(`Review destination already exists: ${next}. Original reviews preserved.`);
    moves.push({old:source,next,snapshot:await this.load(source)});
   }
   for(const move of moves){
    await this.save(move.next,null,{...move.snapshot.file,source:move.next});
    const latest=await this.load(move.old);
    if(latest.raw!==move.snapshot.raw) throw new Error(`Original review changed during rename: ${move.old}. Both files preserved.`);
    await this.backend.remove(storagePath(move.old));
   }
  });
 }
}
