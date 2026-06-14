import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

async function downloadPdf(slide, index) {
  const filename = `${String(index + 1).padStart(2, '0')}-${slugify(slide.title)}.pdf`;
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

  slide.pdf = relativePath;
  console.log(`Saved ${relativePath}`);
}

const data = JSON.parse(await readFile(dataPath, 'utf8'));
await mkdir(pdfDir, { recursive: true });

for (const [index, slide] of data.slides.entries()) {
  if (!slide.source && !slide.sourceUrl) {
    console.warn(`Skipping ${slide.title || `slide ${index + 1}`}: missing source`);
    continue;
  }

  await downloadPdf(slide, index);
}

await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
console.log('Updated data.json');
