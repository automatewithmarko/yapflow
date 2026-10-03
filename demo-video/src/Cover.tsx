import {Backdrop, Brand, C, Fonts, Head, Mark, Notch, GmailLogo, WindowBar} from './design';
export const Cover = () => <Backdrop><Fonts/>
  <div style={{position:'absolute',left:100,top:80}}><Brand size={46}/></div>
  <div style={{position:'absolute',left:100,top:290}}><Head size={148}>Don’t type.<br/><span style={{color:C.blue}}>Just talk.</span></Head>
    <div style={{marginTop:45,fontSize:32,color:'#a7b8c9'}}>Free. Open source. 100% local.</div>
    <div style={{marginTop:65,display:'flex',alignItems:'center',gap:24}}><div style={{width:74,height:74,borderRadius:80,background:C.blue,display:'flex',alignItems:'center',justifyContent:'center',color:'#132d40',fontSize:35}}>▶</div><span style={{fontSize:32,fontWeight:650}}>Watch the 45-second film</span></div>
  </div>
  <div style={{position:'absolute',left:1010,top:225,width:810,height:610,background:'#dbe8f3',border:'5px solid #426379',borderRadius:25,overflow:'hidden',transform:'rotate(-3deg)',boxShadow:'0 25px 100px #0006'}}>
    <div style={{height:50,color:'#345268',fontSize:17,padding:'15px 20px',boxSizing:'border-box'}}>● &nbsp; Gmail &nbsp; File &nbsp; Edit</div>
    <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)'}}><Notch state="listening"/></div>
    <div style={{margin:'50px 35px 0',height:440,background:'white',borderRadius:14,overflow:'hidden',color:'#293847'}}><WindowBar title="Gmail · New message" light icon={<GmailLogo size={30}/>}/><div style={{padding:'30px 32px',fontSize:28,lineHeight:1.65}}><div style={{color:'#8b99a8',fontSize:21,borderBottom:'1px solid #e4eaf0',paddingBottom:15,marginBottom:24}}>To &nbsp; Alex · Friday’s launch</div>Hi Alex,<br/><br/>Let’s launch on Friday.<br/>The Supabase integration is ready.</div></div>
  </div>
  <div style={{position:'absolute',right:100,bottom:85,fontSize:30,color:C.blue}}>yapflow.app ↗</div>
</Backdrop>;
