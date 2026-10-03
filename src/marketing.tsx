import { useEffect, useRef, useState } from 'react';
import {
  Apple, ArrowRight, AudioLines, Bot, Check, ChevronDown, Code2,
  CloudOff, Copy, Download, FileText, HardDrive, Languages, LockKeyhole,
  MessageSquareText, Mic2, MonitorDown, MousePointer2, Search, Sparkles,
  Users, Video, WifiOff
} from 'lucide-react';
import './marketing.css';

const FALLBACK_DOWNLOADS = {
  mac: 'https://github.com/automatewithmarko/yapflow-releases/releases/download/v0.2.7/YapFlow_0.2.7_aarch64.dmg',
  windows: 'https://github.com/automatewithmarko/yapflow-releases/releases/download/v0.2.7/YapFlow_0.2.7_x64-setup.exe'
};

function Mark() {
  return <img src="/yapflow-mark.svg" alt="" />;
}

function GmailMark() {
  return <svg className="gmail-mark" viewBox="0 0 24 18" aria-hidden="true"><path fill="#4285F4" d="M2 18h4V7.5L2 4.5z"/><path fill="#34A853" d="M18 18h4V4.5l-4 3z"/><path fill="#FBBC04" d="M2 4.5V3C2 1.3 3.9.4 5.2 1.4L12 6.5 18.8 1.4C20.1.4 22 1.3 22 3v1.5l-4 3V6L12 10.5 6 6v1.5z"/><path fill="#EA4335" d="M6 7.5 2 4.5V3c0-1.7 1.9-2.6 3.2-1.6L12 6.5 18.8 1.4C20.1.4 22 1.3 22 3v1.5l-4 3V6l-6 4.5L6 6z"/></svg>;
}

function DownloadMenu({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [downloads, setDownloads] = useState(FALLBACK_DOWNLOADS);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    let disposed = false;
    void fetch('/api/releases/latest', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Release feed unavailable')))
      .then(release => {
        if (!disposed && release?.downloads?.mac && release?.downloads?.windows) {
          setDownloads({ mac: release.downloads.mac, windows: release.downloads.windows });
        }
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, []);
  return <div className={`mk-download ${compact ? 'compact' : ''}`} ref={menu}>
    <button aria-expanded={open} onClick={() => setOpen(value => !value)}><Download/>Download YapFlow<ChevronDown/></button>
    {open && <div className="mk-download-menu">
      <a href={downloads.mac}><Apple/><span><strong>Download for Mac</strong><small>Apple silicon · macOS 13+</small></span></a>
      <a href={downloads.windows}><MonitorDown/><span><strong>Download for Windows</strong><small>64-bit · Windows 10+</small></span></a>
    </div>}
  </div>;
}

function Wave() {
  return <span className="mk-wave" aria-hidden="true">{[8, 16, 26, 14, 31, 21, 11, 24, 15, 7].map((height, index) => <i key={index} style={{ height }}/>)}</span>;
}

function FeatureVisual({ number }: { number: string }) {
  if (number === '01') return <div className="mk-feature-scene scene-talk" aria-hidden="true">
    <div className="scene-shortcut"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Space</kbd></div>
    <div className="scene-listening"><Mic2/><Wave/><span>Listening</span></div>
    <div className="scene-output"><GmailMark/><span>Can we move the launch to Monday?</span><i/></div>
  </div>;
  if (number === '02') return <div className="mk-feature-scene scene-cleanup" aria-hidden="true">
    <div className="scene-before"><small>YOU SAID</small><span>Um, send it Tuesday, no, Monday.</span></div>
    <ArrowRight/>
    <div className="scene-after"><Sparkles/><small>YAPFLOW WROTE</small><strong>Send it Monday.</strong></div>
  </div>;
  if (number === '03') return <div className="mk-feature-scene scene-meeting" aria-hidden="true">
    <div className="scene-meeting-top"><img src="/provider-logos/google-meet.webp" alt=""/><span>Recording meeting</span><b>REC</b></div>
    <div className="scene-speakers"><span><b>1</b><i/></span><span><b>2</b><i/></span><span><b>3</b><i/></span></div>
    <div className="scene-audio"><Mic2/>Mic<AudioLines/>System audio</div>
  </div>;
  if (number === '04') return <div className="mk-feature-scene scene-history" aria-hidden="true">
    <div className="scene-search"><Search/><span>Search history</span></div>
    <div className="scene-history-row"><span><b>Today, 10:42</b><small>Send the proposal by Friday...</small></span><Copy/></div>
    <div className="scene-history-row"><span><b>Zoom, Sep 28</b><small>Maya: Let’s ship Monday...</small></span><Copy/></div>
  </div>;
  if (number === '05') return <div className="mk-feature-scene scene-vocabulary" aria-hidden="true">
    <div className="scene-heard"><small>HEARD</small><span>super base</span></div>
    <ArrowRight/>
    <div className="scene-word"><small>YOUR VOCABULARY</small><strong>Supabase</strong><Check/></div>
  </div>;
  return <div className="mk-feature-scene scene-local" aria-hidden="true">
    <div className="scene-device"><HardDrive/><strong>On your device</strong><span>Models · Audio · History</span></div>
    <div className="scene-blocked"><CloudOff/><span>Nothing uploaded</span></div>
  </div>;
}

export function MarketingSite() {
  useEffect(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: .14 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return <div className="marketing-site">
    <header className="mk-sticky-header">
      <div className="mk-announcement"><span>YapFlow is free, local, and yours.</span><a href="#privacy">See how privacy works <ArrowRight/></a></div>
      <nav className="mk-nav">
        <a className="mk-brand" href="#top"><Mark/><strong>YapFlow</strong></a>
        <div className="mk-links"><a href="#dictation">Dictation</a><a href="#meetings">Meetings</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a></div>
        <DownloadMenu compact/>
      </nav>
    </header>

    <main id="top">
      <section className="mk-hero" data-reveal>
        <h1><span>Don’t type, just talk.</span><em>100% local.</em></h1>
        <p>YapFlow turns your voice into polished writing and speaker-aware meeting transcripts entirely on your device. Nothing you say is uploaded or used to train a model. <strong>Your data stays safe. Your voice stays yours.</strong></p>
        <div className="mk-hero-actions"><DownloadMenu/><a href="#product">See it in action <ArrowRight/></a></div>
        <div className="mk-proof"><span><Check/>100% free</span><span><Check/>100% local</span><span><Check/>No account</span><span><Check/>Mac & Windows</span></div>
      </section>

      <section className="mk-product" id="product" data-reveal>
        <div className="mk-window-bar"><div><i/><i/><i/></div><span>YapFlow</span><small>Everything stays on this device</small></div>
        <div className="mk-product-grid">
          <article className="mk-dictation-demo">
            <div className="mk-card-label"><Mic2/>VOICE TO TEXT <span className="mk-app-badge"><GmailMark/>Gmail</span></div>
            <div className="mk-raw">Um, can you tell the team, no, actually tell Sarah, that the launch is moving to Monday because legal still needs to approve it.</div>
            <div className="mk-clean"><Sparkles/><p>Tell Sarah the launch is moving to Monday because legal still needs to approve it.</p></div>
            <div className="mk-notching"><Mark/><span>Listening</span><Wave/><kbd>⌘ ⇧ Space</kbd></div>
          </article>
          <article className="mk-meeting-demo">
            <div className="mk-card-label"><Video/>MEETING NOTES <span className="mk-app-badge"><img src="/provider-logos/google-meet.webp" alt=""/>Google Meet</span></div>
            <div className="mk-speaker"><b>01</b><div><strong>You</strong><p>Let’s move the launch to Monday and give legal another day.</p></div></div>
            <div className="mk-speaker"><b>02</b><div><strong>Maya</strong><p>Works for me. I’ll update the project timeline after this call.</p></div></div>
            <div className="mk-speaker"><b>03</b><div><strong>Daniel</strong><p>I’ll send the revised announcement to the team this afternoon.</p></div></div>
            <div className="mk-speaker"><b>01</b><div><strong>You</strong><p>Perfect. Let’s review the final version tomorrow morning.</p></div></div>
          </article>
        </div>
      </section>

      <section className="mk-stats" data-reveal><div><strong>$0</strong><span>forever</span></div><div><strong>100+</strong><span>languages</span></div><div><strong>1</strong><span>shortcut away</span></div><div><strong>0</strong><span>cloud uploads</span></div></section>

      <section className="mk-split" id="dictation" data-reveal>
        <div className="mk-copy"><span className="mk-kicker">WRITE AT THE SPEED OF THOUGHT</span><h2>Speak freely.<br/><em>Write clearly.</em></h2><p>Talk naturally with pauses, corrections, repeated words and all. YapFlow turns the thought into clean text and puts it where your cursor already is.</p><ul><li><Sparkles/>Cleans filler words and spoken corrections</li><li><MousePointer2/>Works in every text field and app</li><li><Languages/>Automatically detects your language</li><li><Code2/>Formats messages, email, documents and code</li></ul></div>
        <div className="mk-orbit"><div className="mk-orbit-center"><Mark/><Wave/></div>{[[MessageSquareText,'Messages'],[Bot,'AI'],[Code2,'Code'],[FileText,'Docs']].map(([Icon,label], index) => { const ItemIcon = Icon as typeof Bot; return <span className={`orbit-${index + 1}`} key={label as string}><ItemIcon/>{label as string}</span>; })}</div>
      </section>

      <section className="mk-split reverse" id="meetings" data-reveal>
        <div className="mk-meeting-visual"><div className="mk-detected"><Video/><div><small>MEETING DETECTED</small><strong>Ready when you are</strong></div><button>Start recording</button></div><div className="mk-transcript-lines"><span><b>1</b><i/></span><span><b>2</b><i/></span><span><b>1</b><i/></span><span><b>3</b><i/></span></div><div className="mk-platforms"><span>Zoom</span><span>Google Meet</span><span>Teams</span><span>Any meeting app</span></div></div>
        <div className="mk-copy"><span className="mk-kicker">MEETINGS WITHOUT A BOT</span><h2>Stay present.<br/><em>Keep every word.</em></h2><p>YapFlow recognizes real Zoom and Google Meet calls, records microphone and system audio, and keeps speaker-separated transcripts in your meeting history.</p><ul><li><Users/>Labels different speakers</li><li><AudioLines/>Captures mic and system audio</li><li><Video/>Detects real calls, not merely open apps</li><li><LockKeyhole/>No recording bot joins the room</li></ul></div>
      </section>

      <section className="mk-privacy" id="privacy" data-reveal>
        <div className="mk-privacy-copy"><span className="mk-kicker">PRIVATE BY ARCHITECTURE</span><h2>Your voice stays <em>yours.</em></h2><p>Transcription happens locally. Recordings, vocabulary, history, and models live on your device. There is no account, no subscription, and no cloud copy of your conversations.</p></div>
        <div className="mk-privacy-demo">
          <div className="privacy-input"><Mic2/><Wave/><span>Your voice</span></div>
          <ArrowRight className="privacy-arrow"/>
          <div className="privacy-laptop"><div className="privacy-screen"><Mark/><b>Processed locally</b><small>Audio never leaves this Mac</small><span><i/>Transcribing on device</span></div><div className="privacy-base"/></div>
          <div className="privacy-result"><FileText/><span><small>YOUR WORDS</small><strong>Ready to paste</strong></span><Check/></div>
          <div className="privacy-no-cloud"><CloudOff/><span>No cloud copy</span></div>
          <div className="privacy-badges"><span><LockKeyhole/>You own it</span><span><WifiOff/>Works offline</span><span><strong>$0</strong> forever</span></div>
        </div>
      </section>

      <section className="mk-features" data-reveal><span className="mk-kicker">ONE APP, BOTH SIDES OF YOUR VOICE</span><h2>From a passing thought<br/>to a finished record.</h2><div>{[
        ['01','Talk anywhere','Use a keyboard or mouse shortcut and speak into any application.'],
        ['02','Write intelligently','YapFlow removes false starts and adapts formatting to your current app.'],
        ['03','Capture meetings','Record system audio and microphone without adding a meeting bot.'],
        ['04','Find it later','Speech and meeting history stay organized and ready to copy.'],
        ['05','Teach your words','Personal vocabulary keeps names, brands, and technical terms correct.'],
        ['06','Own the whole thing','Your models and data stay local, without a recurring bill.']
      ].map(([number,title,body]) => <article key={number}><span>{number}</span><FeatureVisual number={number}/><strong>{title}</strong><p>{body}</p></article>)}</div></section>

      <section className="mk-faq" id="faq" data-reveal><div><span className="mk-kicker">GOOD QUESTIONS</span><h2>Simple answers.</h2></div><div>{[
        ['Is YapFlow really free?','Yes. There are no usage limits, paid plans, or subscriptions.'],
        ['Does my audio leave my computer?','No. Dictation and meeting transcription run locally with models stored on your device.'],
        ['Where can I dictate?','Anywhere you can place a text cursor: email, messages, documents, browsers, code editors, and AI tools.'],
        ['Which meetings work?','YapFlow detects Zoom and Google Meet and records microphone plus system audio.'],
        ['Does it support other languages?','Yes. YapFlow supports more than 100 languages with automatic language detection.'],
        ['Who owns my transcripts?','You do. They remain in local app storage under your control.']
      ].map(([question,answer]) => <details key={question}><summary>{question}<ChevronDown/></summary><p>{answer}</p></details>)}</div></section>

      <section className="mk-final"><Mark/><h2>Your voice already knows<br/>what you want to say.</h2><p>Let YapFlow handle the typing and the notes.</p><DownloadMenu/></section>
    </main>

    <footer><a className="mk-brand" href="#top"><Mark/><strong>YapFlow</strong></a><p>Free, private voice writing and meeting notes.<br/>Built to run on your computer.</p><div className="mk-footer-meta"><a className="mk-powerbrix" href="https://powerbrix.ai" target="_blank" rel="noreferrer"><img src="/powerbrix-logo.png" alt="PowerBrix"/><span>Product of PowerBrix</span></a><span>© 2026 YapFlow</span></div></footer>
  </div>;
}
