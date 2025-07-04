import * as fs from 'fs';
import * as path from 'path';

function getTitle(filename: string): string {
  return path.basename(filename, '.md');
}

function combineMarkdownFiles(dirPath: string, outputFile: string) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    console.error(`Directory does not exist: ${dirPath}`);
    process.exit(1);
  }

  const outputPath = path.join(dirPath, outputFile);
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing output file: ${outputFile}`);
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md') && f !== outputFile)
    .sort((a, b) => b.localeCompare(a));

  let combined = '';

  console.log(`Combining ${files.length} markdown files in ${dirPath}`);

  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const filePath = path.join(dirPath, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    // Demote all markdown headers by one level (e.g., # -> ##, ## -> ###)
    content = content.replace(/^(\#{1,5})\s/gm, '$1# ');
    combined += `# ${getTitle(file)}\n\n${content}\n\n`;
  }

  fs.writeFileSync(path.join(dirPath, outputFile), combined.trim());
  console.log(`Combined ${files.length} files into ${outputFile}`);
}

main();

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: mdCombine.ts <directory>');
    process.exit(1);
  }
  combineMarkdownFiles(dir, 'output.md');
}
