const SESSION_KEY='sahod.google.session.v1';

function decodeBase64Url(value){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  return decodeURIComponent(Array.from(atob(padded),c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
}

export function readGoogleSession(){
  try{
    const raw=localStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    const user=JSON.parse(raw);
    if(user.exp&&Date.now()/1000>=user.exp){localStorage.removeItem(SESSION_KEY);return null}
    return user;
  }catch{return null}
}

export function clearGoogleSession(){
  localStorage.removeItem(SESSION_KEY);
  try{window.google?.accounts?.id?.disableAutoSelect()}catch{}
}

export function userFromCredential(credential){
  const parts=String(credential||'').split('.');
  if(parts.length<2)throw Error('Google did not return a valid identity credential.');
  const payload=JSON.parse(decodeBase64Url(parts[1]));
  if(!payload.email)throw Error('Google account email was not returned.');
  return {sub:payload.sub,email:payload.email,name:payload.name||payload.email,picture:payload.picture||'',exp:payload.exp||0,credential};
}

export function saveGoogleSession(user){
  const safe={sub:user.sub,email:user.email,name:user.name,picture:user.picture,exp:user.exp};
  localStorage.setItem(SESSION_KEY,JSON.stringify(safe));
  return safe;
}

function waitForGoogle(timeout=8000){
  return new Promise((resolve,reject)=>{
    if(window.google?.accounts?.id)return resolve(window.google);
    const started=Date.now();
    const timer=setInterval(()=>{
      if(window.google?.accounts?.id){clearInterval(timer);resolve(window.google)}
      else if(Date.now()-started>timeout){clearInterval(timer);reject(Error('Google Identity Services could not load. Check the internet connection and authorized origins.'))}
    },100);
  });
}

export async function renderGoogleButton(container,clientId,onSignedIn){
  if(!container)return;
  container.innerHTML='';
  if(!clientId){container.innerHTML='<div class="auth-config-note">Add a Google OAuth Client ID in Settings → Access & QR to enable Google sign in.</div>';return}
  const google=await waitForGoogle();
  google.accounts.id.initialize({client_id:clientId,callback:response=>{
    try{const user=saveGoogleSession(userFromCredential(response.credential));onSignedIn?.(user)}catch(error){onSignedIn?.(null,error)}
  },auto_select:false,cancel_on_tap_outside:false});
  google.accounts.id.renderButton(container,{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:320,logo_alignment:'left'});
}
