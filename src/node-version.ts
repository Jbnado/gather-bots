/**
 * The Gather SDK declares `node >=24`, and package managers only warn about that rather than
 * refusing to install. Without this check an older Node gets through setup and fails later with
 * something unrelated-looking, which is a miserable first experience for someone who just cloned
 * the repo on a work machine they do not control.
 */
const REQUIRED_MAJOR = 24;

export function assertNodeVersion(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (Number.isNaN(major) || major >= REQUIRED_MAJOR) return;

  console.error(`\nThis project needs Node ${REQUIRED_MAJOR} or newer — you have ${process.versions.node}.`);
  console.error("The @gathertown/webhook-object-sdk dependency requires it.\n");
  console.error("If you cannot change the system Node, a version manager keeps it local:");
  console.error("  fnm:   fnm install 24 && fnm use 24");
  console.error("  nvm:   nvm install 24 && nvm use 24");
  console.error("  volta: volta install node@24\n");
  process.exit(1);
}
