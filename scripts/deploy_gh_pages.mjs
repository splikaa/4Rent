import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';

process.env.GIT_INDEX_FILE = '.git/index-gh-pages';
try {
  execSync('git add dist -f', { stdio: 'inherit' });
  const tree = execSync('git write-tree --prefix=dist').toString().trim();
  console.log('Tree for dist:', tree);
  const parent = execSync('git rev-parse gh-pages').toString().trim();
  console.log('Parent gh-pages commit:', parent);
  const commit = execSync(
    `git commit-tree ${tree} -p ${parent} -m "deploy: update gh-pages with live camera stream, sharpening and signed Play Protect APK"`
  ).toString().trim();
  console.log('New gh-pages commit:', commit);
  execSync(`git update-ref refs/heads/gh-pages ${commit}`);
  console.log('gh-pages branch successfully updated to:', commit);
} finally {
  if (existsSync('.git/index-gh-pages')) {
    unlinkSync('.git/index-gh-pages');
  }
}
