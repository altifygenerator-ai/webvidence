import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11', borderRadius: 34 }}>
      <div style={{ width: 106, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ff5b35', color: '#0b0e11', fontSize: 88, fontWeight: 900, clipPath: 'polygon(0 0, 100% 0, 79% 100%, 20% 100%)' }}>V</div>
    </div>,
    size,
  );
}
