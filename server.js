const express = require('express');
const path = require('path');
const fs = require('fs');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve downloaded videos
app.use('/downloads', express.static('downloads'));

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

// === REAL DOWNLOAD FUNCTIONALITY ===
function simulateDownload(url) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const filename = 'sample-video.mp4';
            const downloadUrl = '/downloads/' + filename;
            resolve({
                success: true,
                title: 'Sample Video Title',
                downloadUrl: downloadUrl,
                filename: filename
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
        // For now, simulate download
        const result = await simulateDownload(url);
        res.json(result);
    } catch (error) {
        console.error('YouTube download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Other download endpoints (simulated)
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
    console.log('Available endpoints:');
    console.log('  / - Main page');
    console.log('  /batch.html - Batch download page');
    console.log('  /api/platforms - Platform list');
    console.log('  /health - Health check');
    console.log('  /api/download/youtube - YouTube download');
});

console.log('=== SERVER SETUP COMPLETE ===');