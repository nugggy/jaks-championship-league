import sharp from 'sharp';

const fg = (size, pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <g transform="translate(512 512) scale(${1 - pad}) translate(-512 -512)">
    <path d="M250 760 C 330 520, 560 640, 700 380" fill="none" stroke="#c6f432" stroke-width="54" stroke-linecap="round" stroke-dasharray="1 96"/>
    <path d="M640 330 L 760 330 L 730 450" fill="none" stroke="#c6f432" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="300" cy="700" r="150" fill="#ffffff"/>
    <path d="M300 615 l64 46 -24 76 h-80 l-24 -76z" fill="#0b2545"/>
    <path d="M300 615 v-62 M364 661 l58 -20 M340 737 l38 52 M260 737 l-38 52 M236 661 l-58 -20" stroke="#0b2545" stroke-width="16" stroke-linecap="round"/>
  </g>
</svg>`;
const bg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs><radialGradient id="g" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#1b4f8a"/><stop offset="1" stop-color="#07111f"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-opacity="0.08" stroke-width="10" fill="none"><circle cx="512" cy="512" r="250"/><line x1="0" y1="512" x2="1024" y2="512"/></g>
</svg>`;
const splash = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#07111f"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${h * 0.045}" letter-spacing="${h * 0.012}" fill="#c6f432">JAK'S</text>
  <text x="50%" y="55%" text-anchor="middle" font-family="Arial Narrow, Arial, sans-serif" font-weight="800" font-size="${h * 0.09}" fill="#ffffff">CHAMPIONSHIP LEAGUE</text>
</svg>`;

await sharp(Buffer.from(bg(1024))).composite([{ input: Buffer.from(fg(1024, 0.1)) }]).png().toFile('assets/icon-only.png');
await sharp(Buffer.from(fg(1024, 0.38))).png().toFile('assets/icon-foreground.png');
await sharp(Buffer.from(bg(1024))).png().toFile('assets/icon-background.png');
await sharp(Buffer.from(splash(2732, 2732))).png().toFile('assets/splash.png');
await sharp(Buffer.from(splash(2732, 2732))).png().toFile('assets/splash-dark.png');
console.log('icons written');
