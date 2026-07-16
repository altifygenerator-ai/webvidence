import { ImageResponse } from 'next/og';

export const alt = 'Webvidence — find web design clients with real website evidence';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0b0e11', color: '#f4f6f7', position: 'relative', overflow: 'hidden', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, background: '#ff5b35' }} />
      <div style={{ width: '58%', padding: '76px 58px 60px 76px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 36, fontWeight: 900, letterSpacing: -1 }}>
          <span>WEB</span><span style={{ margin: '0 4px', padding: '5px 12px 8px', background: '#ff5b35', color: '#0b0e11' }}>V</span><span>IDENCE</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#8ce5eb', fontSize: 18, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 22 }}>Evidence-backed prospecting</div>
          <div style={{ fontSize: 68, lineHeight: .93, fontWeight: 900, letterSpacing: -3, textTransform: 'uppercase' }}>Stop pitching without proof.</div>
          <div style={{ color: '#b9c2ca', fontSize: 25, lineHeight: 1.35, marginTop: 26 }}>Find local businesses, inspect their websites, and know why they may need your work.</div>
        </div>
        <div style={{ fontSize: 18, color: '#909ba5' }}>www.webvidence.app</div>
      </div>
      <div style={{ width: '42%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12181e', borderLeft: '1px solid #2a323b' }}>
        <div style={{ width: 410, display: 'flex', flexDirection: 'column', background: '#f4f6f7', color: '#11161b', padding: 28, borderTop: '9px solid #ff5b35', boxShadow: '18px 18px 0 #252d35', transform: 'rotate(1deg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #11161b', paddingBottom: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ fontSize: 13, letterSpacing: 2 }}>OPPORTUNITY FILE</div><div style={{ fontSize: 36, fontWeight: 900, marginTop: 9 }}>LOCAL BUSINESS</div></div>
            <div style={{ width: 86, height: 86, border: '2px solid #11161b', borderRadius: 999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 38, fontWeight: 900 }}>91</div><div style={{ fontSize: 10 }}>SCORE</div></div>
          </div>
          {['No inquiry form detected', 'Weak mobile performance', 'No service page found'].map((item, index) => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #c6ccd1', padding: '18px 0', fontSize: 18 }}><span style={{ color: '#bd3619', fontWeight: 900, marginRight: 16 }}>0{index + 1}</span><span style={{ fontWeight: 700 }}>{item}</span></div>
          ))}
          <div style={{ marginTop: 20, padding: 15, background: '#e5e9ec', borderLeft: '5px solid #ff5b35', fontSize: 16 }}>A factual reason to start the conversation.</div>
        </div>
      </div>
    </div>,
    size,
  );
}
