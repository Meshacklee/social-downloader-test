const express = require('express');
const path = require('path');
const fs = require('fs');

console.log('=== SERVER STARTING ===');
console.log('Current directory:', __dirname);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Serve static files FIRST
app.use(express.static(path.join(__dirname, 'public')));

// Serve downloaded videos (this creates the /downloads route)
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
            { name: 'YouTube', icon: '📺' },
            { name: 'Test', icon: '✅' }
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

// === CREATE A SAMPLE VIDEO FILE ===
function createSampleVideo() {
    const sampleVideoPath = path.join(__dirname, 'downloads', 'sample-video.mp4');
    
    // Only create if it doesn't exist
    if (!fs.existsSync(sampleVideoPath)) {
        // Create a small sample file (just some text for now)
        fs.writeFileSync(sampleVideoPath, 'This is a sample video file. In a real app, this would be an actual video downloaded by yt-dlp.');
        console.log('Created sample video file');
    }
    
    return '/downloads/sample-video.mp4';
}

// === REALISTIC SIMULATED DOWNLOAD FUNCTION ===
function simulateDownload(url) {
    return new Promise((resolve) => {
        setTimeout(() => {
            // Create the sample file
            const downloadUrl = createSampleVideo();
            
            resolve({
                success: true,
                title: 'Sample Video Title',
                downloadUrl: downloadUrl,  // This will be /downloads/sample-video.mp4
                filename: 'sample-video.mp4'
            });
        }, 2000);
    });
}

// YouTube download endpoint
app.post('/api/download/youtube', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/youtube - URL:', url);
    
    try {
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('YouTube download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Other download endpoints
app.post('/api/download/instagram', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/instagram - URL:', url);
    
    try {
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('Instagram download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.post('/api/download/tiktok', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/tiktok - URL:', url);
    
    try {
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('TikTok download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.post('/api/download/twitter', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/twitter - URL:', url);
    
    try {
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('Twitter download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download - URL:', url);
    
    try {
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('Generic download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// === SERVE MAIN PAGES ===
app.get('/', (req, res) => {
    console.log('GET / - Serving main page');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/batch.html', (req, res) => {
    console.log('GET /batch.html');
    res.sendFile(path.join(__dirname, 'public', 'batch.html'));
});

// Catch all 404s (this should be LAST)
app.use('*', (req, res) => {
    console.log('404 for:', req.path);
    res.status(404).json({ 
        error: 'Not found',
        path: req.path
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('Available endpoints:');
    console.log('  / - Main page');
    console.log('  /batch.html - Batch download page');
    console.log('  /api/platforms - Platform list');
    console.log('  /health - Health check');
    console.log('  /downloads/sample-video.mp4 - Sample download');
});

console.log('=== SERVER SETUP COMPLETE ===');