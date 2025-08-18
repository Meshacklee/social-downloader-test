const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const multer = require('multer');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 10000; // Use Render's default port

// Configure multer for cookie file uploads
const upload = multer({ 
    dest: 'cookies/',
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



// CRITICAL: Serve downloaded videos with proper path resolution
const downloadsDir = path.join(__dirname, 'downloads');
app.use('/downloads', express.static(downloadsDir, {
    setHeaders: (res, filePath) => {
        // Set proper content types for video files
        if (filePath.endsWith('.mp4')) {
            res.setHeader('Content-Type', 'video/mp4');
        } else if (filePath.endsWith('.webm')) {
            res.setHeader('Content-Type', 'video/webm');
        } else if (filePath.endsWith('.mkv')) {
            res.setHeader('Content-Type', 'video/x-matroska');
        }
    }
}));

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log('Created downloads directory:', downloadsDir);
}

// Serve cookie files (only for internal use)
app.use('/cookies', express.static(path.join(__dirname, 'cookies')));

// Ensure cookies directory exists
const cookiesDir = path.join(__dirname, 'cookies');
if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir, { recursive: true });
    console.log('Created cookies directory');
}







// Check if real downloads are enabled
const realDownloadsEnabled = fs.existsSync(path.join(__dirname, 'ENABLE_REAL_DOWNLOADS'));
console.log('Real downloads enabled:', realDownloadsEnabled);











// Download yt-dlp if it doesn't exist and real downloads are enabled
function ensureYtDlp() {
    return new Promise((resolve) => {
        if (!realDownloadsEnabled) {
            console.log('Real downloads not enabled, skipping yt-dlp setup');
            resolve();
            return;
        }
        
        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        
        if (fs.existsSync(ytDlpPath)) {
            console.log('yt-dlp already exists');
            // Ensure it's executable
            try {
                fs.chmodSync(ytDlpPath, 0o755);
                console.log('yt-dlp permissions set to executable');
            } catch (chmodError) {
                console.error('Failed to set yt-dlp permissions:', chmodError);
            }
            resolve();
            return;
        }
        // Inside downloadVideo function, in the yt-dlpProcess.on('close', (code) => { ... }) block
// Where you handle code === 0:

if (code === 0) {
    console.log("✅ yt-dlp process exited successfully.");
    
    // --- ADD THIS LOGGING ---
    console.log("🔍 Checking downloads directory for new files...");
    console.log("   Downloads directory path:", downloadsDir);
    
    try {
        const files = fs.readdirSync(downloadsDir);
        console.log("   Files in directory:", files);
        
        if (files.length > 0) {
            // Get the most recent file
            const recentFiles = files
                .map(file => ({ 
                    file, 
                    mtime: fs.statSync(path.join(downloadsDir, file)).mtime,
                    fullPath: path.join(downloadsDir, file)
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            const recentFileObj = recentFiles[0];
            console.log("   Most recent file found:");
            console.log("     Name:", recentFileObj.file);
            console.log("     Modified:", recentFileObj.mtime);
            console.log("     Full Path:", recentFileObj.fullPath);
            console.log("     File exists:", fs.existsSync(recentFileObj.fullPath));
            
            const downloadUrl = `/downloads/${encodeURIComponent(recentFileObj.file)}`;
            
            resolve({
                success: true,
                title: recentFileObj.file.replace(/\.[^/.]+$/, ""),
                downloadUrl: downloadUrl,
                filename: recentFileObj.file
            });
        } else {
            console.error("❌ No files found in downloads directory after successful yt-dlp run!");
            reject(new Error('No files found after download'));
        }
    } catch (fileError) {
        console.error("❌ Error reading downloads directory:", fileError);
        reject(new Error('Could not read downloads directory: ' + fileError.message));
    }
}

        
        console.log('Downloading yt-dlp...');
        const downloadCommand = 'curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp';
        
        exec(downloadCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Failed to download yt-dlp:', error);
                console.log('Real downloads will fall back to simulation');
            } else {
                // Make it executable
                fs.chmod(ytDlpPath, 0o755, (chmodError) => {
                    if (chmodError) {
                        console.error('Failed to make yt-dlp executable:', chmodError);
                    } else {
                        console.log('yt-dlp downloaded and made executable');
                    }
                });
            }
            resolve();
        });
    });
}

// Initialize yt-dlp on startup
ensureYtDlp();

// API Routes
app.get('/api/platforms', (req, res) => {
    console.log('GET /api/platforms');
    res.json({
        platforms: [
            { name: 'YouTube', key: 'youtube', icon: '📺' },
            { name: 'Instagram', key: 'instagram', icon: '📱' },
            { name: 'TikTok', key: 'tiktok', icon: '🎵' },
            { name: 'Twitter/X', key: 'twitter', icon: '🐦' },
            { name: 'Other Platforms', key: 'generic', icon: '🔗' }
        ]
    });
});

app.get('/health', (req, res) => {
    console.log('GET /health');
    const ytDlpPath = path.join(__dirname, 'yt-dlp');
    const ytDlpExists = fs.existsSync(ytDlpPath);
    const ytDlpExecutable = ytDlpExists ? fs.statSync(ytDlpPath).mode : 0;
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        realDownloads: realDownloadsEnabled,
        ytDlpInstalled: ytDlpExists,
        ytDlpExecutable: ytDlpExists ? (ytDlpExecutable & 0o111) !== 0 : false,
        downloadsDir: downloadsDir
    });
});

// === COOKIE UPLOAD ENDPOINT ===
app.post('/api/upload-cookie', upload.single('cookieFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No cookie file uploaded' });
    }
    
    console.log('Cookie file uploaded:', req.file.originalname);
    
    // Rename to more descriptive name
    const newFilename = `cookies_${Date.now()}.txt`;
    const newPath = path.join(cookiesDir, newFilename);
    
    fs.rename(req.file.path, newPath, (err) => {
        if (err) {
            console.error('Error renaming cookie file:', err);
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

// === DOWNLOAD FUNCTION WITH COOKIE SUPPORT ===
function downloadVideo(url, cookieFilename = null) {
    return new Promise((resolve, reject) => {
        if (!realDownloadsEnabled) {
            console.log('Real downloads not enabled, simulating');
            setTimeout(() => {
                const timestamp = new Date().getTime();
                const filename = `video-${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                
                const content = `Video Download Request Received!\n\nURL: ${url}\n\nReal downloads are currently disabled.\nTo enable real downloads:\n1. Add ENABLE_REAL_DOWNLOADS file to your project\n2. Deploy the update\n3. Try downloading again\n\nRequest time: ${new Date().toISOString()}`;
                fs.writeFileSync(filePath, content);
                
                resolve({
                    success: true,
                    title: 'Download Simulation',
                    downloadUrl: `/downloads/${filename}`,
                    filename: filename,
                    simulated: true
                });
            }, 1000);
            return;
        }
        
        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        
        // Check if yt-dlp exists and is executable
        if (!fs.existsSync(ytDlpPath)) {
            console.log('yt-dlp not found, simulating download');
            setTimeout(() => {
                const timestamp = new Date().getTime();
                const filename = `video-${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                
                const content = `yt-dlp not found. Please wait for automatic setup or check logs.\n\nURL: ${url}\n\nRequest time: ${new Date().toISOString()}`;
                fs.writeFileSync(filePath, content);
                
                resolve({
                    success: true,
                    title: 'yt-dlp Setup Required',
                    downloadUrl: `/downloads/${filename}`,
                    filename: filename,
                    setupRequired: true
                });
            }, 1000);
            return;
        }
        
        // Ensure yt-dlp is executable
        try {
            fs.accessSync(ytDlpPath, fs.constants.X_OK);
            console.log('yt-dlp is executable');
        } catch (accessError) {
            console.log('yt-dlp not executable, attempting to fix permissions');
            try {
                fs.chmodSync(ytDlpPath, 0o755);
                console.log('yt-dlp permissions fixed');
            } catch (chmodError) {
                console.error('Failed to fix yt-dlp permissions:', chmodError);
                reject(new Error('yt-dlp is not executable and cannot be made executable'));
                return;
            }
        }
        
        console.log('Starting real download for:', url);
        
        const { spawn } = require('child_process');
        
        // Build download options
        let downloadOptions = [
            url,
            '--no-check-certificate',
            '--socket-timeout', '30',
            '--retries', '3',
            '-f', 'bv*+ba/b',
            '-o', path.join(downloadsDir, '%(title)s.%(ext)s'),
            '--newline'
        ];
        
        // Add cookie support if available
        if (cookieFilename) {
            const cookiePath = path.join(cookiesDir, cookieFilename);
            if (fs.existsSync(cookiePath)) {
                downloadOptions.push('--cookies', cookiePath);
                console.log('Using cookies for authentication');
            } else {
                console.log('Cookie file not found:', cookiePath);
            }
        }
        
        const ytDlpProcess = spawn(ytDlpPath, downloadOptions);
        
        let output = '';
        let errorOutput = '';
        
        ytDlpProcess.on('error', (err) => {
            console.error('yt-dlp process error:', err);
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });
        
        ytDlpProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('yt-dlp output:', data.toString().trim());
        });
        
        ytDlpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('yt-dlp error:', data.toString().trim());
        });
        
        ytDlpProcess.on('close', (code) => {
            console.log(`yt-dlp process exited with code ${code}`);
            
            if (code === 0) {
                try {
                    const files = fs.readdirSync(downloadsDir);
                    if (files.length > 0) {
                        // Get the most recent file
                        const recentFiles = files
                            .map(file => ({ file, mtime: fs.statSync(path.join(downloadsDir, file)).mtime }))
                            .sort((a, b) => b.mtime - a.mtime);
                        
                        const recentFile = recentFiles[0].file;
                        // CRITICAL: Use proper URL encoding
                        const downloadUrl = `/downloads/${encodeURIComponent(recentFile)}`;
                        
                        resolve({
                            success: true,
                            title: recentFile.replace(/\.[^/.]+$/, ""),
                            downloadUrl: downloadUrl,
                            filename: recentFile
                        });
                    } else {
                        reject(new Error('No files found after download'));
                    }
                } catch (fileError) {
                    reject(new Error('Could not read downloads directory: ' + fileError.message));
                }
            } else {
                const timestamp = new Date().getTime();
                const filename = `download-error-${timestamp}.txt`;
                const filePath = path.join(downloadsDir, filename);
                
                const content = `Download Failed!\n\nURL: ${url}\n\nError Code: ${code}\nError Output: ${errorOutput || 'Unknown error'}\n\nTime: ${new Date().toISOString()}`;
                fs.writeFileSync(filePath, content);
                
                resolve({
                    success: true,
                    title: 'Download Failed - Check File',
                    downloadUrl: `/downloads/${filename}`,
                    filename: filename,
                    error: true
                });
            }
        });
    });
}

// Download endpoints with cookie support
app.post('/api/download/youtube', async (req, res) => {
    const { url, cookieFile } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/youtube - URL:', url, 'Cookie:', cookieFile || 'None');
    
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('YouTube download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different YouTube video or check if the video is available.'
        });
    }
});

app.post('/api/download/instagram', async (req, res) => {
    const { url, cookieFile } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/instagram - URL:', url);
    
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Instagram download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Instagram often blocks automated downloads. Try a public video.'
        });
    }
});

app.post('/api/download/tiktok', async (req, res) => {
    const { url, cookieFile } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/tiktok - URL:', url);
    
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('TikTok download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different TikTok video or check if the video is public.'
        });
    }
});

app.post('/api/download/twitter', async (req, res) => {
    const { url, cookieFile } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/twitter - URL:', url);
    
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Twitter download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different Twitter video or check if the video is public.'
        });
    }
});

app.post('/api/download', async (req, res) => {
    const { url, cookieFile } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download - URL:', url);
    
    try {
        const result = await downloadVideo(url, cookieFile);
        res.json(result);
    } catch (error) {
        console.error('Generic download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different video URL or check if the content is publicly available.'
        });
    }
});

// Batch download endpoint
// Place this with your other API routes in server.js
app.post('/api/download/batch', async (req, res) => {
    // --- CRITICAL: LOG THE INCOMING REQUEST ---
    console.log('--- RECEIVED BATCH REQUEST ---');
    console.log('POST /api/download/batch');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('-------------------------------');

    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        console.error('❌ Batch Error: Invalid or empty URLs array');
        return res.status(400).json({ error: 'URLs array is required and must not be empty' });
    }

    const numUrls = urls.length;
    console.log(`📥 Batch download requested for ${numUrls} videos`);

    try {
        // Respond to the client immediately
        res.status(202).json({ // 202 Accepted is often used for async processing
            success: true,
            message: `Batch download started for ${numUrls} videos. Processing in background.`,
            total: numUrls,
            acceptedAt: new Date().toISOString()
        });

        console.log(`📤 Responsed to client. Now processing ${numUrls} videos in background...`);

        // --- BACKGROUND PROCESSING ---
        // Use an IIFE to handle async processing without blocking the response
        (async () => {
            console.log(`🚀 Background Task: Starting batch processing for ${numUrls} videos`);
            
            // Array to store results (optional, for future enhancements like reporting)
            const results = [];

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                const currentItemLogPrefix = `[Item ${i+1}/${numUrls}]`;

                console.log(`${currentItemLogPrefix} 🔽 Starting download for: ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);

                try {
                    // --- CALL THE EXISTING downloadVideo FUNCTION ---
                    // This is the key: reuse your proven single download logic.
                    const downloadResult = await downloadVideo(url, null); // Pass cookie if needed

                    console.log(`${currentItemLogPrefix} ✅ Completed. Result:`, {
                        success: downloadResult.success,
                        title: downloadResult.title,
                        filename: downloadResult.filename
                    });

                    results.push({ index: i, url, status: 'completed', result: downloadResult });

                    // Optional: Add a small delay between downloads
                    if (i < urls.length - 1) {
                       console.log(`${currentItemLogPrefix} ⏳ Waiting 2 seconds before next download...`);
                       await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (itemError) {
                    console.error(`${currentItemLogPrefix} ❌ Failed.`, url, itemError.message);
                    results.push({ index: i, url, status: 'failed', error: itemError.message });

                    // Continue with the next item even if one fails
                }
            }

            console.log(`🏁 Background Task: Batch processing finished for ${numUrls} videos.`);
            console.log('--- BATCH RESULTS SUMMARY ---');
            results.forEach(r => {
                if (r.status === 'completed') {
                    console.log(`   Item ${r.index + 1}: ✅ ${r.result.title || r.result.filename}`);
                } else {
                    console.log(`   Item ${r.index + 1}: ❌ ${r.url} - ${r.error}`);
                }
            });
            console.log('------------------------------');
            // Here you could potentially emit events or store results for later retrieval
            // if you implement real-time updates (e.g., with WebSockets).

        })(); // Invoke the async function immediately

    } catch (backgroundError) {
        // This catch block handles errors in setting up the background task itself,
        // NOT errors during the downloading of individual videos.
        // Since we've already sent the response, we can only log.
        console.error("🔥 UNEXPECTED ERROR in batch background setup:", backgroundError);
        // Cannot send a response here as it's already been sent.
        // The client has been informed that the job started.
    }
});

// Serve main pages
app.get('/', (req, res) => {
    console.log('GET / - Serving main page');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/batch.html', (req, res) => {
    console.log('GET /batch.html');
    res.sendFile(path.join(__dirname, 'public', 'batch.html'));
});

// Add endpoint to list downloaded files
app.get('/api/downloads', (req, res) => {
    try {
        const files = fs.readdirSync(downloadsDir);
        res.json({
            success: true,
            files: files,
            downloadsDir: downloadsDir
        });
    } catch (error) {
        res.status(500).json({ error: 'Could not read downloads directory' });
    }
});

// Catch all 404s
app.use('*', (req, res) => {
    console.log('404 for:', req.path);
    res.status(404).json({ 
        error: 'Not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// CRITICAL: Bind to 0.0.0.0 as required by Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Downloads directory:', downloadsDir);
    console.log('Real downloads enabled:', realDownloadsEnabled);
});

console.log('=== SERVER SETUP COMPLETE ===');