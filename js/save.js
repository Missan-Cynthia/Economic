(function(root){
 const key='miss-an-finance-game-v1';let error='';
 const api={read(){try{const s=localStorage.getItem(key);return s?JSON.parse(s):null;}catch(e){error='存檔無法讀取：'+e.message;return null;}},write(s){try{localStorage.setItem(key,JSON.stringify(s));error='';return true;}catch(e){error='無法自動存檔，請檢查瀏覽器儲存空間／隱私設定。';return false;}},get error(){return error;},key};root.GameSave=api;
})(globalThis);
