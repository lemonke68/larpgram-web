import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({resolve:{alias:[
 {find:/^matrix-js-sdk\/lib\/matrixrtc$/,replacement:fileURLToPath(new URL('./src/matrixrtc-shim.ts',import.meta.url))},
]},server:{proxy:{
 '/account':{target:'https://push.mango-kokos.ru',changeOrigin:true},
 '/escrow':{target:'https://push.mango-kokos.ru',changeOrigin:true},
 '/_matrix':{target:'https://matrix.mango-kokos.ru',changeOrigin:true},
}},build:{target:'es2022'}});
