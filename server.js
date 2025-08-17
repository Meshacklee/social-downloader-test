const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const multer = require('multer');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Serve downloaded videos
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Serve cookie files (only for internal use)
app.use('/cookies', express.static(path.join(__dirname, 'cookies')));

// Ensure directories exist
const downloadsDir = path.join(__dirname, 'downloads');
const cookiesDir = path.join(__dirname, 'cookies');

[downloadsDir, cookiesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

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
        
        console.log('Downloading yt-dlp...');
        // Fixed: Removed extra spaces in the curl command
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
        ytDlpExecutable: ytDlpExists ? (ytDlpExecutable & 0o111) !== 0 : false
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
                        const recentFiles = files
                            .map(file => ({ file, mtime: fs.statSync(path.join(downloadsDir, file)).mtime }))
                            .sort((a, b) => b.mtime - a.mtime);
                        
                        const recentFile = recentFiles[0].file;
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

// Batch download endpoint - FIXED VERSION
// Replace your existing batch endpoint with this one
app.post('/api/download/batch', async (req, res) => {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }
    
    console.log('Batch download requested for', urls.length, 'videos');
    
    try {
        // Return success response immediately
        res.json({
            success: true,
            message: `Batch download started for ${urls.length} videos`,
            total: urls.length
        });
        
        // Process videos sequentially in background
        process.nextTick(async () => {
            console.log('Starting sequential batch download for', urls.length, 'videos');
            
            for (let i = 0; i < urls.length; i++) {
                const url = urls[i];
                console.log(`Processing video ${i + 1}/${urls.length}:`, url);
                
                try {
                    // Download the video
                    const result = await downloadVideo(url, null);
                    
                    if (result.success) {
                        console.log(`Successfully downloaded video ${i + 1}:`, result.title);
                    } else {
                        console.log(`Failed to download video ${i + 1}:`, result);
                    }
                    
                    // Add delay between downloads
                    if (i < urls.length - 1) {
                        console.log('Waiting 2 seconds before next download...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                } catch (error) {
                    console.error(`Error processing video ${i + 1}:`, url, error.message);
                }
            }
            
            console.log('Batch download processing completed for all videos');
        });
    } catch (error) {
        console.error('Batch download error:', error);
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Real downloads enabled:', realDownloadsEnabled);
});

console.log('=== SERVER SETUP COMPLETE ===');


// Add this endpoint to list downloaded files
app.get('/api/downloads', (req, res) => {
    try {
        const files = fs.readdirSync(downloadsDir);
        const downloadFiles = files.map(file => ({
            name: file,
            url: `/downloads/${file}`,
            size: fs.statSync(path.join(downloadsDir, file)).size,
            modified: fs.statSync(path.join(downloadsDir, file)).mtime
        })).sort((a, b) => b.modified - a.modified);
        
        res.json({
            success: true,
            files: downloadFiles
        });
    } catch (error) {
        res.status(500).json({ error: 'Could not read downloads directory' });
    }
});