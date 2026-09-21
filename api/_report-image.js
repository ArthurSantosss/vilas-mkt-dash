/* global process */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { buildAutomaticReportSvg } from '../src/shared/utils/automaticReportVisual.js';

export async function renderReportPng(report) {
  const root = path.join(process.cwd(), 'public');
  const [agency, meta] = await Promise.all([
    readFile(path.join(root, report.agency === 'tagb' ? 'logotag.png' : 'favicon.png')),
    readFile(path.join(root, 'meta-ads-logo.png')),
  ]);
  const svg = buildAutomaticReportSvg(report, {
    agencyLogo: `data:image/png;base64,${agency.toString('base64')}`,
    metaLogo: `data:image/png;base64,${meta.toString('base64')}`,
  });
  const renderer = new Resvg(svg, {
    font: {
      fontFiles: [path.join(root, 'fonts/Lato-Regular.ttf'), path.join(root, 'fonts/Lato-Bold.ttf')],
      loadSystemFonts: false, defaultFontFamily: 'Lato',
    },
  });
  return renderer.render().asPng();
}
