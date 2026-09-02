import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'docs', 'pipeline-presentation.html');
const pdfPath = path.join(root, 'docs', 'pipeline-presentation.pdf');
const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto(fileUrl, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });

await page.pdf({
  path: pdfPath,
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
});

await browser.close();
console.log(`Wrote ${pdfPath}`);
