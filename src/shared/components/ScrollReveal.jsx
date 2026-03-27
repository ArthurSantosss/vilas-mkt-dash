import { useRef, useEffect, useState } from 'react';

const DIRECTION_MAP = {
  up: (distance) => `translateY(${distance})`,
  down: (distance) => `translateY(-${distance})`,
  left: (distance) => `translateX(${distance})`,
  right: (distance) => `translateX(-${distance})`,
  none: () => 'none',
};

export default function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 700,
  distance = '40px',
  className = '',
  once = true,
  threshold = 0.15,
}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.unobserve(el);
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -50px 0px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  const getTransform = DIRECTION_MAP[direction] || DIRECTION_MAP.up;

  const style = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translate(0, 0)' : getTransform(distance),
    transition: `opacity ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
    willChange: 'opacity, transform',
  };

  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
}
