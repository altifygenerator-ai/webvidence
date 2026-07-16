import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11' }}>
      <div style={{ width: 300, height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ff5b35', color: '#0b0e11', fontSize: 250, fontWeight: 900, clipPath: 'polygon(0 0, 100% 0, 79% 100%, 20% 100%)' }}>V</div>
    </div>,
    size,
  );
}
