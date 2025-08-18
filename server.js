// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const multer = require('multer'); // <-- Make sure this is required

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARE ---
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- DIRECTORIES & STATIC SERVING ---
const downloadsDir = path.resolve(__dirname, 'downloads');
const cookiesDir = path.resolve(__dirname, 'cookies');

console.log(`📁 Downloads directory set to: ${downloadsDir}`);
console.log(`📁 Cookies directory set to: ${cookiesDir}`);

// Ensure directories exist
[downloadsDir, cookiesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
        } catch (err) {
            console.error(`❌ Failed to create directory ${dir}:`, err);
        }
    } else {
        console.log(`📁 Directory already exists: ${dir}`);
    }
});

// Serve static files from downloads and cookies
app.use('/downloads', express.static(downloadsDir));
app.use('/cookies', express.static(cookiesDir));

// --- MULTER CONFIGURATION (FOR COOKIE UPLOADS) ---
// This was missing, causing the ReferenceError
const upload = multer({
    dest: cookiesDir, // Store uploaded cookies here temporarily
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// --- yt-dlp SETUP ---
const realDownloadsEnabled = fs.existsSync(path.join(__dirname, 'ENABLE_REAL_DOWNLOADS'));
console.log('🔧 Real downloads enabled flag (ENABLE_REAL_DOWNLOADS file exists):', realDownloadsEnabled);

function ensureYtDlp() {
    return new Promise((resolve) => {
        if (!realDownloadsEnabled) {
            console.log('⏩ Real downloads not enabled, skipping yt-dlp setup.');
            resolve();
            return;
        }

        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        if (fs.existsSync(ytDlpPath)) {
            console.log('✅ yt-dlp already exists at:', ytDlpPath);
            try {
                fs.chmodSync(ytDlpPath, 0o755);
                console.log('✅ yt-dlp permissions ensured.');
            } catch (chmodError) {
                console.error('⚠️ Could not set yt-dlp permissions:', chmodError.message);
            }
            resolve();
            return;
        }

        console.log('🔽 Downloading yt-dlp...');
        const downloadCommand = 'curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp';

        const child = spawn(downloadCommand, { shell: true });

        child.on('close', (code) => {
            if (code === 0) {
                fs.chmod(ytDlpPath, 0o755, (chmodError) => {
                    if (chmodError) {
                        console.error('❌ Failed to make yt-dlp executable:', chmodError.message);
                    } else {
                        console.log('✅ yt-dlp downloaded and made executable.');
                    }
                });
            } else {
                console.error(`❌ yt-dlp download failed with code ${code}`);
                console.log('⚠️ Real downloads will fall back to simulation.');
            }
            resolve();
        });
    });
}

// --- CORE DOWNLOAD LOGIC (RELIABLE VERSION) ---
function downloadVideo(url, cookieFilename = null) {
    return new Promise((resolve, reject) => {
        if (!realDownloadsEnabled) {
            console.log('🧪 Real downloads not enabled, simulating');
            const timestamp = Date.now();
            const filename = `simulation_${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            const content = `Download Simulation\nURL: ${url}\nTimestamp: ${new Date().toISOString()}\nReal downloads are disabled.`;
            fs.writeFileSync(filePath, content);
            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({ success: true, title: 'Simulation File', downloadUrl, filename, simulated: true });
            return;
        }

        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        if (!fs.existsSync(ytDlpPath)) {
            const errorMsg = 'yt-dlp executable not found. Cannot proceed with download.';
            console.error(`❌ ${errorMsg}`);
            const timestamp = Date.now();
            const filename = `error_noytdlp_${timestamp}.txt`;
            fs.writeFileSync(path.join(downloadsDir, filename), errorMsg);
            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
            resolve({ success: true, title: 'yt-dlp Missing', downloadUrl, filename, error: true });
            return;
        }

        try {
            fs.accessSync(ytDlpPath, fs.constants.X_OK);
        } catch (accessError) {
            console.log('🔧 yt-dlp not executable, attempting fix...');
            try {
                fs.chmodSync(ytDlpPath, 0o755);
                console.log('✅ yt-dlp permissions fixed.');
            } catch (chmodError) {
                const errorMsg = `Failed to make yt-dlp executable: ${chmodError.message}`;
                console.error(`❌ ${errorMsg}`);
                const timestamp = Date.now();
                const filename = `error_permissions_${timestamp}.txt`;
                fs.writeFileSync(path.join(downloadsDir, filename), errorMsg);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({ success: true, title: 'Permissions Error', downloadUrl, filename, error: true });
                return;
            }
        }

        // --- USE PREDICTABLE FILENAME TEMPLATE ---
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const baseOutputName = `video_${timestamp}_${randomSuffix}`;
        const outputPathTemplate = path.join(downloadsDir, `${baseOutputName}.%(ext)s`);

        console.log(`🔽 Starting real download for: ${url}`);
        console.log(`💾 Output template: ${outputPathTemplate}`);

        let downloadOptions = [
            url,
            '--no-check-certificate',
            '--socket-timeout', '45',
            '--retries', '2',
            '--no-progress',
            '-f', 'bv*[height<=?720]+ba/b', // Good balance for most platforms
            '-o', outputPathTemplate, // CRITICAL: Our predictable template
            '--newline'
        ];

        if (cookieFilename) {
            const cookiePath = path.join(cookiesDir, cookieFilename);
            if (fs.existsSync(cookiePath)) {
                downloadOptions.push('--cookies', cookiePath);
                console.log('🍪 Using cookies for authentication');
            } else {
                console.log('⚠️ Cookie file not found:', cookiePath);
            }
        }

        const ytDlpProcess = spawn(ytDlpPath, downloadOptions);

        let stdoutData = '';
        let stderrData = '';

        ytDlpProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdoutData += chunk;
            if (chunk.trim()) console.log('[yt-dlp OUT]:', chunk.trim().substring(0, 200));
        });

        ytDlpProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderrData += chunk;
            if (chunk.trim()) console.log('[yt-dlp ERR]:', chunk.trim().substring(0, 200));
        });

        ytDlpProcess.on('error', (err) => {
            console.error('[yt-dlp SPAWN ERROR]:', err);
            const timestamp = Date.now();
            const filename = `error_spawn_${timestamp}.txt`;
            fs.writeFileSync(path.join(downloadsDir, filename), `Failed to start yt-dlp: ${err.message}\nURL: ${url}`);
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });

        ytDlpProcess.on('close', (code) => {
            console.log(`[yt-dlp PROCESS CLOSED] Exit code: ${code}`);

            if (code === 0) {
                console.log("✅ yt-dlp reported success. Searching for file...");
                // --- FIND FILE USING BASE NAME ---
                fs.readdir(downloadsDir, (readErr, files) => {
                    if (readErr) {
                        console.error("❌ Error reading downloads dir:", readErr);
                        reject(new Error(`Could not read downloads directory: ${readErr.message}`));
                        return;
                    }

                    const matchingFiles = files.filter(file =>
                        file.startsWith(baseOutputName) && file !== '.' && file !== '..'
                    );

                    console.log(`🔍 Found ${matchingFiles.length} matching file(s) for '${baseOutputName}'`);

                    if (matchingFiles.length === 1) {
                        const filename = matchingFiles[0];
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                        const title = filename.replace(/\.[^/.]+$/, "");
                        console.log(`🎉 Successfully located file: ${filename}`);
                        resolve({ success: true, title, downloadUrl, filename });
                    } else if (matchingFiles.length > 1) {
                        console.warn("⚠️ Multiple matching files found. Picking the newest.");
                        const sortedMatches = matchingFiles.map(f => ({
                            file: f,
                            mtime: fs.statSync(path.join(downloadsDir, f)).mtime
                        })).sort((a, b) => b.mtime - a.mtime);

                        const filename = sortedMatches[0].file;
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                        const title = filename.replace(/\.[^/.]+$/, "");
                        console.log(`🎯 Picked newest file: ${filename}`);
                        resolve({ success: true, title, downloadUrl, filename });
                    } else {
                        console.error(`💥 yt-dlp success (code 0) but no file '${baseOutputName}*' found.`);
                        console.error("--- yt-dlp STDOUT ---"); console.error(stdoutData.substring(0, 500));
                        console.error("--- yt-dlp STDERR ---"); console.error(stderrData.substring(0, 500));
                        console.error("--- Files in Dir ---"); console.error(files);

                        // Ultimate fallback: any recent file?
                        const recentFiles = files
                            .filter(f => f !== '.' && f !== '..')
                            .map(f => ({ file: f, mtime: fs.statSync(path.join(downloadsDir, f)).mtime }))
                            .filter(item => (Date.now() - item.mtime.getTime()) < 15000) // Last 15s
                            .sort((a, b) => b.mtime - a.mtime);

                        if (recentFiles.length > 0) {
                            const filename = recentFiles[0].file;
                            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                            const title = filename.replace(/\.[^/.]+$/, "");
                            console.warn(`🧭 Ultimate fallback found recent file: ${filename}`);
                            resolve({ success: true, title, downloadUrl, filename });
                        } else {
                            const timestamp = Date.now();
                            const filename = `error_notfound_${timestamp}.txt`;
                            const content = `Download process reported success, but the file could not be located.\nExpected base: ${baseOutputName}\nURL: ${url}\nTime: ${new Date().toISOString()}\n--- Output ---\nSTDOUT:\n${stdoutData}\nSTDERR:\n${stderrData}`;
                            fs.writeFileSync(path.join(downloadsDir, filename), content);
                            const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                            resolve({ success: true, title: 'File Not Found', downloadUrl, filename, error: true });
                        }
                    }
                });
            } else {
                console.error(`💥 yt-dlp failed with exit code ${code}`);
                console.error("--- yt-dlp STDOUT ---"); console.error(stdoutData.substring(0, 500));
                console.error("--- yt-dlp STDERR ---"); console.error(stderrData.substring(0, 500));

                const timestamp = Date.now();
                const filename = `error_failed_${code}_${timestamp}.txt`;
                const content = `Download failed!\nURL: ${url}\nExit Code: ${code}\nTime: ${new Date().toISOString()}\n--- Output ---\nSTDOUT:\n${stdoutData}\nSTDERR:\n${stderrData}`;
                fs.writeFileSync(path.join(downloadsDir, filename), content);
                const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                resolve({ success: true, title: 'Download Failed', downloadUrl, filename, error: true });
            }
        });
    });
}

// --- API ROUTES ---
app.get('/health', (req, res) => {
    console.log('🩺 GET /health');
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        realDownloads: realDownloadsEnabled,
        downloadsDir,
        cookiesDir
    });
});

app.get('/api/downloads', (req, res) => {
    console.log('🔍 GET /api/downloads - Debug endpoint');
    fs.readdir(downloadsDir, (err, files) => {
        if (err) {
            console.error('❌ Error reading downloads dir:', err);
            return res.status(500).json({ error: 'Could not read downloads directory', details: err.message });
        }
        res.json({ success: true, files, count: files.length, downloadsDir });
    });
});

app.get('/api/platforms', (req, res) => {
    console.log('🌐 GET /api/platforms');
    res.json({
        platforms: [
            { name: 'YouTube', key: 'youtube', icon: '📺' },
            { name: 'Instagram', key: 'instagram', icon: '📱' },
            { name: 'TikTok', key: 'tiktok', icon: '🎵' },
            { name: 'Twitter/X', key: 'twitter', icon: '🐦' },
            { name: 'Generic', key: 'generic', icon: '🔗' }
        ]
    });
});

// --- COOKIE UPLOAD ENDPOINT ---
app.post('/api/upload-cookie', upload.single('cookieFile'), (req, res) => {
    // Use the 'upload' middleware defined above
    if (!req.file) {
        return res.status(400).json({ error: 'No cookie file uploaded' });
    }
    console.log('🍪 Cookie file uploaded:', req.file.originalname);
    
    // Rename to a more descriptive name
    const newFilename = `cookies_${Date.now()}.txt`;
    const oldPath = req.file.path; // Multer's temporary path
    const newPath = path.join(cookiesDir, newFilename);

    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            console.error('❌ Error renaming cookie file:', err);
            return res.status(500).json({ error: 'Failed to process cookie file' });
        }
        res.json({
            success: true,
            message: 'Cookie file uploaded successfully',
            filename: newFilename,
            path: newPath
        });
    });
});

// --- DOWNLOAD ENDPOINTS ---
// Unified download endpoint
app.post('/api/download', async (req, res) => {
    const { url, cookieFile } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log('🔽 POST /api/download - URL:', url);
    try {
        const result = await downloadVideo(url, cookieFile);
        console.log("📤 Sending result for", url.substring(0, 50)+"...", ":", result.filename || "error");
        res.json(result);
    } catch (error) {
        console.error('❌ Download error for URL:', url, error);
        res.status(500).json({ error: error.message });
    }
});

// --- BATCH DOWNLOAD ENDPOINT ---
// This will handle multiple URLs sequentially
app.post('/api/download/batch', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }
    console.log('📦 Batch download requested for', urls.length, 'videos');

    // Respond immediately to the client
    res.json({
        success: true,
        message: `Batch download started for ${urls.length} videos. Processing in background.`,
        total: urls.length
    });

    // Process the batch asynchronously in the background
    // In a production app, you'd use a proper job queue (e.g., BullMQ, Agenda)
    (async () => {
        console.log('🚀 Starting asynchronous batch processing for', urls.length, 'videos');
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            console.log(`📦 Processing batch video ${i + 1}/${urls.length}: ${url.substring(0, 100)}...`);
            try {
                // Add a small delay between downloads to be respectful
                if (i > 0) await new Promise(r => setTimeout(r, 3000));
                
                const result = await downloadVideo(url, null); // No cookies for batch for now
                console.log(`✅ Completed batch video ${i + 1}: ${result.title || result.filename}`);
                
                // --- HERE YOU COULD EMIT REAL-TIME UPDATES ---
                // For example, using WebSockets (Socket.IO) or Server-Sent Events (SSE)
                // to inform the frontend that video `i` is done.
                // For now, we just log it.
                // Example (conceptual):
                // io.emit('batchProgress', { index: i, status: 'completed', result });
                
            } catch (error) {
                console.error(`❌ Error processing batch video ${i + 1}:`, url, error.message);
                // Log the error but continue processing the rest of the batch
                // io.emit('batchProgress', { index: i, status: 'error', error: error.message });
            }
        }
        console.log('🏁 Asynchronous batch processing completed for all', urls.length, 'videos');
        // io.emit('batchComplete', { message: 'All videos processed' });
    })().catch(err => {
        console.error("🔥 Unexpected error in batch background task:", err);
    });
});

// --- SERVE MAIN PAGES ---
app.get('/', (req, res) => {
    console.log('🏠 GET /');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/batch.html', (req, res) => {
    console.log('📦 GET /batch.html');
    res.sendFile(path.join(__dirname, 'public', 'batch.html'));
});

// --- ERROR HANDLING ---
// Catch-all for unmatched routes (must be AFTER all defined routes)
app.use((req, res) => {
    console.log(`404 - Unmatched route: ${req.method} ${req.path}`);
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        method: req.method
    });
});

// Global error handler (must be LAST middleware)
app.use((err, req, res, next) => { // next param is REQUIRED for Express to recognize it as error handler
    console.error('🔥 Unhandled error:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', message: err.message });
    } else {
        console.error("Error occurred after headers sent, cannot send error response:", err);
    }
});

// --- INITIALIZE & START ---
ensureYtDlp().then(() => {
    console.log("🚀 yt-dlp setup check completed.");
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
        console.log(`📂 Serving downloads from: ${downloadsDir}`);
        console.log(`🧪 Test URLs:`);
        console.log(`   http://localhost:${PORT}/`);
        console.log(`   http://localhost:${PORT}/health`);
        console.log(`   http://localhost:${PORT}/api/downloads`);
    });
}).catch(err => {
    console.error("💥 Fatal error during initialization:", err);
    process.exit(1); // Exit if critical setup fails
});

console.log('=== SERVER SETUP COMPLETE ===');