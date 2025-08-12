const express = require('express');
const path = require('path');
const fs = require('fs');

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

// === SAFE DOWNLOAD FUNCTION (TEXT FILE) ===
function safeDownload(url) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const timestamp = new Date().getTime();
            const filename = `video-${timestamp}.txt`;
            const filePath = path.join(downloadsDir, filename);
            
            const content = `Video Download Request Received!\n\nURL: ${url}\n\nIn a PRODUCTION version, this would be an actual video file.\n\nRequest received at: ${new Date().toISOString()}\n\nTo enable real downloads:\n1. Add a file named 'ENABLE_REAL_DOWNLOADS' to your project\n2. Deploy the update\n3. Try downloading again`;
            fs.writeFileSync(filePath, content);
            
            resolve({
                success: true,
                title: 'Download Request Received',
                downloadUrl: `/downloads/${filename}`,
                filename: filename,
                message: 'This is a simulation. Add ENABLE_REAL_DOWNLOADS file to enable real downloads.'
            });
        }, 1000);
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
        const result = await safeDownload(url);
        res.json(result);
    } catch (error) {
        console.error('YouTube download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

app.post('/api/download/instagram', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log('POST /api/download/instagram - URL:', url);
    
    try {
        const result = await safeDownload(url);
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
        const result = await safeDownload(url);
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
        const result = await safeDownload(url);
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
        const result = await safeDownload(url);
        res.json(result);
    } catch (error) {
        console.error('Generic download error:', error);
        res.status(500).json({ error: 'Download failed' });
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