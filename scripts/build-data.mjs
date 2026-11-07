// data/*.json → assets/js/data.js
// 파일을 더블클릭해 열어도(file://) 검사가 동작하도록 문구 데이터를 스크립트 하나로 묶습니다.
// data/*.json 을 고친 뒤에는 반드시 `npm run data` 를 실행하세요.
import { readFileSync, writeFileSync } from 'node:fs';

const names = ['items', 'areas', 'combos', 'couple', 'shapes', 'copy', 'config'];
const data = Object.fromEntries(names.map(n => [n, JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'))]));
const out = `// 자동 생성 파일 — 직접 고치지 말고 data/*.json 수정 후 \`npm run data\` 실행\nwindow.SIWOL_DATA = ${JSON.stringify(data)};\n`;
writeFileSync(new URL('../assets/js/data.js', import.meta.url), out);
console.log('assets/js/data.js 생성:', names.join(', '));
