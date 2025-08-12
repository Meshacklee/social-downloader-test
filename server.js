const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');

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

// Download yt-dlp if it doesn't exist
async function ensureYtDlp() {
    const ytDlpPath = path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    
    if (fs.existsSync(ytDlpPath)) {
        console.log('yt-dlp found at:', ytDlpPath);
        return ytDlpPath;
    }
    
    console.log('Downloading yt-dlp...');
    
    const downloadUrl = process.platform === 'win32' 
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(ytDlpPath);
        
        https.get(downloadUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download yt-dlp: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                
                // Make executable on Unix systems
                if (process.platform !== 'win32') {
                    fs.chmodSync(ytDlpPath, 0o755);
                }
                
                console.log('yt-dlp downloaded successfully');
                resolve(ytDlpPath);
            });
        }).on('error', (err) => {
            fs.unlink(ytDlpPath, () => {}); // Delete incomplete file
            reject(err);
        });
    });
}

// Get video info without downloading
function getVideoInfo(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const ytDlpPath = await ensureYtDlp();
            
            console.log('Getting video info for:', url);
            
            const ytDlpProcess = spawn(ytDlpPath, [
                url,
                '--dump-json',
                '--no-warnings',
                '--no-check-certificate'
            ]);
            
            let output = '';
            let errorOutput = '';
            
            ytDlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            ytDlpProcess.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    try {
                        const videoInfo = JSON.parse(output.trim());
                        resolve({
                            title: videoInfo.title || 'Unknown Title',
                            duration: videoInfo.duration || 0,
                            uploader: videoInfo.uploader || 'Unknown',
                            thumbnail: videoInfo.thumbnail || null,
                            formats: videoInfo.formats?.length || 0
                        });
                    } catch (parseError) {
                        reject(new Error('Failed to parse video info'));
                    }
                } else {
                    reject(new Error(`Failed to get video info: ${errorOutput || 'Unknown error'}`));
                }
            });
            
            ytDlpProcess.on('error', (err) => {
                reject(new Error(`Process error: ${err.message}`));
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// Enhanced download function with progress tracking
function downloadVideo(url, options = {}) {
    return new Promise(async (resolve, reject) => {
        try {
            const ytDlpPath = await ensureYtDlp();
            
            console.log('Starting download for:', url);
            
            // Build yt-dlp arguments
            const args = [
                url,
                '--newline',
                '--no-check-certificate',
                '--no-warnings'
            ];
            
            // Quality selection
            if (options.quality === 'best') {
                args.push('-f', 'best[ext=mp4]/best');
            } else if (options.quality === 'audio') {
                args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
            } else {
                args.push('-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b');
            }
            
            // Output template
            const outputTemplate = path.join(downloadsDir, '%(title)s.%(ext)s');
            args.push('-o', outputTemplate);
            
            // Additional options
            if (options.extractAudio) {
                args.push('--extract-audio', '--audio-format', 'mp3');
            }
            
            if (options.writeSubtitles) {
                args.push('--write-subs', '--sub-lang', 'en');
            }
            
            console.log('yt-dlp command:', ytDlpPath, args.join(' '));
            
            const ytDlpProcess = spawn(ytDlpPath, args);
            
            let output = '';
            let errorOutput = '';
            let downloadProgress = 0;
            
            ytDlpProcess.on('error', (err) => {
                console.error('yt-dlp process error:', err);
                reject(new Error(`Failed to start yt-dlp: ${err.message}`));
            });
            
            ytDlpProcess.stdout.on('data', (data) => {
                const dataStr = data.toString();
                output += dataStr;
                
                // Parse download progress
                const progressMatch = dataStr.match(/(\d+\.?\d*)%/);
                if (progressMatch) {
                    downloadProgress = parseFloat(progressMatch[1]);
                    console.log(`Download progress: ${downloadProgress}%`);
                }
                
                console.log('yt-dlp output:', dataStr.trim());
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                const dataStr = data.toString();
                errorOutput += dataStr;
                console.log('yt-dlp stderr:', dataStr.trim());
            });
            
            ytDlpProcess.on('close', (code) => {
                console.log(`yt-dlp process exited with code ${code}`);
                
                if (code === 0) {
                    // Success - find the downloaded file
                    try {
                        const files = fs.readdirSync(downloadsDir)
                            .filter(file => !file.startsWith('.'));
                        
                        if (files.length > 0) {
                            // Get the most recent file
                            const recentFiles = files
                                .map(file => ({ 
                                    file, 
                                    mtime: fs.statSync(path.join(downloadsDir, file)).mtime,
                                    size: fs.statSync(path.join(downloadsDir, file)).size
                                }))
                                .sort((a, b) => b.mtime - a.mtime);
                            
                            const recentFile = recentFiles[0];
                            const downloadUrl = `/downloads/${encodeURIComponent(recentFile.file)}`;
                            
                            resolve({
                                success: true,
                                title: recentFile.file.replace(/\.[^/.]+$/, ""),
                                downloadUrl: downloadUrl,
                                filename: recentFile.file,
                                fileSize: recentFile.size,
                                progress: 100
                            });
                        } else {
                            reject(new Error('No files found after download'));
                        }
                    } catch (fileError) {
                        reject(new Error('Could not read downloads directory: ' + fileError.message));
                    }
                } else {
                    // Handle specific error codes
                    let errorMessage = `Download failed with code ${code}`;
                    
                    if (errorOutput.includes('Video unavailable')) {
                        errorMessage = 'Video is unavailable or has been removed';
                    } else if (errorOutput.includes('Private video')) {
                        errorMessage = 'Video is private and cannot be downloaded';
                    } else if (errorOutput.includes('Sign in to confirm your age')) {
                        errorMessage = 'Video requires age verification';
                    } else if (errorOutput.includes('This video is not available')) {
                        errorMessage = 'Video is not available in your region';
                    } else if (errorOutput.trim()) {
                        errorMessage += `: ${errorOutput.trim()}`;
                    }
                    
                    reject(new Error(errorMessage));
                }
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// API Routes
app.get('/api/platforms', (req, res) => {
    console.log('GET /api/platforms');
    res.json({
        platforms: [
            { name: 'YouTube', key: 'youtube', icon: '📺' },
            { name: 'Instagram', key: 'instagram', icon: '📱' },
            { name: 'TikTok', key: 'tiktok', icon: '🎵' },
            { name: 'Twitter/X', key: 'twitter', icon: '🐦' },
            { name: 'Facebook', key: 'facebook', icon: '📘' },
            { name: 'Vimeo', key: 'vimeo', icon: '🎬' },
            { name: 'Other Platforms', key: 'generic', icon: '🔗' }
        ]
    });
});

app.get('/health', (req, res) => {
    console.log('GET /health');
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        ytdlp: fs.existsSync(path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'))
    });
});

// Video info endpoint
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/info - URL:', url);
    
    try {
        const info = await getVideoInfo(url);
        res.json(info);
    } catch (error) {
        console.error('Video info error:', error);
        res.status(500).json({ 
            error: error.message
        });
    }
});

// Enhanced download endpoints
app.post('/api/download/youtube', async (req, res) => {
    const { url, quality = 'best', extractAudio = false, writeSubtitles = false } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/youtube - URL:', url, 'Quality:', quality);
    
    try {
        const result = await downloadVideo(url, { quality, extractAudio, writeSubtitles });
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
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/instagram - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality });
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
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/tiktok - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality });
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
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/twitter - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality });
        res.json(result);
    } catch (error) {
        console.error('Twitter download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Try a different Twitter video or check if the video is public.'
        });
    }
});

app.post('/api/download/facebook', async (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/facebook - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality });
        res.json(result);
    } catch (error) {
        console.error('Facebook download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Facebook videos might require login. Try a public video.'
        });
    }
});

app.post('/api/download/vimeo', async (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/vimeo - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality });
        res.json(result);
    } catch (error) {
        console.error('Vimeo download error:', error);
        res.status(500).json({ 
            error: error.message,
            tip: 'Some Vimeo videos are password protected or private.'
        });
    }
});

// Generic download endpoint
app.post('/api/download', async (req, res) => {
    const { url, quality = 'best', extractAudio = false, writeSubtitles = false } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download - URL:', url);
    
    try {
        const result = await downloadVideo(url, { quality, extractAudio, writeSubtitles });
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
app.post('/api/download/batch', async (req, res) => {
    const { urls, quality = 'best' } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'URLs array is required' });
    }
    
    console.log('POST /api/download/batch - URLs:', urls.length);
    
    const results = [];
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            console.log(`Processing ${i + 1}/${urls.length}: ${url}`);
            const result = await downloadVideo(url, { quality });
            results.push({ url, ...result });
        } catch (error) {
            console.error(`Batch download error for ${url}:`, error);
            results.push({ 
                url, 
                success: false, 
                error: error.message 
            });
        }
    }
    
    res.json({ 
        success: true, 
        results,
        total: urls.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
    });
});

// List downloaded files
app.get('/api/downloads', (req, res) => {
    try {
        const files = fs.readdirSync(downloadsDir)
            .filter(file => !file.startsWith('.'))
            .map(file => {
                const filePath = path.join(downloadsDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    created: stats.birthtime,
                    downloadUrl: `/downloads/${encodeURIComponent(file)}`
                };
            })
            .sort((a, b) => b.created - a.created);
        
        res.json({ files });
    } catch (error) {
        res.status(500).json({ error: 'Failed to list downloads' });
    }
});

// Delete downloaded file
app.delete('/api/downloads/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(downloadsDir, filename);
    
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'File deleted' });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete file' });
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

// Initialize yt-dlp on startup
ensureYtDlp()
    .then((path) => {
        console.log('yt-dlp ready at:', path);
    })
    .catch((error) => {
        console.error('Failed to initialize yt-dlp:', error);
    });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

console.log('=== SERVER SETUP COMPLETE ===');