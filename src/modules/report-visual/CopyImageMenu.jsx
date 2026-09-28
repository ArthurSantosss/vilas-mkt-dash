import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';

export default function CopyImageMenu({ children, buildExportAsset }) {
  const [position, setPosition] = useState(null);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    menuRef.current?.querySelector('button')?.focus();
    const dismiss = (event) => {
      if (!menuRef.current?.contains(event.target)) setPosition(null);
    };
    const close = () => setPosition(null);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus({ preventScroll: true });
      }
      if (event.key === 'Tab') close();
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [position]);

  const copyImage = async () => {
    setPosition(null);
    triggerRef.current?.focus({ preventScroll: true });
    if (copying) return;
    setCopying(true);
    setMessage('Copiando imagem…');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Este navegador não permite copiar imagens. Use Baixar PNG.');
      }
      // Inicia a escrita durante o clique para preservar a autorização no Safari.
      const png = buildExportAsset().then(async (asset) => {
        if (!asset?.dataUrl) throw new Error('Gere o relatório novamente e tente copiar.');
        const response = await fetch(asset.dataUrl);
        return response.blob();
      });
      // A exportação pode falhar depois de o navegador recusar a escrita.
      png.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      setMessage('Imagem copiada!');
    } catch (error) {
      setMessage(error.name === 'NotAllowedError'
        ? 'Permita o acesso à área de transferência para copiar a imagem ou use Baixar PNG.'
        : `Não foi possível copiar a imagem. ${error.message || 'Tente novamente ou use Baixar PNG.'}`);
    } finally {
      setCopying(false);
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        tabIndex={0}
        aria-label="Relatório visual. Use o botão direito para copiar a imagem."
        onContextMenu={(event) => {
          event.preventDefault();
          if (copying) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            x: Math.max(8, Math.min(event.clientX || bounds.left, window.innerWidth - 208)),
            y: Math.max(8, Math.min(event.clientY || bounds.top, window.innerHeight - 56)),
          });
        }}
      >
        {children}
      </div>
      {message && <p role="status" className="mt-3 text-xs text-text-secondary">{message}</p>}
      {position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Opções do relatório visual"
          className="fixed z-[200] w-[200px] rounded-xl border border-border bg-surface p-1 shadow-xl"
          style={{ left: position.x, top: position.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={copyImage}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-primary/10 focus:bg-primary/10 focus:outline-none"
          >
            <Copy size={16} /> Copiar imagem
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
