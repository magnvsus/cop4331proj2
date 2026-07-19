const path = require('path');
const fs = require('fs/promises');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Deletes a previously uploaded image from disk. Skips anything that isn't
// one of our own /uploads/ files (e.g. external URLs like seed.js's demo
// images, or a user's own external avatar link) -- those aren't ours to
// delete. Accepts either the relative path our own upload endpoint returns
// (/uploads/xxx.jpg) or a full absolute URL pointing at the same file, so
// it's robust either way.
async function deleteLocalUpload(pictureURL) {
    if (!pictureURL) return;
    let pathname;
    try {
        pathname = new URL(pictureURL, 'http://placeholder').pathname;
    } catch {
        return;
    }
    if (!pathname.startsWith('/uploads/')) return;
    const filePath = path.join(UPLOADS_DIR, path.basename(pathname));
    await fs.unlink(filePath).catch(() => {});
}

module.exports = { UPLOADS_DIR, deleteLocalUpload };
