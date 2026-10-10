// Renders docs/resume/resume.html to the downloadable PDF in /public.
// Usage: node scripts/build-resume.mjs   (set PW_CHROMIUM to use a preinstalled browser)
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'docs/resume/resume.html');
const output = path.join(root, 'public/Godliness_Dongorere_Resume_Systems.pdf');

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();
await page.goto(pathToFileURL(source).href);
await page.pdf({ path: output, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`Wrote ${path.relative(root, output)}`);
