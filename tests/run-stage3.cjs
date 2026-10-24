const fs=require('node:fs');let failed=0,total=0;
function check(name,ok,detail){total++;if(!ok)failed++;console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+detail:''));}
new Function('require','__dirname','check',fs.readFileSync(__dirname+'/chunks/20.js','utf8'))(require,__dirname,check);
console.log({total,failed});process.exitCode=failed?1:0;
