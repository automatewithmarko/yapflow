import React from 'react';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  bg: '#050607',
  panel: '#101317',
  panel2: '#171b20',
  border: 'rgba(255,255,255,.10)',
  text: '#f8fbff',
  muted: '#8c98a8',
  blue: '#68c5ff',
  blue2: '#2da9ff',
  green: '#6be6a6',
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const WaveMark = ({size = 72}: {size?: number}) => (
  <div style={{width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: size * .055}}>
    {[.34, .62, .9, .58, .32].map((height, i) => (
      <div key={i} style={{width: size * .075, height: size * height, borderRadius: 99, background: '#fff'}} />
    ))}
  </div>
);

const Waveform = ({active = true, width = 120}: {active?: boolean; width?: number}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width}}>
      {Array.from({length: 11}).map((_, i) => {
        const h = active ? 12 + Math.abs(Math.sin(frame * .27 + i * .86)) * 34 : 10;
        return <div key={i} style={{width: 5, height: h, borderRadius: 8, background: i % 3 === 0 ? C.blue : '#fff'}} />;
      })}
    </div>
  );
};

const TopLabel = ({children}: {children: React.ReactNode}) => (
  <div style={{position: 'absolute', left: 78, top: 58, color: C.blue, textTransform: 'uppercase', letterSpacing: 4, fontSize: 20, fontWeight: 800}}>{children}</div>
);

const Caption = ({text}: {text: string}) => (
  <div style={{position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)', padding: '13px 22px', borderRadius: 18, background: 'rgba(6,8,11,.82)', border: `1px solid ${C.border}`, color: '#eaf4fb', fontSize: 23, letterSpacing: -.2, whiteSpace: 'nowrap', boxShadow: '0 12px 40px rgba(0,0,0,.35)'}}>{text}</div>
);

const Scene = ({children}: {children: React.ReactNode}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const opacity = interpolate(frame, [0, 12, durationInFrames - 14, durationInFrames], [0, 1, 1, 0], clamp);
  const scale = interpolate(frame, [0, durationInFrames], [1.015, 1], clamp);
  return <AbsoluteFill style={{opacity, transform: `scale(${scale})`, transformOrigin: 'center', background: C.bg, fontFamily: 'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif', color: C.text, overflow: 'hidden'}}>{children}</AbsoluteFill>;
};

const Glow = () => (
  <>
    <div style={{position: 'absolute', width: 740, height: 740, left: -260, top: -320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,169,255,.18), transparent 67%)'}} />
    <div style={{position: 'absolute', width: 900, height: 900, right: -420, bottom: -500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(104,197,255,.12), transparent 67%)'}} />
  </>
);

const Hero = () => {
  const frame = useCurrentFrame();
  const pop = spring({frame, fps: 30, config: {damping: 14, stiffness: 90}});
  const line = interpolate(frame, [18, 56], [0, 1], clamp);
  return <Scene><Glow />
    <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `translateY(${(1-pop)*35}px) scale(${.92 + pop*.08})`, opacity: pop}}>
      <div style={{width: 106, height: 106, borderRadius: 32, background: '#080a0d', border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', boxShadow: '0 0 90px rgba(45,169,255,.26)'}}><WaveMark size={58}/></div>
      <h1 style={{fontSize: 104, letterSpacing: -6, margin: '38px 0 4px', lineHeight: .98, textAlign: 'center'}}>Stop typing.<br/><span style={{color: C.blue}}>Start talking.</span></h1>
      <div style={{height: 3, width: 310 * line, margin: '30px 0', borderRadius: 9, background: `linear-gradient(90deg, transparent, ${C.blue}, transparent)`}} />
      <p style={{fontSize: 30, color: C.muted, margin: 0}}>Meet YapFlow · free, open source, 100% local</p>
    </div>
    <Caption text="Speak freely. Write clearly." />
  </Scene>;
};

const BrowserChrome = ({children, title = 'Inbox'}: {children: React.ReactNode; title?: string}) => (
  <div style={{width: 1530, height: 830, borderRadius: 30, background: '#f5f7fa', boxShadow: '0 35px 100px rgba(0,0,0,.52)', overflow: 'hidden', border: '1px solid rgba(255,255,255,.22)'}}>
    <div style={{height: 72, background: '#20242a', display: 'flex', alignItems: 'center', gap: 13, padding: '0 24px'}}>
      <i style={{width: 15,height:15,borderRadius:99,background:'#ff6a63'}}/><i style={{width:15,height:15,borderRadius:99,background:'#f5c451'}}/><i style={{width:15,height:15,borderRadius:99,background:'#64ce77'}}/>
      <div style={{height: 42, flex: 1, marginLeft: 24, background: '#111317', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 20px', color: '#9ea6b1', fontSize: 18}}>mail.google.com · {title}</div>
    </div>
    {children}
  </div>
);

const Notch = ({mode = 'listening', meeting = false}: {mode?: 'listening'|'idle'; meeting?: boolean}) => {
  const frame = useCurrentFrame();
  const w = meeting ? 650 : 360;
  return <div style={{position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: w, height: meeting ? 118 : 66, background: '#000', borderRadius: '0 0 34px 34px', boxShadow: meeting ? '0 12px 40px rgba(0,0,0,.5)' : '0 12px 35px rgba(0,0,0,.4)', transition: 'none', display: 'flex', alignItems: meeting ? 'flex-end' : 'center', justifyContent: 'space-between', padding: meeting ? '0 20px 18px' : '0 28px', boxSizing: 'border-box', zIndex: 20}}>
    {!meeting && <><WaveMark size={36}/><div style={{height: 28, width: 150, borderRadius: 18, background: '#060606'}}/><Waveform active={mode==='listening'} width={105}/></>}
    {meeting && <><Img src={staticFile('zoom.webp')} style={{width: 42, height: 42, objectFit: 'contain', borderRadius: 9}}/><strong style={{fontSize: 24, marginLeft: 12, marginRight: 'auto'}}>Meeting detected</strong><button style={{border: 0, background: '#30343a', color: '#fff', borderRadius: 14, padding: '14px 22px', fontSize: 20, fontWeight: 750}}>Start Recording</button><span style={{fontSize: 28, marginLeft: 18, color: '#aeb5bf'}}>×</span></>}
    {mode === 'listening' && !meeting && <div style={{position:'absolute',inset:'auto 38px 5px',height:2,background:`linear-gradient(90deg,transparent,rgba(104,197,255,${.45 + .35*Math.sin(frame*.2)}),transparent)`}}/>}
  </div>;
};

const Dictation = () => {
  const frame = useCurrentFrame();
  const body = 'Hey team,\n\nI’ve reviewed the launch plan and everything is ready for Friday. The revised onboarding flow is clearer, faster, and keeps every recording on-device.\n\nLet’s ship it.';
  const chars = Math.floor(interpolate(frame, [58, 224], [0, body.length], clamp));
  return <Scene><Glow/><TopLabel>Dictate anywhere</TopLabel>
    <div style={{position:'absolute', inset:'118px 0 0', display:'grid', placeItems:'center'}}>
      <BrowserChrome title="New message">
        <div style={{height: 758, display:'grid', gridTemplateColumns:'290px 1fr', color:'#1e2530'}}>
          <aside style={{padding:32, background:'#eef2f6', borderRight:'1px solid #dde3ea'}}>
            <div style={{display:'flex',alignItems:'center',gap:14,fontSize:24,fontWeight:800,marginBottom:35}}><div style={{width:43,height:33,borderRadius:8,background:'linear-gradient(135deg,#4285f4 0 25%,#34a853 25% 50%,#fbbc05 50% 75%,#ea4335 75%)'}}/>Gmail</div>
            <div style={{background:'#c9e7ff',padding:'17px 24px',borderRadius:18,fontWeight:750}}>＋ Compose</div>
          </aside>
          <main style={{padding:'50px 72px'}}>
            <div style={{fontSize:17,color:'#657083',borderBottom:'1px solid #dfe4eb',paddingBottom:16}}>To: team@yapflow.app</div>
            <div style={{fontSize:18,fontWeight:750,borderBottom:'1px solid #dfe4eb',padding:'18px 0'}}>Friday launch</div>
            <pre style={{fontFamily:'inherit',whiteSpace:'pre-wrap',fontSize:27,lineHeight:1.58,marginTop:32,color:'#202833'}}>{body.slice(0,chars)}<span style={{display:'inline-block',width:3,height:31,background:C.blue2,marginLeft:3,verticalAlign:'middle',opacity:frame%22<14?1:0}}/></pre>
          </main>
        </div>
      </BrowserChrome>
      <Notch mode="listening"/>
      <div style={{position:'absolute',right:115,bottom:76,display:'flex',alignItems:'center',gap:12,padding:'15px 19px',borderRadius:18,background:'#11161c',border:`1px solid ${C.border}`,boxShadow:'0 14px 40px rgba(0,0,0,.35)'}}><span style={{fontSize:17,color:C.muted}}>Hold to speak</span><kbd style={{padding:'8px 11px',borderRadius:9,background:'#252b33',color:'#fff',fontSize:17}}>⌘ ⇧ Space</kbd></div>
    </div>
    <Caption text="Hold your shortcut. Speak naturally. Watch polished text appear." />
  </Scene>;
};

const SmartWriting = () => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame,[35,65],[0,1],clamp);
  const corrected = interpolate(frame,[68,100],[0,1],clamp);
  const cards = [
    ['✦','Filler words','Removed automatically'],
    ['↩','Spoken corrections','Keeps what you meant'],
    ['Aa','Vocabulary','Supabase · YapFlow'],
    ['文','Languages','Auto-detected'],
  ];
  return <Scene><Glow/><TopLabel>Intelligent transcription</TopLabel>
    <div style={{position:'absolute',left:120,right:120,top:160,bottom:120,display:'grid',gridTemplateColumns:'1.1fr .9fr',gap:70,alignItems:'center'}}>
      <div>
        <h2 style={{fontSize:78,letterSpacing:-4,lineHeight:1.02,margin:'0 0 38px'}}>It writes what you <span style={{color:C.blue}}>mean.</span></h2>
        <div style={{padding:32,borderRadius:24,background:C.panel,border:`1px solid ${C.border}`,fontSize:31,lineHeight:1.5}}>
          <span style={{position:'relative',color:'#7f8996'}}>Send it on Thursday<span style={{position:'absolute',left:0,right:`${100-strike}%`,top:'52%',height:3,background:'#ff7474'}}/></span>
          <div style={{opacity:corrected,transform:`translateY(${(1-corrected)*12}px)`,color:'#fff',marginTop:14}}>Actually, send it on <strong style={{color:C.blue}}>Friday.</strong></div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>{cards.map(([icon,title,sub],i)=>{const p=spring({frame:frame-i*10,fps:30,config:{damping:18}});return <div key={title} style={{minHeight:170,padding:28,borderRadius:26,background:i===2?'linear-gradient(145deg,rgba(45,169,255,.23),#11151a)':C.panel,border:`1px solid ${i===2?'rgba(104,197,255,.42)':C.border}`,opacity:p,transform:`translateY(${(1-p)*30}px)`}}><div style={{fontSize:30,color:C.blue,fontWeight:850}}>{icon}</div><strong style={{display:'block',fontSize:23,marginTop:23}}>{title}</strong><span style={{display:'block',fontSize:17,color:C.muted,marginTop:9}}>{sub}</span></div>})}</div>
    </div>
    <Caption text="Corrections, vocabulary, filler cleanup, and multiple languages." />
  </Scene>;
};

const Person = ({name,color,delay}: {name:string;color:string;delay:number}) => {
  const frame=useCurrentFrame(); const talking=(frame+delay)%90<42;
  return <div style={{position:'relative',height:205,borderRadius:24,background:'#1b2026',border:`2px solid ${talking?color:'rgba(255,255,255,.08)'}`,display:'grid',placeItems:'center',boxShadow:talking?`0 0 0 5px ${color}22`:'none'}}><div style={{width:94,height:94,borderRadius:99,background:`linear-gradient(145deg,${color},#202934)`,display:'grid',placeItems:'center',fontSize:36,fontWeight:850}}>{name[0]}</div><span style={{position:'absolute',left:18,bottom:15,fontSize:18,fontWeight:750}}>{name}</span><span style={{position:'absolute',right:16,bottom:14,fontSize:16,color:talking?C.green:'#8e98a5'}}>{talking?'● speaking':'◉'}</span></div>;
};

const Meetings = () => {
  const frame=useCurrentFrame();
  return <Scene><Glow/><TopLabel>Meetings, remembered</TopLabel>
    <div style={{position:'absolute',left:95,right:95,top:126,bottom:92,display:'grid',gridTemplateColumns:'1.15fr .85fr',gap:28}}>
      <div style={{borderRadius:30,background:'#111418',border:`1px solid ${C.border}`,padding:24,boxShadow:'0 30px 90px rgba(0,0,0,.42)'}}>
        <div style={{height:52,display:'flex',alignItems:'center',gap:12,fontSize:21,fontWeight:800}}><Img src={staticFile('zoom.webp')} style={{width:36,height:36,objectFit:'contain'}}/>Zoom Meeting <span style={{marginLeft:'auto',color:'#9ba5b2',fontSize:16}}>00:{String(Math.floor(frame/30)+12).padStart(2,'0')}</span></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:14}}><Person name="Avery" color="#6bbdff" delay={0}/><Person name="Jordan" color="#b08cff" delay={34}/><Person name="Maya" color="#f4a261" delay={62}/><Person name="You" color="#63dfa0" delay={80}/></div>
        <div style={{display:'flex',justifyContent:'center',gap:16,marginTop:25}}>{['◉','⌁','▣','•••','Leave'].map((x,i)=><span key={x} style={{padding:i===4?'12px 25px':'12px 16px',borderRadius:13,background:i===4?'#d74f4f':'#262b32',fontSize:17,fontWeight:700}}>{x}</span>)}</div>
      </div>
      <div style={{borderRadius:30,background:C.panel,border:`1px solid ${C.border}`,padding:'34px 30px'}}>
        <div style={{display:'flex',alignItems:'center'}}><div><div style={{fontSize:15,color:C.blue,textTransform:'uppercase',letterSpacing:2,fontWeight:800}}>Local recording</div><h3 style={{fontSize:34,margin:'8px 0'}}>Both sides captured</h3></div><div style={{marginLeft:'auto',color:'#ff7474',fontWeight:800}}>● REC</div></div>
        <div style={{marginTop:38,display:'grid',gap:22}}>{[['Microphone','Your voice','#6bbdff'],['System audio','Everyone else','#b08cff']].map(([source,detail,color],i)=>{const p=spring({frame:frame-22-i*25,fps:30,config:{damping:18}});return <div key={source} style={{opacity:p,transform:`translateY(${(1-p)*16}px)`,padding:'24px 22px',borderRadius:19,background:'#191e24',border:`1px solid ${color}44`}}><div style={{display:'flex',alignItems:'center'}}><div><strong style={{fontSize:20,color}}>{source}</strong><span style={{display:'block',fontSize:16,color:C.muted,marginTop:5}}>{detail}</span></div><div style={{marginLeft:'auto'}}><Waveform width={180}/></div></div></div>})}</div>
        <div style={{marginTop:29,padding:19,borderRadius:15,background:'rgba(104,197,255,.09)',color:'#bfe7ff',fontSize:18}}>One private recording · stored only on this device</div>
      </div>
      <Notch meeting={frame<125}/>
    </div>
    <Caption text="Zoom and Google Meet. Microphone and system audio captured locally." />
  </Scene>;
};

const AppShell = ({children,active='Meeting history'}:{children:React.ReactNode;active?:string}) => (
  <div style={{width:1580,height:850,borderRadius:32,overflow:'hidden',background:'#0b0d10',border:`1px solid ${C.border}`,boxShadow:'0 40px 120px rgba(0,0,0,.48)',display:'grid',gridTemplateColumns:'290px 1fr'}}>
    <aside style={{padding:'34px 24px',background:'#080a0c',borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column'}}><div style={{display:'flex',alignItems:'center',gap:14,fontSize:25,fontWeight:850,margin:'0 10px 35px'}}><WaveMark size={39}/>YapFlow</div>{['⌂  Home','◉  Meeting history','≡  Speech history','Aa  Vocabulary','文  Languages'].map(x=>{const label=x.slice(3);return <div key={x} style={{padding:'15px 17px',marginBottom:6,borderRadius:13,background:label===active?'#1b222a':'transparent',color:label===active?'#fff':'#8d98a6',fontSize:18,fontWeight:label===active?750:550}}>{x}</div>})}<div style={{marginTop:'auto',padding:'15px 17px',color:'#8d98a6',fontSize:18}}>⚙  Settings</div></aside>
    <main style={{padding:'48px 54px',overflow:'hidden'}}>{children}</main>
  </div>
);

const History = () => {
  const frame=useCurrentFrame(); const open=frame>100;
  return <Scene><Glow/><TopLabel>Your conversation library</TopLabel><div style={{position:'absolute',inset:'120px 0 75px',display:'grid',placeItems:'center'}}><AppShell>
    {!open ? <><div style={{fontSize:14,color:C.blue,letterSpacing:2,fontWeight:800}}>LIBRARY</div><h2 style={{fontSize:48,margin:'10px 0 8px'}}>Meeting history</h2><p style={{fontSize:20,color:C.muted,marginTop:0}}>Your local Zoom and Google Meet recordings.</p><div style={{marginTop:34,display:'grid',gap:13}}>{[['zoom.webp','Zoom · October 3, 2026','Friday launch planning'],['google-meet.webp','Google Meet · October 2, 2026','Product review'],['zoom.webp','Zoom · September 30, 2026','Customer interviews']].map(([img,date,title],i)=><div key={date} style={{display:'flex',alignItems:'center',gap:19,padding:'21px 24px',borderRadius:18,background:i===0?'#19212a':C.panel,border:`1px solid ${i===0?'rgba(104,197,255,.35)':C.border}`,transform:i===0&&frame>70?`scale(${1+.012*Math.sin((frame-70)*.13)})`:'none'}}><Img src={staticFile(img)} style={{width:45,height:45,objectFit:'contain',borderRadius:10}}/><div><small style={{color:C.muted,fontSize:15}}>{date}</small><p style={{margin:'7px 0 0',fontSize:22,fontWeight:750}}>{title}</p></div><span style={{marginLeft:'auto',fontSize:28,color:'#8190a0'}}>›</span></div>)}</div></> : <><div style={{fontSize:18,color:C.blue}}>← Meeting history</div><div style={{display:'flex',alignItems:'center',gap:18,marginTop:26}}><Img src={staticFile('zoom.webp')} style={{width:57,height:57,objectFit:'contain',borderRadius:12}}/><div><h2 style={{fontSize:39,margin:0}}>Friday launch planning</h2><p style={{color:C.muted,fontSize:17,margin:'6px 0 0'}}>Zoom · October 3, 2026 · 28 minutes</p></div><button style={{marginLeft:'auto',padding:'14px 20px',borderRadius:13,border:0,background:C.blue2,color:'#071018',fontSize:17,fontWeight:800}}>▶ Play recording</button></div><div style={{marginTop:30,padding:32,borderRadius:22,background:C.panel,border:`1px solid ${C.border}`}}><div style={{display:'flex',alignItems:'center',gap:22}}><button style={{width:58,height:58,borderRadius:99,border:0,background:C.blue2,color:'#071018',fontSize:22}}>▶</button><div style={{flex:1}}><div style={{height:54,display:'flex',alignItems:'center',gap:7}}>{Array.from({length:44}).map((_,i)=><span key={i} style={{width:5,height:10+Math.abs(Math.sin(i*.81))*35,borderRadius:5,background:i<17?C.blue:'#34404c'}}/>)}</div><div style={{display:'flex',justifyContent:'space-between',fontSize:15,color:C.muted}}><span>09:42</span><span>28:16</span></div></div></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:28}}><div style={{padding:18,borderRadius:15,background:'#191e24',color:'#ccecff'}}>◉ Microphone captured</div><div style={{padding:18,borderRadius:15,background:'#191e24',color:'#ddceff'}}>◉ System audio captured</div></div></div></>}
  </AppShell></div><Caption text="Every recording stays organized on your device." /></Scene>;
};

const Privacy = () => {
  const frame=useCurrentFrame();
  const items=['Voice','Transcripts','Vocabulary','Recordings'];
  return <Scene><Glow/><TopLabel>Private by design</TopLabel>
    <div style={{position:'absolute',inset:'140px 100px 105px',display:'grid',gridTemplateColumns:'1fr 1fr',alignItems:'center',gap:100}}>
      <div><h2 style={{fontSize:82,letterSpacing:-4,lineHeight:1.02,margin:0}}>Your voice<br/><span style={{color:C.blue}}>stays yours.</span></h2><p style={{fontSize:27,lineHeight:1.55,color:C.muted,maxWidth:700}}>Transcription runs locally. No cloud processing. No subscription. You own the code and the data.</p><div style={{display:'flex',gap:12,marginTop:34}}>{['100% local','Open source','Free forever'].map(x=><span key={x} style={{padding:'12px 17px',borderRadius:99,background:'rgba(104,197,255,.1)',border:'1px solid rgba(104,197,255,.28)',color:'#c9ecff',fontSize:17,fontWeight:750}}>{x}</span>)}</div></div>
      <div style={{position:'relative',height:650,display:'grid',placeItems:'center'}}>
        {items.map((x,i)=>{const a=(i/4)*Math.PI*2+frame*.003; const r=235; const p=spring({frame:frame-i*10,fps:30,config:{damping:20}});return <div key={x} style={{position:'absolute',left:`calc(50% + ${Math.cos(a)*r}px - 83px)`,top:`calc(50% + ${Math.sin(a)*r}px - 38px)`,width:166,padding:'17px 0',textAlign:'center',borderRadius:16,background:C.panel,border:`1px solid ${C.border}`,fontSize:17,color:'#dce8f2',opacity:p}}>{x}</div>})}
        <div style={{width:260,height:340,borderRadius:42,background:'linear-gradient(155deg,#1a222a,#090b0e)',border:'2px solid rgba(104,197,255,.46)',boxShadow:'0 0 100px rgba(45,169,255,.24)',display:'grid',placeItems:'center'}}><div style={{textAlign:'center'}}><WaveMark size={82}/><strong style={{display:'block',fontSize:26,marginTop:18}}>On this device</strong><span style={{display:'block',color:C.green,fontSize:17,marginTop:9}}>● Protected locally</span></div></div>
      </div>
    </div><Caption text="No cloud processing. No subscriptions. Your data stays yours." /></Scene>;
};

const EndCard = () => {
  const frame=useCurrentFrame(); const p=spring({frame,fps:30,config:{damping:15,stiffness:85}});
  return <Scene><Glow/><div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:p,transform:`scale(${.9+p*.1})`}}><div style={{width:100,height:100,borderRadius:30,background:'#0a0c0f',border:`1px solid ${C.border}`,display:'grid',placeItems:'center',boxShadow:'0 0 90px rgba(45,169,255,.28)'}}><WaveMark size={56}/></div><h1 style={{fontSize:112,letterSpacing:-6,margin:'26px 0 4px'}}>Yap<span style={{color:C.blue}}>Flow</span></h1><p style={{fontSize:33,color:'#dce8f2',margin:'8px 0 40px'}}>Speak freely. Write clearly.</p><div style={{display:'flex',gap:16}}><span style={{padding:'16px 25px',borderRadius:15,background:C.blue2,color:'#06111a',fontSize:20,fontWeight:850}}>Download free</span><span style={{padding:'16px 25px',borderRadius:15,border:`1px solid ${C.border}`,fontSize:20,fontWeight:750}}>Star on GitHub ★</span></div><div style={{marginTop:30,color:C.muted,fontSize:19}}>yapflow.app</div></div></Scene>;
};

export const YapFlowLaunch = () => (
  <AbsoluteFill style={{background:C.bg}}>
    <Audio src={staticFile('music.mp3')} volume={f => interpolate(f,[0,35,1370,1499],[0,.115,.115,0],clamp)} />
    <Sequence from={30}><Audio src={staticFile('voiceover.mp3')} volume={1} /></Sequence>
    {[55,170,348,610,905,1148,1355].map(f=><Sequence key={f} from={f} durationInFrames={32}><Audio src={staticFile('activate.mp3')} volume={.28}/></Sequence>)}
    <Sequence from={0} durationInFrames={165}><Hero/></Sequence>
    <Sequence from={145} durationInFrames={255}><Dictation/></Sequence>
    <Sequence from={380} durationInFrames={250}><SmartWriting/></Sequence>
    <Sequence from={610} durationInFrames={320}><Meetings/></Sequence>
    <Sequence from={910} durationInFrames={260}><History/></Sequence>
    <Sequence from={1150} durationInFrames={235}><Privacy/></Sequence>
    <Sequence from={1365} durationInFrames={135}><EndCard/></Sequence>
  </AbsoluteFill>
);
