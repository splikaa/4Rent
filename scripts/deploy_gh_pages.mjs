import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

const gitBin = existsSync('C:\\Users\\Gameiun Peso NEt\\AppData\\Local\\MinGit\\cmd\\git.exe')
  ? '"C:\\Users\\Gameiun Peso NEt\\AppData\\Local\\MinGit\\cmd\\git.exe"'
  : 'git';

process.env.GIT_INDEX_FILE = '.git/index-gh-pages';
try {
  execSync(`${gitBin} add dist -f`, { stdio: 'inherit' });
  const tree = execSync(`${gitBin} write-tree --prefix=dist`).toString().trim();
  console.log('Tree for dist:', tree);
  const parent = execSync(`${gitBin} rev-parse gh-pages`).toString().trim();
  console.log('Parent gh-pages commit:', parent);
  const commit = execSync(
    `${gitBin} commit-tree ${tree} -p ${parent} -m "deploy: update gh-pages with Safari sub-meter OCR auto-insertion, PIN reading lock, and accurate network status"`
  ).toString().trim();
  console.log('New gh-pages commit:', commit);
  execSync(`${gitBin} update-ref refs/heads/gh-pages ${commit}`);
  console.log('gh-pages branch successfully updated to:', commit);
} finally {
  if (existsSync('.git/index-gh-pages')) {
    unlinkSync('.git/index-gh-pages');
  }
}
