const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const db = require('../utils/db');

async function migrer() {
  const annonces = db.read('annonces');
  let count = 0;

  for (const annonce of annonces) {
    if (!annonce.videos || annonce.videos.length === 0) continue;

    const dejaThumb = (annonce.photos || []).some(p => p.includes('thumb_'));
    if (dejaThumb) continue;

    const thumbsGeneres = [];

    for (const videoUrl of annonce.videos) {
      const videoFilename = path.basename(videoUrl);
      const thumbFilename = `thumb_${videoFilename.replace(/\.[^.]+$/, '.jpg')}`;
      const videoPath = path.join(__dirname, '../uploads/annonces', videoFilename);

      if (!fs.existsSync(videoPath)) continue;

      try {
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .screenshots({
              timestamps: ['00:00:01'],
              filename: thumbFilename,
              folder: path.join(__dirname, '../uploads/annonces'),
            })
            .on('end', resolve)
            .on('error', reject);
        });

        thumbsGeneres.push(`/uploads/annonces/${thumbFilename}`);
        console.log(`✅ Miniature générée : ${thumbFilename}`);
      } catch (e) {
        console.error(`❌ Erreur pour ${videoFilename}:`, e.message);
      }
    }

    if (thumbsGeneres.length > 0) {
      // Ajouter tous les thumbs au début des photos
      const photosMAJ = [...thumbsGeneres, ...(annonce.photos || [])];
      db.update('annonces', annonce.id, { photos: photosMAJ });
      count += thumbsGeneres.length;
      console.log(`📦 ${annonce.titre} — ${thumbsGeneres.length} miniature(s) ajoutée(s)`);
    }
  }

  console.log(`\nMigration terminée — ${count} miniature(s) générée(s).`);
}

migrer();