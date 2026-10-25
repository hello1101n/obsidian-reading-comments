export interface PopupAnchor {left:number;top:number;bottom:number}
export function popupPosition(anchor:PopupAnchor,width:number,height:number,viewportWidth:number,viewportHeight:number):{left:number;top:number}{
 const margin=12,gap=8;
 const maxLeft=Math.max(margin,viewportWidth-width-margin);
 const maxTop=Math.max(margin,viewportHeight-height-margin);
 const below=anchor.bottom+gap;
 const preferred=below+height<=viewportHeight-margin?below:anchor.top-height-gap;
 return {left:Math.min(maxLeft,Math.max(margin,anchor.left)),top:Math.min(maxTop,Math.max(margin,preferred))};
}
