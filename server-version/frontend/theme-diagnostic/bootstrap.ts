import '@source/index.css'
async function start(){
 const entry=new URLSearchParams(location.search).get('entry')==='school'?await import('./school-css'):await import('./teacher-css')
 await entry.loadEntryCss()
 await import('./main')
}
void start()
