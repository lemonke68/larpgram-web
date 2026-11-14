import {createContext} from 'react';
import type {MatrixEvent} from 'matrix-js-sdk';

export const MusicContext=createContext<{
 event:MatrixEvent|null;
 playing:boolean;
 loading:boolean;
 error:boolean;
 position:number;
 duration:number;
 play:(event:MatrixEvent)=>void;
}|null>(null);
