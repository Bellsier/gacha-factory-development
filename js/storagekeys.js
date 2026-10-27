// Storage namespace shared by ordinary and trial saves.
const SAVE_KEY_DEFAULT = 'gachaFactorySave';
const SAVE_KEY_DEV_PREVIEW = 'gachaFactorySave.dev';
function saveKeyFor(loc){
  try{
    if(loc && /\.github\.io$/i.test(String(loc.hostname)) && /^\/gacha-factory-development(\/|$)/i.test(String(loc.pathname))) return SAVE_KEY_DEV_PREVIEW;
  }catch(e){ /* no usable location: the default key */ }
  return SAVE_KEY_DEFAULT;
}
