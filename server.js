const express = require('express');
const path = require('path');

console.log('=== SERVER STARTING ===');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

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

// === ADD THESE MISSING DOWNLOAD ROUTES ===
app.post('/api/download/youtube', (req, res) => {
    console.log('POST /api/download/youtube');
    res.status(400).json({ 
        error: 'YouTube download temporarily disabled - backend setup needed',
        tip: 'Backend yt-dlp integration required'
    });
});

app.post('/api/download/instagram', (req, res) => {
    console.log('POST /api/download/instagram');
    res.status(400).json({ 
        error: 'Instagram download temporarily disabled - backend setup needed',
        tip: 'Backend yt-dlp integration required'
    });
});

app.post('/api/download/tiktok', (req, res) => {
    console.log('POST /api/download/tiktok');
    res.status(400).json({ 
        error: 'TikTok download temporarily disabled - backend setup needed',
        tip: 'Backend yt-dlp integration required'
    });
});

app.post('/api/download/twitter', (req, res) => {
    console.log('POST /api/download/twitter');
    res.status(400).json({ 
        error: 'Twitter download temporarily disabled - backend setup needed',
        tip: 'Backend yt-dlp integration required'
    });
});

app.post('/api/download', (req, res) => {
    console.log('POST /api/download');
    res.status(400).json({ 
        error: 'Generic download temporarily disabled - backend setup needed',
        tip: 'Backend yt-dlp integration required'
    });
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
    console.log('  /api/download/instagram - Instagram download');
    console.log('  /api/download/tiktok - TikTok download');
    console.log('  /api/download/twitter - Twitter download');
});

console.log('=== SERVER SETUP COMPLETE ===');