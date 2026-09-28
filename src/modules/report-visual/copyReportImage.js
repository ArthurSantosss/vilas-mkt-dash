import { toCanvas } from 'html-to-image';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao carregar uma logo.')), 15000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Não foi possível carregar uma logo.')); };
    image.src = src;
  });
}

// Compõe as logos diretamente no canvas: imagens dentro do SVG/foreignObject
// usado pelo html-to-image podem desaparecer mesmo quando o PNG não dá erro.
export async function copyReportImage(node, convertImage) {
  if (!node) throw new Error('Gere o relatório novamente.');
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  container.setAttribute('aria-hidden', 'true');
  const clone = node.cloneNode(true);
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const sourceImages = Array.from(node.querySelectorAll('img'));
    const images = Array.from(clone.querySelectorAll('img'));
    const logos = await Promise.all(images.map(async (image, index) => {
      const source = sourceImages[index];
      const src = source.currentSrc || source.src;
      const dataUrl = await convertImage(src);
      if (!dataUrl) throw new Error(`Não foi possível preparar a logo ${source.alt || ''}. Tente novamente.`);
      const decoded = await loadImage(dataUrl);
      // Mantém a dimensão intrínseca e o espaço da logo no layout do clone.
      image.src = dataUrl;
      await image.decode();
      image.style.opacity = '0';
      return { image, decoded };
    }));

    const bounds = clone.getBoundingClientRect();
    const placements = logos.map(({ image, decoded }) => {
      const rect = image.getBoundingClientRect();
      // As logos do ReportCard usam object-fit: contain, centralizado.
      const scale = Math.min(rect.width / decoded.naturalWidth, rect.height / decoded.naturalHeight);
      const width = decoded.naturalWidth * scale;
      const height = decoded.naturalHeight * scale;
      return { decoded, width, height, x: rect.left - bounds.left + (rect.width - width) / 2, y: rect.top - bounds.top + (rect.height - height) / 2 };
    });
    const options = { pixelRatio: 1, backgroundColor: '#0d1520', cacheBust: false };
    let canvas;
    try {
      canvas = await toCanvas(clone, options);
    } catch {
      canvas = await toCanvas(clone, { ...options, skipFonts: true });
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível criar a imagem do relatório.');
    for (const { decoded, x, y, width, height } of placements) {
      context.drawImage(decoded, x, y, width, height);
    }
    return { dataUrl: canvas.toDataURL('image/png') };
  } finally {
    container.remove();
  }
}
