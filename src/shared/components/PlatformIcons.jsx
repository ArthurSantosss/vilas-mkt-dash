// Arquivos das marcas fornecidos para o painel, com cores e proporções originais.
function PlatformIcon({ src, className = '', size = 24, title, mono = false }) {
  if (mono) {
    return (
      <span
        role="img"
        aria-label={title}
        className={`inline-block shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          backgroundColor: 'currentColor',
          mask: `url("${src}") center / contain no-repeat`,
          WebkitMask: `url("${src}") center / contain no-repeat`,
        }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={title}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
      style={{ objectFit: 'contain' }}
    />
  );
}

export function MetaIcon({ title = 'Meta', ...props }) {
  return <PlatformIcon {...props} src="/meta-logo.svg" title={title} />;
}

export function GoogleAdsIcon({ title = 'Google Ads', ...props }) {
  return <PlatformIcon {...props} src="/google-ads-logo.svg" title={title} />;
}
