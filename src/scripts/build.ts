import path from 'path';
import fs from 'fs';

const copyFileSync = (source: string, target: string) => {
  let targetFile = target;

  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
};

const copyFolderRecursiveSync = (source: string, target: string) => {
  const targetFolder = target;
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach(file => {
      const curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, path.join(targetFolder, file));
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
};

const dist = path.resolve(__dirname, '..', '..', 'contracts');

process.stdout.write('Copying source files...');
copyFolderRecursiveSync(path.resolve(__dirname, '..', 'contracts'), dist);
process.stdout.write(' done\n');

process.stdout.write('Writing ABIs...');
const source = path.resolve(__dirname, '..', '..', 'build');
const dest = dist;
fs.mkdirSync(dest, { recursive: true });
const files = fs.readdirSync(source);
files.forEach(file => {
  const { abi } = JSON.parse(
    fs.readFileSync(path.resolve(source, file)).toString()
  );
  const basename = path.basename(file, '.json');
  fs.writeFileSync(
    path.resolve(dest, `${basename}.cjs`),
    `module.exports = ${JSON.stringify(abi, null, 2)};`
  );
  fs.writeFileSync(
    path.resolve(dest, `${basename}.d.ts`),
    `import { AbiItem } from 'web3-utils';\ndeclare const abi: AbiItem[];\nexport default abi;`
  );
});
process.stdout.write(' done\n\n');
