const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Serve downloaded videos
app.use('/downloads', express.static('downloads'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
}

// Helper function to get the most recent file
function getMostRecentFile(dir) {
    try {
        const files = fs.readdirSync(dir);
        if (files.length === 0) return null;
        
        const recentFiles = files
            .map(file => ({ file, mtime: fs.statSync(path.join(dir, file)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
        
        return recentFiles[0] ? recentFiles[0].file : null;
    } catch (error) {
        console.error('Error reading directory:', error);
        return null;
    }
}

// Download function
function downloadVideo(url, format = 'best') {
    return new Promise((resolve, reject) => {
        // Use downloaded yt-dlp
        const ytDlpPath = path.join(__dirname, 'yt-dlp');
        
        // Check if yt-dlp exists
        if (!fs.existsSync(ytDlpPath)) {
            return reject(new Error('yt-dlp not found. Please download it and place it in the project root.'));
        }
        
        // Ensure downloads directory exists
        const downloadsDirectory = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDirectory)) {
            fs.mkdirSync(downloadsDirectory, { recursive: true });
        }
        
        // Get initial file count
        const initialFiles = fs.readdirSync(downloadsDirectory);
        
        console.log('Starting download for:', url);
        
        // Spawn yt-dlp process
        const ytDlpProcess = spawn(ytDlpPath, [
            url,
            '-f', 'bv*+ba/b',
            '-o', path.join(downloadsDirectory, '%(title)s.%(ext)s'),
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
                    const finalFiles = fs.readdirSync(downloadsDirectory);
                    const newFiles = finalFiles.filter(file => !initialFiles.includes(file));
                    
                    if (newFiles.length > 0) {
                        const filename = newFiles[0];
                        const downloadUrl = `/downloads/${encodeURIComponent(filename)}`;
                        
                        resolve({
                            success: true,
                            title: filename.replace(/\.[^/.]+$/, ""),
                            downloadUrl: downloadUrl,
                            filename: filename
                        });
                    } else {
                        // Fallback to most recent file
                        const recentFile = getMostRecentFile(downloadsDirectory);
                        if (recentFile) {
                            const downloadUrl = `/downloads/${encodeURIComponent(recentFile)}`;
                            resolve({
                                success: true,
                                title: recentFile.replace(/\.[^/.]+$/, ""),
                                downloadUrl: downloadUrl,
                                filename: recentFile
                            });
                        } else {
                            reject(new Error('File not found after download'));
                        }
                    }
                } catch (fileError) {
                    reject(new Error('Could not read downloads directory: ' + fileError.message));
                }
            } else {
                reject(new Error(`Download failed with code ${code}: ${errorOutput || 'Unknown error'}`));
            }
        });
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

// Download endpoints
app.post('/api/download/youtube', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        console.log('YouTube download requested for:', url);
        const result = await downloadVideo(url, 'bv*+ba/b');
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
    
    try {
        console.log('Instagram download requested for:', url);
        const result = await downloadVideo(url, 'bv*+ba/b');
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
    
    try {
        console.log('TikTok download requested for:', url);
        const result = await downloadVideo(url, 'bv*+ba/b');
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
    
    try {
        console.log('Twitter download requested for:', url);
        const result = await downloadVideo(url, 'bv*+ba/b');
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
    
    try {
        console.log('Generic download requested for:', url);
        const result = await downloadVideo(url, 'bv*+ba/b');
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
    console.log('GET /');
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Test URLs:');
    console.log(`  http://localhost:${PORT}/`);
    console.log(`  http://localhost:${PORT}/api/platforms`);
    console.log(`  http://localhost:${PORT}/health`);
});