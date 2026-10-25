import {test} from 'node:test';
import assert from 'node:assert/strict';
import {popupPosition} from '../src/popupPosition.ts';
test('popup stays below the selection when space permits',()=>{
 assert.deepEqual(popupPosition({left:100,top:80,bottom:100},360,250,1000,800),{left:100,top:108});
});
test('popup flips above the selection near the viewport bottom',()=>{
 assert.deepEqual(popupPosition({left:900,top:700,bottom:720},360,250,1000,800),{left:628,top:442});
});
test('popup remains inside a narrow or short viewport',()=>{
 assert.deepEqual(popupPosition({left:-50,top:50,bottom:80},260,150,280,180),{left:12,top:12});
});
