type ContactPath = {
  id: string;
  kind: 'email' | 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'form' | 'phone';
  value: string | null;
  url: string | null;
  source_url: string;
  verified_public: boolean;
};

const LABELS: Record<ContactPath['kind'], string> = {
  email: 'Email', facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn',
  tiktok: 'TikTok', youtube: 'YouTube', form: 'Contact form', phone: 'Phone',
};

const ICONS: Record<ContactPath['kind'], string> = {
  email: '✉', facebook: 'f', instagram: '◎', linkedin: 'in', tiktok: '♪', youtube: '▶', form: '↗', phone: '☎',
};

const PRIORITY: ContactPath['kind'][] = ['facebook', 'email', 'form', 'phone', 'instagram', 'linkedin', 'tiktok', 'youtube'];

export function ContactPaths({ paths }: { paths: ContactPath[] }) {
  if (!paths.length) return null;
  const sorted = [...paths].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  const bestId = sorted.find((path) => Boolean(contactHref(path)))?.id || null;

  return (
    <section className="contact-paths" aria-label="Ways to reach this business">
      <div className="contact-paths-head">
        <div><span className="eyebrow">Ways to reach them</span><b>Use a real public contact path</b></div>
        <small>Found on the business&apos;s public website</small>
      </div>
      <div className="contact-path-list">
        {sorted.map((path) => {
          const href = contactHref(path);
          if (!href) return null;
          const isBest = path.id === bestId;
          return <a key={path.id} className={`contact-path-chip ${isBest ? 'contact-path-best' : ''}`} href={href} target={path.kind === 'phone' || path.kind === 'email' ? undefined : '_blank'} rel="noreferrer">
            <span className="contact-path-icon" aria-hidden="true">{ICONS[path.kind]}</span>
            <span className="contact-path-copy"><b>{path.kind === 'form' && path.value ? path.value : LABELS[path.kind]}</b><small>{path.kind === 'form' ? compactUrl(path.url || path.source_url) : path.value || compactUrl(path.url || path.source_url)}</small></span>
            {isBest ? <em>Best option</em> : null}
          </a>;
        })}
      </div>
      {paths.some((path) => path.kind === 'email') ? <small className="contact-path-note">Public email found. Confirm the recipient before sending.</small> : null}
    </section>
  );
}

function contactHref(path: ContactPath) {
  if (path.kind === 'email' && path.value) return `mailto:${path.value}`;
  if (path.kind === 'phone' && path.value) return `tel:${path.value}`;
  return path.url || null;
}

function compactUrl(value: string) {
  try { const url = new URL(value); return url.hostname.replace(/^www\./, ''); } catch { return value; }
}
