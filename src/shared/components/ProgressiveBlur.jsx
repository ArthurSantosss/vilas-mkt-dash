const BLUR_STEPS = [0.15, 0.3, 0.5, 1, 1.5, 2.5, 4, 6];
const TOTAL = BLUR_STEPS.length;

function getMask(index) {
  const step = 100 / TOTAL;
  const start = step * index;
  const mid1 = start + step;
  const mid2 = mid1 + step;
  const end = mid2 + step;

  // Last layers don't need trailing transparent
  if (index >= TOTAL - 2) {
    const gradient = `linear-gradient(to bottom, transparent ${start}%, black ${mid1}%, black 100%)`;
    return gradient;
  }

  const gradient = `linear-gradient(to bottom, transparent ${start}%, black ${mid1}%, black ${mid2}%, transparent ${end}%)`;
  return gradient;
}

export default function ProgressiveBlur() {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '120px',
        zIndex: 999,
        pointerEvents: 'none',
      }}
    >
      {BLUR_STEPS.map((blur, i) => {
        const mask = getMask(i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}
