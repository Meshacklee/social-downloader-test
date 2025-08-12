const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve downloaded videos
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    console.log('Created downloads directory');
}

// Check if real downloads are enabled
const realDownloadsEnabled = fs.existsSync(path.join(__dirname, 'ENABLE_REAL_DOWNLOADS'));
console.log('Real downloads enabled:', realDownloadsEnabled);

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
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        realDownloads: realDownloadsEnabled
    });
});

// === DOWNLOAD FUNCTION WITH SAFETY CHECKS ===
function downloadVideo(url) {
    return new Promise((resolve, reject) => {
        // If real downloads aren't enabled, simulate
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
        
        // Real download functionality
        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        
        // Check if yt-dlp exists
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
        
        console.log('Starting real download for:', url);
        
        // Spawn yt-dlp process
        const ytDlpProcess = spawn(ytDlpPath, [
            url,
            '-f', 'bv*+ba/b',
            '-o', path.join(downloadsDir, '%(title)s.%(ext)s'),
            '--newline',
            '--no-check-certificate'
        ]);
        
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
                // Success - find the downloaded file
                try {
                    const files = fs.readdirSync(downloadsDir);
                    if (files.length > 0) {
                        // Get the most recent file
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
                // Create error file for user to see what went wrong
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

// Download endpoints
app.post('/api/download/youtube', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/youtube - URL:', url);
    
    try {
        const result = await downloadVideo(url);
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
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/instagram - URL:', url);
    
    try {
        const result = await downloadVideo(url);
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
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/tiktok - URL:', url);
    
    try {
        const result = await downloadVideo(url);
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
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/twitter - URL:', url);
    
    try {
        const result = await downloadVideo(url);
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
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download - URL:', url);
    
    try {
        const result = await downloadVideo(url);
        res.json(result);
    } catch (error) {
        console.error('Generic download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different video URL or check if the content is publicly available.'
        });
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