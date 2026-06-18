import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dataPath = path.join(root, 'data.json');
const pdfDir = path.join(root, 'pdf');

function slugify(value) {
  return value
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function getPdfExportUrl(slideUrl) {
  const url = new URL(slideUrl);

  if (url.pathname.includes('/presentation/d/e/') && url.pathname.endsWith('/pub')) {
    url.searchParams.set('output', 'pdf');
    return url.toString();
  }

  const editableMatch = url.pathname.match(/\/presentation\/d\/([^/]+)/);
  if (editableMatch) {
    return `https://docs.google.com/presentation/d/${editableMatch[1]}/export/pdf`;
  }

  throw new Error(`Unsupported Google Slides URL: ${slideUrl}`);
}

async function downloadPdf(slide) {
  const filename = `${slugify(slide.title)}.pdf`;
  const relativePath = `pdf/${filename}`;
  const outputPath = path.join(pdfDir, filename);
  const sourceUrl = slide.source || slide.sourceUrl;
  const exportUrl = getPdfExportUrl(sourceUrl);

  const response = await fetch(exportUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${slide.title}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) {
    throw new Error(`Download for ${slide.title} did not return a PDF. Use the normal Slides /presentation/d/{id}/edit URL in a "source" field.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);

  console.log(`Saved ${relativePath}`);
}

async function resetPdfDir() {
  const expectedPdfDir = path.resolve(root, 'pdf');
  const resolvedPdfDir = path.resolve(pdfDir);

  if (resolvedPdfDir !== expectedPdfDir || path.dirname(resolvedPdfDir) !== path.resolve(root)) {
    throw new Error(`Refusing to clear unexpected PDF directory: ${resolvedPdfDir}`);
  }

  await rm(resolvedPdfDir, { recursive: true, force: true });
  await mkdir(resolvedPdfDir, { recursive: true });
  console.log('Cleared pdf directory');
}

const data = JSON.parse(await readFile(dataPath, 'utf8'));
await resetPdfDir();

for (const [index, slide] of data.slides.entries()) {
  if (!slide.source && !slide.sourceUrl) {
    console.warn(`Skipping ${slide.title || `slide ${index + 1}`}: missing source`);
    continue;
  }

  await downloadPdf(slide);
}
