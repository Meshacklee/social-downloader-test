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
        timestamp: new Date().toISOString()
    });
});

// === ENHANCED DOWNLOAD FUNCTION WITH YT-DLP ===
function downloadVideo(url, options = {}) {
    return new Promise((resolve, reject) => {
        // Default options
        const {
            format = 'bv*+ba/b',  // Best video + best audio / best combined
            quality = 'best',    // Default quality
            platform = 'generic' // Platform-specific options
        } = options;
        
        // Try to find yt-dlp in different locations
        const possiblePaths = [
            path.join(__dirname, 'yt-dlp'),
            path.join(__dirname, 'yt-dlp.exe'),
            '/usr/local/bin/yt-dlp',
            '/usr/bin/yt-dlp',
            'yt-dlp'  // Try from PATH
        ];
        
        let ytDlpPath = null;
        for (const possiblePath of possiblePaths) {
            try {
                fs.accessSync(possiblePath, fs.constants.F_OK | fs.constants.X_OK);
                ytDlpPath = possiblePath;
                break;
            } catch (err) {
                // Continue to next path
            }
        }
        
        if (!ytDlpPath) {
            return reject(new Error('yt-dlp executable not found. Please install yt-dlp first.'));
        }
        
        console.log('Using yt-dlp at:', ytDlpPath);
        console.log('Starting real download for:', url);
        
        // Generate a unique ID for this download
        const downloadId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const tempOutputPath = path.join(downloadsDir, `${downloadId}.%(title)s.%(ext)s`);
        
        // Build yt-dlp arguments based on platform and options
        const args = [
            url,
            '-f', format,
            '-o', tempOutputPath,
            '--newline',
            '--no-check-certificate',
            '--no-playlist',
            '--restrict-filenames'
        ];
        
        // Add platform-specific options
        switch (platform) {
            case 'youtube':
                args.push('--add-metadata', '--embed-thumbnail');
                break;
            case 'instagram':
                args.push('--add-metadata');
                break;
            case 'tiktok':
                args.push('--add-metadata');
                break;
            case 'twitter':
                args.push('--add-metadata');
                break;
        }
        
        // Spawn yt-dlp process
        const ytDlpProcess = spawn(ytDlpPath, args);
        
        let output = '';
        let errorOutput = '';
        let progress = 0;
        let filename = '';
        
        ytDlpProcess.on('error', (err) => {
            console.error('yt-dlp process error:', err);
            reject(new Error(`Failed to start yt-dlp: ${err.message}`));
        });
        
        ytDlpProcess.stdout.on('data', (data) => {
            const outputStr = data.toString();
            output += outputStr;
            
            // Parse progress from output
            const progressMatch = outputStr.match(/\[download\]\s+(\d+\.\d+)%/);
            if (progressMatch) {
                progress = parseFloat(progressMatch[1]);
            }
            
            // Extract filename if available
            const filenameMatch = outputStr.match(/\[download\] Destination: (.+)$/m);
            if (filenameMatch) {
                filename = path.basename(filenameMatch[1]);
            }
            
            console.log('yt-dlp output:', outputStr.trim());
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
                    let finalFilename = filename;
                    
                    // If we don't have the filename from output, find the most recent file
                    if (!finalFilename) {
                        const files = fs.readdirSync(downloadsDir)
                            .filter(file => file.startsWith(downloadId))
                            .map(file => ({ 
                                file, 
                                mtime: fs.statSync(path.join(downloadsDir, file)).mtime 
                            }))
                            .sort((a, b) => b.mtime - a.mtime);
                        
                        if (files.length === 0) {
                            return reject(new Error('Downloaded file not found'));
                        }
                        
                        finalFilename = files[0].file;
                    }
                    
                    // Rename file to remove download ID prefix
                    const oldPath = path.join(downloadsDir, finalFilename);
                    const newFilename = finalFilename.replace(`${downloadId}.`, '');
                    const newPath = path.join(downloadsDir, newFilename);
                    
                    try {
                        fs.renameSync(oldPath, newPath);
                    } catch (renameErr) {
                        console.warn('Could not rename file:', renameErr.message);
                        // Continue with original filename if rename fails
                    }
                    
                    const downloadUrl = `/downloads/${encodeURIComponent(newFilename)}`;
                    
                    resolve({
                        success: true,
                        title: newFilename.replace(/\.[^/.]+$/, ""),
                        downloadUrl: downloadUrl,
                        filename: newFilename,
                        progress: 100
                    });
                } catch (fileError) {
                    reject(new Error('Could not process downloaded file: ' + fileError.message));
                }
            } else {
                reject(new Error(`Download failed with code ${code}: ${errorOutput || 'Unknown error'}`));
            }
        });
    });
}

// Download endpoints
app.post('/api/download/youtube', async (req, res) => {
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/youtube - URL:', url);
    
    try {
        const result = await downloadVideo(url, { 
            platform: 'youtube',
            quality
        });
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
        const result = await downloadVideo(url, { 
            platform: 'instagram'
        });
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
        const result = await downloadVideo(url, { 
            platform: 'tiktok'
        });
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
        const result = await downloadVideo(url, { 
            platform: 'twitter'
        });
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
    const { url, quality = 'best' } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download - URL:', url);
    
    try {
        const result = await downloadVideo(url, { 
            platform: 'generic',
            quality
        });
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
});

console.log('=== SERVER SETUP COMPLETE ===');