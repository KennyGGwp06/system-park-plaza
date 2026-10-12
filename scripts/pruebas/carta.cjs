const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto'),puppeteer=require('puppeteer-core');
const WEB=process.env.WEB || 'http://localhost:4173';
const bases=process.argv.slice(2);
if(!bases.length) bases.push(WEB,process.env.BASE || 'http://localhost:5173');
fs.mkdirSync('scripts/pruebas/capturas/carta',{recursive:true});
(async()=>{
 const manifest=JSON.parse(fs.readFileSync('server/data/menu-image-manifest.json'));
 for(const base of bases){
  for(const image of manifest.images){ const response=await fetch(new URL(image.url,base)); assert.equal(response.status,200); const bytes=Buffer.from(await response.arrayBuffer()); assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),image.sha256,image.name); }
  console.log(`OK ${base}: 91 imágenes servidas coinciden con SHA256`);
 }
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage(); await page.setViewport({width,height:900}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   await page.goto(WEB,{waitUntil:'networkidle2'}); await page.click('.pp-go'); await page.waitForSelector('[data-a="carta"]'); await new Promise(r=>setTimeout(r,1200)); await page.click('[data-a="carta"]'); await page.waitForSelector('body[data-screen="carta"] .dish');
   await new Promise(r=>setTimeout(r,1300));
   assert.equal(await page.$$eval('.dish',els=>els.length),91); assert.equal(await page.$$eval('.dish img',els=>els.length),91);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false); assert.deepEqual(errors,[]);
   await page.screenshot({path:`scripts/pruebas/capturas/carta/${width}.png`,fullPage:false});
   await page.click('[data-a="carta-volver"]'); await page.waitForSelector('[data-a="carta"]');
   console.log(`OK: carta ${width}px, 91 productos, 91 fotos, sin desborde ni errores y regreso funcional`); await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
