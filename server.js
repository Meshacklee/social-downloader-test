const express = require('express');
const cors = require('cors');
const YtDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const port = 3000;

// Initialize yt-dlp
const ytDlp = new YtDlpWrap('/usr/bin/yt-dlp'); // Adjust path if needed

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('downloads'));

// Create downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
fs.mkdir(downloadsDir, { recursive: true });

// Single download endpoint
app.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'No URL provided' });
  }

  try {
    new URL(url);
    const fileId = uuidv4();
    const outputPath = path.join(downloadsDir, `${fileId}.mp4`);

    await ytDlp.execPromise([
      url,
      '-o', outputPath,
      '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    ]);

    await fs.access(outputPath);

    res.download(outputPath, 'video.mp4', async (err) => {
      if (err) {
        console.error('Error sending file:', err);
        res.status(500).json({ success: false, error: 'Failed to send video' });
      }
      try {
        await fs.unlink(outputPath);
      } catch (deleteErr) {
        console.error('Error deleting file:', deleteErr);
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: 'Failed to download video' });
  }
});

// Batch download endpoint
app.post('/batch-download', async (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ success: false, error: 'No URLs provided or invalid format' });
  }

  const fileId = uuidv4();
  const tempDir = path.join(downloadsDir, fileId);
  const zipPath = path.join(downloadsDir, `${fileId}.zip`);

  try {
    // Create temporary directory for videos
    await fs.mkdir(tempDir, { recursive: true });

    // Download each video
    const videoPaths = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        new URL(url);
        const outputPath = path.join(tempDir, `video-${i + 1}.mp4`);
        await ytDlp.execPromise([
          url,
          '-o', outputPath,
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        ]);
        await fs.access(outputPath);
        videoPaths.push(outputPath);
      } catch (error) {
        console.error(`Error downloading video ${i + 1}:`, error);
        // Continue with other URLs even if one fails
        continue;
      }
    }

    if (videoPaths.length === 0) {
      throw new Error('No videos were downloaded successfully');
    }

    // Create ZIP file
    const output = require('fs').createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
      // Send ZIP file
      res.download(zipPath, 'videos.zip', async (err) => {
        if (err) {
          console.error('Error sending ZIP:', err);
          res.status(500).json({ success: false, error: 'Failed to send ZIP file' });
        }
        // Cleanup
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          await fs.unlink(zipPath);
        } catch (deleteErr) {
          console.error('Error deleting files:', deleteErr);
        }
      });
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    for (const videoPath of videoPaths) {
      const fileName = path.basename(videoPath);
      archive.file(videoPath, { name: fileName });
    }
    await archive.finalize();
  } catch (error) {
    console.error('Batch download error:', error);
    res.status(500).json({ success: false, error: 'Failed to process batch download' });
    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.unlink(zipPath).catch(() => {}); // Ignore if ZIP wasn't created
    } catch (deleteErr) {
      console.error('Error cleaning up:', deleteErr);
    }
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});