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

export function ContactPaths({ paths }: { paths: ContactPath[] }) {
  if (!paths.length) return null;
  return (
    <section className="contact-paths" aria-label="Ways to reach this business">
      <div className="contact-paths-head"><span className="eyebrow">Ways to reach them</span><b>Public contact paths found on their website</b></div>
      <div className="contact-path-list">
        {paths.map((path) => {
          const href = contactHref(path);
          return href ? <a key={path.id} className="contact-path-chip" href={href} target={path.kind === 'phone' || path.kind === 'email' ? undefined : '_blank'} rel="noreferrer">
            <b>{path.kind === 'form' && path.value ? path.value : LABELS[path.kind]}</b><span>{path.kind === 'form' ? compactUrl(path.url || path.source_url) : path.value || compactUrl(path.url || path.source_url)}</span>
          </a> : null;
        })}
      </div>
      {paths.some((path) => path.kind === 'email') ? <small className="contact-path-note">Email addresses were found on the business’s public site. Confirm the recipient before sending.</small> : null}
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
